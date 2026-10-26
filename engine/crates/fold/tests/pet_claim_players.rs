//! `<Name> says, 'My leader is <Player>.'` is a `says` line, and anyone can say it. A player, a
//! group member or the owner saying it is no pet: the claim is refused, your real pet stays bound,
//! and the speaker's swings stay theirs. The ally form (naming somebody else) is refused the same
//! way. The heal and the swings are real shapes; the forged sentence is the leader answer verbatim.

use eqlog::event::Ev;
use eqlog::{Clock, Parser, Tz};
use fold::combat::{CombatEngine, RosterSnap, RosterSource, SnapshotOpts};
use fold::event::Event;
use serde_json::Value;

/// A roster that admitted the names it holds.
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

fn fold(lines: &[&str], group: &[&str]) -> Value {
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
    engine.snapshot(0, &opts, Some(&roster))
}

/// (kind, name, total) of every damage row in the zone session.
fn rows(snap: &Value) -> Vec<(String, String, i64)> {
    snap["selected"]["entities"]
        .as_array()
        .expect("entities")
        .iter()
        .map(|r| {
            (
                r["kind"].as_str().unwrap().to_string(),
                r["name"].as_str().unwrap().to_string(),
                r["total"].as_i64().unwrap(),
            )
        })
        .collect()
}

const PET_CLAIM: &str = "[Sat Oct 10 18:13:50 2026] Gobekn says, 'My leader is Drywrought.'";
const HEAL: &str =
    "[Sat Oct 10 18:13:51 2026] Rykkerr healed you for 120 hit points by Light Healing.";
const SWINGS: [&str; 2] = [
    "[Sat Oct 10 18:13:53 2026] Rykkerr slashes a gnoll for 400 points of damage.",
    "[Sat Oct 10 18:13:54 2026] Gobekn bites a gnoll for 50 points of damage.",
];

fn no_pet_named_rykkerr(snap: &Value) {
    let rows = rows(snap);
    assert!(
        !rows
            .iter()
            .any(|(kind, name, _)| kind == "pet" && name == "Rykkerr"),
        "a player was bound as a pet: {rows:?}"
    );
    assert!(
        rows.contains(&("pet".to_string(), "Gobekn".to_string(), 50)),
        "the real pet lost its row: {rows:?}"
    );
}

#[test]
fn a_known_player_naming_you_its_leader_is_not_your_pet() {
    let forged = "[Sat Oct 10 18:13:52 2026] Rykkerr says, 'My leader is Drywrought.'";
    let snap = fold(&[PET_CLAIM, HEAL, forged, SWINGS[0], SWINGS[1]], &[]);
    no_pet_named_rykkerr(&snap);
}

#[test]
fn a_group_member_naming_you_its_leader_is_not_your_pet() {
    let forged = "[Sat Oct 10 18:13:52 2026] Rykkerr says, 'My leader is Drywrought.'";
    let snap = fold(&[PET_CLAIM, forged, SWINGS[0], SWINGS[1]], &["rykkerr"]);
    no_pet_named_rykkerr(&snap);
    let rows = rows(&snap);
    assert!(
        rows.contains(&("member".to_string(), "Rykkerr".to_string(), 400)),
        "the member's swing is still theirs: {rows:?}"
    );
}

#[test]
fn a_known_player_naming_somebody_else_its_leader_is_not_their_pet() {
    let forged = "[Sat Oct 10 18:13:52 2026] Rykkerr says, 'My leader is Malkil.'";
    let snap = fold(&[PET_CLAIM, HEAL, forged, SWINGS[0], SWINGS[1]], &[]);
    no_pet_named_rykkerr(&snap);
    let rows = rows(&snap);
    assert!(
        rows.contains(&("other".to_string(), "Rykkerr".to_string(), 400)),
        "the player's swing is still recorded as theirs: {rows:?}"
    );
}
