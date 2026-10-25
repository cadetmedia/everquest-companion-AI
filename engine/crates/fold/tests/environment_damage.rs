//! `You were hit by non-melee for N damage.` is damage you took with no source named: lava, a trap,
//! a fall (owner, 2026-10-25: it counts). It books under one Environment row, in the open fight and
//! the zone session, and never opens, extends or names a fight. The lines are real shapes from the
//! owner's log: a lava duct crawler fought while burning, and a fall.

use eqlog::event::Ev;
use eqlog::{Clock, Parser, Tz};
use fold::combat::{CombatEngine, SnapshotOpts};
use fold::event::Event;
use serde_json::Value;

struct Run {
    parser: Parser,
    engine: CombatEngine,
    seq: i64,
}

impl Run {
    fn new() -> Self {
        let mut engine = CombatEngine::new();
        engine.set_player_name("Primitive");
        Run {
            parser: Parser::new(Clock::new(Tz::America__Los_Angeles), None, None),
            engine,
            seq: 0,
        }
    }

    fn feed(&mut self, lines: &[&str]) {
        for raw in lines {
            let mut ev = Ev::new();
            assert!(self.parser.parse_event(raw, self.seq, &mut ev), "{raw}");
            self.seq += 1;
            let ev = Event::from_json(ev.finish()).expect("a JSON object");
            self.engine.on_event(&ev, false, None);
        }
    }

    fn snapshot(&self, selected: Option<&str>) -> Value {
        let opts = SnapshotOpts {
            selected_id: selected.map(str::to_string),
            ..SnapshotOpts::full()
        };
        self.engine.snapshot(0, &opts, None)
    }
}

/// The instant a line is stamped with.
fn ts_of(raw: &str) -> i64 {
    let p = Parser::new(Clock::new(Tz::America__Los_Angeles), None, None);
    let mut ev = Ev::new();
    assert!(p.parse_event(raw, 0, &mut ev));
    let v: Value = serde_json::from_str(ev.finish()).unwrap();
    v["ts"].as_i64().unwrap()
}

/// The fights in a snapshot, the zone summary left out.
fn fights(snap: &Value) -> Vec<Value> {
    snap["segments"]
        .as_array()
        .expect("segments")
        .iter()
        .filter(|s| s["kind"] != "zone")
        .cloned()
        .collect()
}

/// One incoming row by name: (total, hits).
fn incoming(selected: &Value, name: &str) -> Option<(i64, i64)> {
    selected["incoming"]
        .as_array()
        .expect("incoming")
        .iter()
        .find(|r| r["name"] == name)
        .map(|r| (r["total"].as_i64().unwrap(), r["hits"].as_i64().unwrap()))
}

const BURNING: [&str; 7] = [
    "[Tue Oct 06 22:18:31 2026] You were hit by non-melee for 10 damage.",
    "[Tue Oct 06 22:18:31 2026] YOU are burning!",
    "[Tue Oct 06 22:18:36 2026] You were hit by non-melee for 10 damage.",
    "[Tue Oct 06 22:18:37 2026] You were hit by non-melee for 10 damage.",
    "[Tue Oct 06 22:18:38 2026] You were hit by non-melee for 10 damage.",
    "[Tue Oct 06 22:18:41 2026] You were hit by non-melee for 10 damage.",
    "[Tue Oct 06 22:18:44 2026] You were hit by non-melee for 10 damage.",
];

const CRAWLER: [&str; 11] = [
    "[Tue Oct 06 22:18:46 2026] A lava duct crawler tries to slash YOU, but misses!",
    "[Tue Oct 06 22:18:46 2026] A lava duct crawler is pierced by YOUR thorns for 3 points of non-melee damage.",
    "[Tue Oct 06 22:18:46 2026] A lava duct crawler bashes YOU for 14 points of damage.",
    "[Tue Oct 06 22:18:47 2026] You were hit by non-melee for 10 damage.",
    "[Tue Oct 06 22:18:48 2026] You were hit by non-melee for 10 damage.",
    "[Tue Oct 06 22:18:49 2026] A lava duct crawler crushes YOU for 110 points of damage.",
    "[Tue Oct 06 22:18:49 2026] You were hit by non-melee for 10 damage.",
    "[Tue Oct 06 22:18:50 2026] A lava duct crawler is pierced by YOUR thorns for 3 points of non-melee damage.",
    "[Tue Oct 06 22:18:50 2026] A lava duct crawler slashes YOU for 18 points of damage.",
    "[Tue Oct 06 22:18:50 2026] You were hit by non-melee for 10 damage.",
    "[Tue Oct 06 22:18:51 2026] You were hit by non-melee for 10 damage.",
];

