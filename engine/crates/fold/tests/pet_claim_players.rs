//! `<Name> says, 'My leader is <Player>.'` is a `says` line, and anyone can say it. The owner or a
//! group member saying it is no pet: the claim is refused, your real pet stays bound, and the
//! speaker's swings stay theirs. The ally form (naming somebody else) is refused the same way. A
//! name the heal stream filed as a player is NOT refused: a summoned pet heals you too, and the
//! owner's shaman pet did before its first `/pet leader` (Wed Oct 14 2026, the lines below). The
//! heal and swing shapes are real; the forged sentences are the leader answer verbatim.

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

fn row(kind: &str, name: &str, total: i64) -> (String, String, i64) {
    (kind.to_string(), name.to_string(), total)
}

const PET_CLAIM: &str = "[Sat Oct 10 18:13:50 2026] Gobekn says, 'My leader is Drywrought.'";
const SWINGS: [&str; 2] = [
    "[Sat Oct 10 18:13:53 2026] Rykkerr slashes a gnoll for 400 points of damage.",
    "[Sat Oct 10 18:13:54 2026] Gobekn bites a gnoll for 50 points of damage.",
];

#[test]
fn a_group_member_naming_you_its_leader_is_not_your_pet() {
    let forged = "[Sat Oct 10 18:13:52 2026] Rykkerr says, 'My leader is Drywrought.'";
    let rows = rows(&fold(
        &[PET_CLAIM, forged, SWINGS[0], SWINGS[1]],
        &["rykkerr"],
    ));
    assert!(!rows.contains(&row("pet", "Rykkerr", 400)), "{rows:?}");
    assert!(rows.contains(&row("member", "Rykkerr", 400)), "{rows:?}");
    assert!(rows.contains(&row("pet", "Gobekn", 50)), "{rows:?}");
}

#[test]
fn you_naming_yourself_leader_leaves_your_pet_bound() {
    let forged = "[Sat Oct 10 18:13:52 2026] Drywrought says, 'My leader is Drywrought.'";
    let rows = rows(&fold(&[PET_CLAIM, forged, SWINGS[1]], &[]));
    assert!(rows.contains(&row("pet", "Gobekn", 50)), "{rows:?}");
}

#[test]
fn a_group_member_naming_somebody_else_its_leader_is_not_their_pet() {
    let forged = "[Sat Oct 10 18:13:52 2026] Rykkerr says, 'My leader is Malkil.'";
    let rows = rows(&fold(
        &[PET_CLAIM, forged, SWINGS[0], SWINGS[1]],
        &["rykkerr"],
    ));
    assert!(rows.contains(&row("member", "Rykkerr", 400)), "{rows:?}");
    assert!(!rows.iter().any(|r| r.0 == "allyPet"), "{rows:?}");
}

#[test]
fn a_pet_that_healed_you_before_its_claim_still_binds() {
    let rows = rows(&fold(
        &[
            "[Wed Oct 14 20:16:18 2026] Vasartik healed you for 350 hit points by Greater Healing.",
            "[Wed Oct 14 20:22:41 2026] Vasartik says, 'My leader is Drywrought.'",
            "[Wed Oct 14 20:22:45 2026] Vasartik slashes a gnoll for 162 points of damage.",
        ],
        &[],
    ));
    assert!(rows.contains(&row("pet", "Vasartik", 162)), "{rows:?}");
}
