//! Your pet's heal on a group mate is your pet's healing output (owner ruling 2026-10-26: "sure if
//! my pet can be truely tracked to me and healed a group mate sure"). It books on the pet's own
//! row, the row its heals on you already use, only when the healer is a pet bound by evidence and
//! the target is a roster member or a pet bound to one. A same-named creature with no bind, a pet
//! whose bind came later, and a target outside the group book nothing.
//!
//! The lines are the owner's own. His 10-17 log holds no heal by a pet bound at the time on a group
//! member, so two lines are real shapes with a name or the time changed: the Vonarn bind, and the
//! Vasartik heal on Lasektik.

use eqlog::event::Ev;
use eqlog::{Clock, Parser, Tz};
use fold::combat::{CombatEngine, RosterSnap, RosterSource, SnapshotOpts};
use fold::event::Event;
use serde_json::Value;

struct Group(Vec<String>);

impl RosterSource for Group {
    fn snap(&self) -> RosterSnap {
        RosterSnap::empty()
    }
    fn members(&self) -> Vec<String> {
        self.0.clone()
    }
    fn admitted(&self) -> Vec<String> {
        self.0.clone()
    }
}

/// Fold the lines with `group` on the roster and return the zone session's healing view.
fn healing(lines: &[&str], group: &[&str]) -> Value {
    let parser = Parser::new(
        Clock::new(Tz::America__Los_Angeles),
        None,
        Some("Drywrought".to_string()),
    );
    let roster = Group(group.iter().map(|s| s.to_string()).collect());
    let mut engine = CombatEngine::new();
    engine.set_player_name("Drywrought");
    for (seq, raw) in lines.iter().enumerate() {
        let mut ev = Ev::new();
        assert!(parser.parse_event(raw, seq as i64, &mut ev), "{raw}");
        let ev = Event::from_json(ev.finish()).expect("a JSON object");
        engine.on_event(&ev, false, Some(&roster));
    }
    let opts = SnapshotOpts {
        selected_id: Some("zone".to_string()),
        ..SnapshotOpts::full()
    };
    engine.snapshot(0, &opts, Some(&roster))["selected"].clone()
}

/// (id, kind, total, count, overheal) of every healer row.
fn rows(view: &Value) -> Vec<(String, String, i64, i64, i64)> {
    view["healing"]["healers"]
        .as_array()
        .expect("healers")
        .iter()
        .map(|h| {
            let n = |k: &str| h[k].as_i64().unwrap();
            (
                h["id"].as_str().unwrap().to_string(),
                h["kind"].as_str().unwrap().to_string(),
                n("total"),
                n("count"),
                n("overheal"),
            )
        })
        .collect()
}

fn row(id: &str, kind: &str, total: i64, count: i64, over: i64) -> (String, String, i64, i64, i64) {
    (id.to_string(), kind.to_string(), total, count, over)
}

const VONARN_BIND: &str = "[Sun Oct 11 00:01:00 2026] Vonarn says, 'My leader is Drywrought.'";
const VONARN_ON_REVILUS: &str =
    "[Sun Oct 11 00:02:59 2026] Vonarn healed Revilus for 350 hit points by Greater Healing.";

#[test]
fn your_bound_pet_healing_a_group_member_books_on_the_pets_row() {
    let view = healing(&[VONARN_BIND, VONARN_ON_REVILUS], &["revilus"]);
    assert_eq!(
        rows(&view),
        vec![row("heal:vonarn", "pet", 350, 1, 0)],
        "{}",
        view["healing"]
    );
    // Not healing you received.
    assert_eq!(view["incomingHealTotal"], 0);
}

#[test]
fn your_bound_pet_healing_a_group_members_pet_counts_with_its_overheal() {
    let lines = [
        "[Wed Oct 14 20:22:41 2026] Vasartik says, 'My leader is Drywrought.'",
        "[Wed Oct 14 20:27:00 2026] Lasektik says, 'My leader is Malkil.'",
        "[Wed Oct 14 20:27:30 2026] Vasartik healed Lasektik for 42 (350) hit points by Greater Healing.",
    ];
    let view = healing(&lines, &["malkil"]);
    assert_eq!(rows(&view), vec![row("heal:vasartik", "pet", 42, 1, 308)]);
}

#[test]
fn a_same_named_creature_with_no_bind_books_nothing() {
    let view = healing(&[VONARN_ON_REVILUS], &["revilus"]);
    assert!(rows(&view).is_empty(), "{}", view["healing"]);
}

#[test]
fn a_heal_from_before_the_pets_bind_books_nothing() {
    // Jonartik's first Master line came five minutes after this heal (Mon Oct 12 2026).
    let lines = [
        "[Mon Oct 12 20:53:42 2026] Jonartik healed Lodrand Dindlenod for 42 (350) hit points by Greater Healing.",
        "[Mon Oct 12 20:58:48 2026] Jonartik says, 'Sorry, Master... calming down.'",
    ];
    let view = healing(&lines, &["lodrand dindlenod"]);
    assert!(rows(&view).is_empty(), "{}", view["healing"]);
}

#[test]
fn your_bound_pet_healing_someone_outside_the_group_books_nothing() {
    let view = healing(&[VONARN_BIND, VONARN_ON_REVILUS], &[]);
    assert!(rows(&view).is_empty(), "{}", view["healing"]);
}
