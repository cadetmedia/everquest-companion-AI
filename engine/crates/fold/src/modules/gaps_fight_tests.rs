//! The fight numbers on log lines as the game prints them, read by the real parser.

use super::MobFights;
use crate::event::Event;
use serde_json::{json, Value};

/// Folds the lines as gaps.rs hands them over: the zone, the combat lines, the deaths.
fn fold_into(f: &mut MobFights, text: &str) {
    let tz = "UTC".parse::<eqlog::Tz>().expect("a zone");
    let parser = eqlog::Parser::new(eqlog::Clock::new(tz), None, Some("Drywrought".to_string()));
    let bytes = format!("{text}\n");
    eqlog::scan::scan_bytes(&parser, bytes.as_bytes(), |line, _| {
        let ev = Event::from_json(line).expect("an event");
        feed(f, &ev);
    });
}

fn feed(f: &mut MobFights, ev: &Event) {
    match ev.kind() {
        "zone" => f.zone(ev.str("zone")),
        "damage" | "miss" => f.event(ev),
        "death" => f.death(ev),
        _ => {}
    }
}

/// `[Fri Oct 23 HH:MM:SS 2026] text` at `s` seconds past 01:00:00.
fn at(s: u32, text: &str) -> String {
    format!(
        "[Fri Oct 23 {:02}:{:02}:{:02} 2026] {text}",
        1 + s / 3600,
        (s / 60) % 60,
        s % 60
    )
}

/// One whole fight with Guard S`Tal starting at `s`: 600 damage taken, a round of two swings.
fn guard_fight(s: u32) -> Vec<String> {
    vec![
        at(s, "Gonekn slashes Guard S`Tal for 209 points of damage."),
        at(s, "Guard S`Tal slashes Gonekn for 107 points of damage."),
        at(s, "Guard S`Tal tries to slash Gonekn, but Gonekn parries!"),
        at(s, "Guard S`Tal cleaves Gonekn for 35 points of damage."),
        at(s, "Guard S`Tal kicks Gonekn for 12 points of damage."),
        at(
            s + 2,
            "You hit Guard S`Tal for 207 points of cold damage by Ice Spear.",
        ),
        at(
            s + 2,
            "Guard S`Tal hit You for 300 points of fire damage by Flame Lick.",
        ),
        at(
            s + 4,
            "Guard S`Tal has taken 90 damage from Envenomed Breath by Gonekn.",
        ),
        at(s + 4, "Gonekn slashes Guard S`Tal for 94 points of damage."),
        at(s + 4, "Guard S`Tal has been slain by Gonekn!"),
    ]
}

/// The log opens on something else, then a zone, so the fights below are seen from their first blow.
fn opening(zone: &str) -> Vec<String> {
    vec![
        at(0, "Welcome to EverQuest!"),
        at(1, &format!("You have entered {zone}.")),
    ]
}

fn served(lines: &[String]) -> Value {
    let mut f = MobFights::default();
    f.clear();
    fold_into(&mut f, &lines.join("\n"));
    f.of("guard s'tal").unwrap_or(Value::Null)
}

#[test]
fn whole_fights_give_the_median_hp_the_hit_range_the_kinds_and_the_swings() {
    let mut lines = opening("Cabilis East");
    for k in 0..10 {
        lines.extend(guard_fight(60 + k * 120));
    }
    let v = served(&lines);
    assert_eq!(v[0]["tier"], 0);
    assert_eq!(v[0]["kills"], 10);
    assert_eq!(v[0]["fights"], 10);
    assert_eq!(
        v[0]["hp"], 600,
        "melee, the spell, the DoT tick, everyone's: 209 + 207 + 90 + 94"
    );
    // A kick is a skill, never a hit; the mob's spell on you is no melee.
    assert_eq!(
        (v[0]["hitMin"].clone(), v[0]["hitMax"].clone()),
        (json!(35), json!(107))
    );
    assert_eq!(v[0]["attacks"], json!(["cleave", "kick", "slash"]));
    assert_eq!(
        v[0]["swings"], 2,
        "the slash and the parried slash; the cleave and the kick come beside the round"
    );
}

#[test]
fn a_fight_under_way_when_the_log_began_gives_no_hp() {
    // The log opens on a blow at the guard, before any zone line: that fight began before the log
    // saw it, somewhere it cannot place.
    let mut lines = vec![
        at(0, "Gonekn slashes Guard S`Tal for 209 points of damage."),
        at(1, "Guard S`Tal has been slain by Gonekn!"),
    ];
    lines.push(at(100, "You have entered Cabilis East."));
    lines.extend(guard_fight(200));
    let v = served(&lines);
    assert_eq!(
        v[0]["kills"], 1,
        "the first death is at no tier the log named"
    );
    assert_eq!(
        v[0]["fights"], 1,
        "only the second was seen from its first blow"
    );
    assert_eq!(v[0]["hp"], 600);
}

