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
use fold::modules::roster::RosterModule;
use fold::EqModule;
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

/// The same fold through the real roster module, which folds each line before the engine does, as
/// on the bus.
fn fold_with_roster(lines: &[&str]) -> Value {
    let parser = Parser::new(
        Clock::new(Tz::America__Los_Angeles),
        None,
        Some("Drywrought".to_string()),
    );
    let mut roster = RosterModule::new(Some("Drywrought"));
    let mut engine = CombatEngine::new();
    engine.set_player_name("Drywrought");
    for (seq, raw) in lines.iter().enumerate() {
        let mut ev = Ev::new();
        assert!(parser.parse_event(raw, seq as i64, &mut ev), "{raw}");
        let ev = Event::from_json(ev.finish()).expect("a JSON object");
        roster.on_event(&ev, false);
        engine.on_event(&ev, false, Some(&roster));
    }
    let opts = SnapshotOpts {
        selected_id: Some("zone".to_string()),
        ..SnapshotOpts::full()
    };
    engine.snapshot(0, &opts, Some(&roster))
}

/// A Quick Buff burst in a group reaches Malkil and his pet Jeber alike.
const BURST: [&str; 3] = [
    "[Sat Oct 10 18:13:40 2026] You gain party experience! (3%)",
    "[Sat Oct 10 18:13:45 2026] You healed Malkil for 120 hit points by Light Healing.",
    "[Sat Oct 10 18:13:45 2026] You healed Jeber for 120 hit points by Light Healing.",
];

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

/// Owner, 2026-10-22: a group mate's pet that caught your burst is admitted on the weakest rung, and
/// its `My leader is Malkil.` still moves its damage to the ally-pet row.
#[test]
fn a_buffed_pet_naming_its_leader_moves_to_the_ally_pet_row() {
    let mut lines = BURST.to_vec();
    lines.extend([
        "[Sat Oct 10 18:13:50 2026] Jeber bites a gnoll for 50 points of damage.",
        "[Sat Oct 10 18:13:52 2026] Jeber says, 'My leader is Malkil.'",
    ]);
    let rows = rows(&fold_with_roster(&lines));
    assert!(
        rows.contains(&row("allyPet", "Pet (Jeber) - Malkil", 50)),
        "{rows:?}"
    );
    assert!(!rows.iter().any(|r| r.1 == "Jeber"), "{rows:?}");
}

/// A joined member saying it is still refused, burst or not: the join line is the game's word.
#[test]
fn a_joined_member_naming_somebody_else_its_leader_stays_a_member() {
    let mut lines = BURST.to_vec();
    lines.extend([
        "[Sat Oct 10 18:13:46 2026] Rykkerr has joined the group.",
        "[Sat Oct 10 18:13:50 2026] Rykkerr slashes a gnoll for 400 points of damage.",
        "[Sat Oct 10 18:13:52 2026] Rykkerr says, 'My leader is Malkil.'",
    ]);
    let rows = rows(&fold_with_roster(&lines));
    assert!(rows.contains(&row("member", "Rykkerr", 400)), "{rows:?}");
    assert!(!rows.iter().any(|r| r.0 == "allyPet"), "{rows:?}");
}

/// The owner's Oct 15 log: Malkil summoned Gonekab, it caught a burst and named its leader in the
/// Plane of Fear, and it fought on beside him through three more zones. A summoned pet walks through
/// the zone line with its owner, so its bind does, and its damage there is still its row.
#[test]
fn a_summoned_group_mates_pet_keeps_its_row_past_a_zone_line() {
    let mut lines = vec!["[Sat Oct 10 18:13:30 2026] Malkil begins casting Kintaz's Animation."];
    lines.extend(BURST);
    lines.extend([
        "[Sat Oct 10 18:13:52 2026] Jeber says, 'My leader is Malkil.'",
        "[Sat Oct 10 18:20:00 2026] You have entered The Plane of Hate.",
        "[Sat Oct 10 18:21:00 2026] Jeber bites a gnoll for 50 points of damage.",
    ]);
    let rows = rows(&fold_with_roster(&lines));
    assert!(
        rows.contains(&row("allyPet", "Pet (Jeber) - Malkil", 50)),
        "{rows:?}"
    );
}

/// Owner, 2026-10-28: Venekn fought Master Yael before it said its leader line, and those swings
/// were booked as another player's row and then dropped by the claim. They move to the pet's row,
/// so they show with you. The lines are the owner's log verbatim (Wed Oct 28 18:30).
#[test]
fn your_pets_swings_before_its_claim_move_to_its_row() {
    let rows = rows(&fold(
        &[
            "[Wed Oct 28 18:30:27 2026] You strike Master Yael for 44 points of damage.",
            "[Wed Oct 28 18:30:28 2026] Venekn slashes Master Yael for 209 points of damage.",
            "[Wed Oct 28 18:30:28 2026] Venekn slashes Master Yael for 231 points of damage.",
            "[Wed Oct 28 18:30:29 2026] You punch Master Yael for 103 points of damage.",
            "[Wed Oct 28 18:30:29 2026] Venekn slashes Master Yael for 143 points of damage.",
            "[Wed Oct 28 18:30:31 2026] Venekn cleaves Master Yael for 231 points of damage.",
            "[Wed Oct 28 18:30:39 2026] Master Yael has been slain by Malkil!",
            "[Wed Oct 28 18:33:17 2026] Venekn says, 'My leader is Drywrought.'",
            "[Wed Oct 28 18:33:20 2026] Venekn slashes a flighty fiend for 176 points of damage.",
        ],
        &[],
    ));
    assert!(
        rows.contains(&row("pet", "Venekn", 209 + 231 + 143 + 231 + 176)),
        "{rows:?}"
    );
    assert!(
        !rows.iter().any(|r| r.0 != "pet" && r.1 == "Venekn"),
        "{rows:?}"
    );
}