#[test]
fn the_line_parses_as_damage_to_you_with_no_attacker() {
    let p = Parser::new(Clock::new(Tz::America__Los_Angeles), None, None);
    for (raw, amount) in [
        (BURNING[0], 10),
        (
            "[Tue Oct 06 18:50:48 2026] You were hit by non-melee for 312 damage.",
            312,
        ),
        (
            "[Mon Oct 19 00:06:30 2026] You were hit by non-melee for 1 damage.",
            1,
        ),
    ] {
        let mut ev = Ev::new();
        assert!(p.parse_event(raw, 0, &mut ev));
        let v: Value = serde_json::from_str(ev.finish()).unwrap();
        assert_eq!(v["kind"], "damage", "{v}");
        assert_eq!(v["attacker"], Value::Null, "{v}");
        assert_eq!(v["target"], "You", "{v}");
        assert_eq!(v["amount"], amount, "{v}");
        assert_eq!(v["skill"], "Non-melee", "{v}");
    }
}

#[test]
fn lava_with_no_fight_open_is_zone_damage_taken_and_opens_no_fight() {
    let mut run = Run::new();
    run.feed(&BURNING);
    let snap = run.snapshot(Some("zone"));
    assert!(fights(&snap).is_empty(), "{}", snap["segments"]);
    assert_eq!(snap["inCombat"], false);
    assert_eq!(incoming(&snap["selected"], "Environment"), Some((60, 6)));
    assert_eq!(snap["selected"]["inTotal"], 60);
}

#[test]
fn a_fall_alone_opens_no_fight() {
    let mut run = Run::new();
    run.feed(&[
        "[Tue Oct 06 18:50:48 2026] You were hit by non-melee for 312 damage.",
        "[Tue Oct 06 18:50:48 2026] YOU were injured by falling.",
    ]);
    let snap = run.snapshot(Some("zone"));
    assert!(fights(&snap).is_empty(), "{}", snap["segments"]);
    assert_eq!(incoming(&snap["selected"], "Environment"), Some((312, 1)));
}

#[test]
fn lava_inside_a_fight_adds_to_its_damage_taken_and_names_nothing() {
    let mut run = Run::new();
    run.feed(&BURNING);
    run.feed(&CRAWLER);
    let snap = run.snapshot(None);
    let fights = fights(&snap);
    assert_eq!(fights.len(), 1, "{}", snap["segments"]);
    let fight = &fights[0];
    // The fight starts at the crawler's first line, not at the burning before it, and ends at the
    // crawler's last hit, not at the lava tick a second later.
    assert_eq!(fight["startTs"], ts_of(CRAWLER[0]), "{fight}");
    assert_eq!(fight["durationSec"], 4.0, "{fight}");
    assert!(
        !fight["name"].as_str().unwrap().contains("Environment"),
        "{fight}"
    );
    let selected = &snap["selected"];
    assert_eq!(selected["id"], fight["id"]);
    assert_eq!(incoming(selected, "Environment"), Some((50, 5)));
    assert_eq!(selected["inTotal"], 14 + 110 + 18 + 50);
    // Outgoing is the thorns alone: the lava credits no one.
    assert_eq!(fight["total"], 6);

    let zone = run.snapshot(Some("zone"));
    assert_eq!(incoming(&zone["selected"], "Environment"), Some((110, 11)));
}

#[test]
fn lava_long_after_a_fight_stays_out_of_it() {
    let mut run = Run::new();
    run.feed(&CRAWLER);
    run.feed(&["[Tue Oct 06 22:58:31 2026] You were hit by non-melee for 10 damage."]);
    let snap = run.snapshot(None);
    let fights = fights(&snap);
    assert_eq!(fights.len(), 1, "{}", snap["segments"]);
    assert_eq!(
        fights[0]["kind"], "fight",
        "the lava closed the stale fight and opened none"
    );
    assert_eq!(incoming(&snap["selected"], "Environment"), Some((50, 5)));
    let zone = run.snapshot(Some("zone"));
    assert_eq!(incoming(&zone["selected"], "Environment"), Some((60, 6)));
}
