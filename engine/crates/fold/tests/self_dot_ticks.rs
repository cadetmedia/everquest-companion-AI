//! A DoT tick on the player outlives the fight that cast it. `You have taken 53 damage from Swarm
//! of Pain by a spiroc revolter.` keeps printing after the caster died, and once the fight has
//! closed such a tick must not open another: it would resolve the dead caster to a fresh instance
//! and engage it, a phantom fight against `a spiroc revolter#2`.

use fold::combat::{CombatEngine, SnapshotOpts};
use fold::event::Event;
use serde_json::{json, Value};

const MOB: &str = "a spiroc revolter";

fn tick(seq: i64, ts: i64) -> String {
    format!(
        r#"{{"kind":"damage","seq":{seq},"ts":{ts},"raw":"You have taken 53 damage from Swarm of Pain by {MOB}.","attacker":"{MOB}","target":"You","amount":53,"dtype":"dot","skill":"Swarm of Pain","crit":false,"category":"dot"}}"#
    )
}

fn fold(lines: &[String]) -> Value {
    fold_selecting(lines, None)
}

/// The snapshot with one segment (a fight id, or `zone`) selected.
fn fold_selecting(lines: &[String], selected: Option<&str>) -> Value {
    let mut e = CombatEngine::new();
    e.set_player_name("Primitive");
    for line in lines {
        e.on_event(&Event::from_json(line).expect("a JSON object"), false, None);
    }
    let last = lines.len() as i64;
    let opts = SnapshotOpts {
        selected_id: selected.map(str::to_string),
        ..SnapshotOpts::full()
    };
    e.snapshot(last, &opts, None)
}

/// Every segment that is a fight, open or closed: the zone session is not one.
fn fights(snap: &Value) -> Vec<Value> {
    snap["segments"]
        .as_array()
        .expect("segments")
        .iter()
        .filter(|s| s["kind"] != json!("zone"))
        .cloned()
        .collect()
}