#[test]
fn two_of_one_name_fought_at_once_give_no_hp() {
    let mut lines = opening("Cabilis East");
    lines.extend(guard_fight(60));
    // A second guard, already in the fight, dies three seconds after the first.
    lines.push(at(
        66,
        "Gonekn slashes Guard S`Tal for 150 points of damage.",
    ));
    lines.push(at(67, "Guard S`Tal has been slain by Gonekn!"));
    lines.extend(guard_fight(300));
    // Two more guards at once, dying far apart: one swings at Gonekn, the other at you, in one second.
    lines.extend(guard_fight(500).into_iter().take(2));
    lines.push(at(500, "Guard S`Tal tries to slash YOU, but misses!"));
    lines.push(at(504, "Guard S`Tal has been slain by Gonekn!"));
    let v = served(&lines);
    assert_eq!(v[0]["kills"], 4);
    assert_eq!(v[0]["fights"], 1, "only the guard fought alone counts");
}

#[test]
fn tiers_are_never_mixed() {
    let mut lines = opening("Cabilis East");
    lines.extend(guard_fight(60));
    lines.push(at(200, "You have entered Cabilis East 4 (Refined)."));
    lines.push(at(
        260,
        "Gonekn slashes Guard S`Tal for 5000 points of damage.",
    ));
    lines.push(at(
        260,
        "Guard S`Tal crushes Gonekn for 900 points of damage.",
    ));
    lines.push(at(261, "Guard S`Tal has been slain by Gonekn!"));
    let v = served(&lines);
    assert_eq!(v.as_array().map(Vec::len), Some(2));
    assert_eq!(
        (
            v[0]["tier"].clone(),
            v[0]["hp"].clone(),
            v[0]["hitMax"].clone()
        ),
        (json!(0), json!(600), json!(107))
    );
    assert_eq!(
        (
            v[1]["tier"].clone(),
            v[1]["hp"].clone(),
            v[1]["hitMax"].clone()
        ),
        (json!(4), json!(5000), json!(900))
    );
    assert_eq!(v[1]["attacks"], json!(["crush"]));
}

#[test]
fn a_fight_left_idle_is_dropped_and_rampage_and_riposte_are_no_round() {
    let mut lines = opening("Cabilis East");
    // Struck once, then nothing for two minutes: whoever dies later is not that fight's.
    lines.push(at(
        60,
        "Gonekn slashes Guard S`Tal for 9999 points of damage.",
    ));
    lines.push(at(
        200,
        "Gonekn slashes Guard S`Tal for 300 points of damage.",
    ));
    lines.push(at(
        201,
        "Guard S`Tal slashes Gonekn for 50 points of damage. (Rampage)",
    ));
    lines.push(at(
        201,
        "Guard S`Tal slashes Gonekn for 51 points of damage. (Riposte)",
    ));
    lines.push(at(
        201,
        "Guard S`Tal slashes Gonekn for 52 points of damage.",
    ));
    lines.push(at(202, "Guard S`Tal has been slain by Gonekn!"));
    let v = served(&lines);
    assert_eq!(v[0]["hp"], 300);
    assert_eq!(
        v[0]["swings"],
        Value::Null,
        "one swing in its second, in one fight: two fights must show it"
    );
    assert_eq!(
        (
            v[0]["hitMin"].clone(),
            v[0]["hitMax"].clone(),
            v[0]["hits"].clone()
        ),
        (json!(50), json!(52), json!(3))
    );
}

/// The owner's log, measured: `EQ_FIGHT_LOG=<log> cargo test -p fold measure_a_real_log -- --ignored --nocapture`.
/// Prints each name with 10+ kills at any tier, by kills.
#[test]
#[ignore = "reads a real log named by EQ_FIGHT_LOG"]
fn measure_a_real_log() {
    let Ok(path) = std::env::var("EQ_FIGHT_LOG") else {
        return;
    };
    let bytes = std::fs::read(path).expect("the log");
    let tz = eqlog::host_timezone();
    let parser = eqlog::parser_for("Drywrought", tz);
    let mut f = MobFights::default();
    f.clear();
    eqlog::scan::scan_bytes(&parser, &bytes, |_, payload| {
        feed(&mut f, &Event::typed(payload))
    });
    let mut rows: Vec<(u64, String, Value)> = f
        .keys
        .keys()
        .filter_map(|k| f.of(k).map(|v| (k.clone(), v)))
        .map(|(k, v)| {
            (
                v.as_array().map_or(0, |a| {
                    a.iter().map(|t| t["kills"].as_u64().unwrap_or(0)).sum()
                }),
                k,
                v,
            )
        })
        .filter(|(n, _, _)| *n >= 10)
        .collect();
    rows.sort_by_key(|r| std::cmp::Reverse(r.0));
    for (_, k, v) in rows.iter().take(60) {
        println!("{k}\t{v}");
    }
}