fn the_fight_and_its_ticks(late_tick: Option<i64>) -> Vec<String> {
    let mut lines = vec![
        r#"{"kind":"zone","seq":0,"ts":0,"raw":"z","zone":"Najena"}"#.to_string(),
        format!(
            r#"{{"kind":"damage","seq":1,"ts":1000,"raw":"d","attacker":"You","target":"{MOB}","amount":500,"dtype":"melee","skill":"Melee","crit":false}}"#
        ),
        tick(2, 1500),
        format!(r#"{{"kind":"death","seq":3,"ts":2000,"raw":"d","name":"{MOB}","bySelf":true}}"#),
    ];
    lines.extend(late_tick.map(|ts| tick(4, ts)));
    lines
}

#[test]
fn a_tick_inside_the_fight_is_booked_and_one_after_it_closed_opens_nothing() {
    // The fight alone: one fight, and the tick inside it is part of it.
    let base = fights(&fold(&the_fight_and_its_ticks(None)));
    assert_eq!(base.len(), 1, "{base:?}");
    // The caster's last tick lands well past the linger: still the one fight, unchanged.
    let after = fights(&fold(&the_fight_and_its_ticks(Some(14_000))));
    assert_eq!(after.len(), 1, "a phantom fight opened: {after:?}");
    assert_eq!(after[0]["startTs"], json!(1000), "{after:?}");
    assert_eq!(after[0]["total"], base[0]["total"], "{after:?}");
}

/// Ticks from a caster that died keep landing inside the 5 s linger and after it. None may bring
/// the dead caster back: a fresh instance engaged by every tick held the fight open, and the next
/// pull joined it as `a gnoll +1`.
#[test]
fn ticks_from_a_dead_caster_neither_hold_the_fight_open_nor_merge_the_next_pull() {
    let mut lines = the_fight_and_its_ticks(None);
    for (seq, ts) in [(4, 4000), (5, 10_000), (6, 16_000)] {
        lines.push(tick(seq, ts));
    }
    lines.push(
        r#"{"kind":"damage","seq":7,"ts":27000,"raw":"d","attacker":"You","target":"a gnoll","amount":300,"dtype":"melee","skill":"Melee","crit":false}"#
            .to_string(),
    );
    let all = fights(&fold(&lines));
    assert_eq!(all.len(), 2, "the next pull merged: {all:?}");
    let starts: Vec<&Value> = all.iter().map(|f| &f["startTs"]).collect();
    assert!(starts.contains(&&json!(1000)), "{all:?}");
    assert!(starts.contains(&&json!(27000)), "{all:?}");
    // The tick inside the linger is still the dead caster's damage to you, in its fight.
    let first = fold_selecting(&lines, Some("e1"));
    assert_eq!(
        first["selected"]["inTotal"],
        json!(53 * 2),
        "{}",
        first["selected"]
    );
}

/// A tick after the fight closed opens nothing, but it is still damage you took in this zone: the
/// zone session counts it, as it counts environment damage taken with no fight open.
#[test]
fn a_tick_after_the_fight_closed_counts_in_the_zone_session() {
    let zone = fold_selecting(&the_fight_and_its_ticks(Some(14_000)), Some("zone"));
    let selected = &zone["selected"];
    assert_eq!(selected["inTotal"], json!(53 * 2), "{selected}");
}

fn hit(seq: i64, ts: i64, target: &str) -> String {
    format!(
        r#"{{"kind":"damage","seq":{seq},"ts":{ts},"raw":"d","attacker":"You","target":"{target}","amount":300,"dtype":"melee","skill":"Melee","crit":false}}"#
    )
}

fn killed(seq: i64, ts: i64, name: &str) -> String {
    format!(r#"{{"kind":"death","seq":{seq},"ts":{ts},"raw":"d","name":"{name}","bySelf":true}}"#)
}

/// (name, total) of every incoming row in the selected segment.
fn incoming(snap: &Value) -> Vec<(String, i64)> {
    snap["selected"]["incoming"]
        .as_array()
        .expect("incoming")
        .iter()
        .map(|r| {
            (
                r["name"].as_str().unwrap().to_string(),
                r["total"].as_i64().unwrap(),
            )
        })
        .collect()
}

/// A caster mezzed for longer than the staleness window is not dead: when it breaks and DoTs you
/// again it is fought, so the fight stays open past the gnoll's death while it still ticks.
#[test]
fn a_caster_that_breaks_mez_after_the_stale_window_is_fought_again() {
    let mut lines = vec![
        r#"{"kind":"zone","seq":0,"ts":0,"raw":"z","zone":"Najena"}"#.to_string(),
        hit(1, 1000, "a gnoll"),
        tick(2, 1500),
    ];
    let mut seq = 3;
    for ts in (6000..=40_000).step_by(5000) {
        lines.push(hit(seq, ts, "a gnoll"));
        seq += 1;
    }
    for ts in [30_000, 36_000] {
        lines.push(tick(seq, ts));
        seq += 1;
    }
    lines.push(killed(seq, 41_000, "a gnoll"));
    lines.push(tick(seq + 1, 42_000));
    lines.push(tick(seq + 2, 48_000));
    let all = fights(&fold(&lines));
    assert_eq!(all.len(), 1, "{all:?}");
    assert_eq!(
        all[0]["active"],
        json!(true),
        "the caster still ticking was let go: {all:?}"
    );
}

/// A second caster of the same name, after the first died, whose first contact is a DoT: a fresh
/// instance, fought, not the dead one's lingering tick.
#[test]
fn a_same_name_caster_after_the_first_died_is_a_fresh_instance() {
    let mut lines = the_fight_and_its_ticks(None);
    lines.extend([
        hit(4, 30_000, "a gnoll"),
        hit(5, 35_000, "a gnoll"),
        tick(6, 36_000),
        hit(7, 40_000, "a gnoll"),
        tick(8, 42_000),
        killed(9, 43_000, "a gnoll"),
        tick(10, 48_000),
    ]);
    let all = fights(&fold(&lines));
    assert_eq!(all.len(), 2, "{all:?}");
    let second = fold_selecting(&lines, Some("e2"));
    assert_eq!(
        second["selected"]["active"],
        json!(true),
        "{}",
        second["selected"]
    );
    let rows = incoming(&second);
    assert!(rows.contains(&(format!("{MOB} (2)"), 53 * 3)), "{rows:?}");
}
