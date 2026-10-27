//! Your heals on other people are your healing output (owner ruling 2026-10-26: "fix the healing
//! meter"). They book on your own row, per spell lane, with overheal from the `(M)` form exactly as
//! a self-heal does, and into the fight that is open when they land. They are not healing you
//! received. A heal on an engaged hostile stays enemy healing. The lines are the owner's own (Wed
//! Oct 14 2026), except the heal on Terror in the last test, whose shape is real and name forged.

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

/// Fold the lines and return the snapshot's selected view (`selected` = `None` is the open fight).
fn fold(lines: &[&str], selected: Option<&str>) -> Value {
    let parser = Parser::new(
        Clock::new(Tz::America__Los_Angeles),
        None,
        Some("Drywrought".to_string()),
    );
    let roster = Group(vec!["malkil".to_string()]);
    let mut engine = CombatEngine::new();
    engine.set_player_name("Drywrought");
    for (seq, raw) in lines.iter().enumerate() {
        let mut ev = Ev::new();
        assert!(parser.parse_event(raw, seq as i64, &mut ev), "{raw}");
        let ev = Event::from_json(ev.finish()).expect("a JSON object");
        engine.on_event(&ev, false, Some(&roster));
    }
    let opts = SnapshotOpts {
        selected_id: selected.map(str::to_string),
        ..SnapshotOpts::full()
    };
    engine.snapshot(0, &opts, Some(&roster))["selected"].clone()
}

/// The healer row with this id, if the view has one.
fn healer<'a>(view: &'a Value, id: &str) -> Option<&'a Value> {
    view["healing"]["healers"]
        .as_array()
        .expect("healers")
        .iter()
        .find(|h| h["id"] == id)
}

/// (total, count, overheal) of one spell lane on a row.
fn lane(row: &Value, spell: &str) -> (i64, i64, i64) {
    let l = row["spells"]
        .as_array()
        .expect("spells")
        .iter()
        .find(|l| l["name"] == spell)
        .unwrap_or_else(|| panic!("no {spell} lane in {row}"));
    let n = |k: &str| l[k].as_i64().unwrap();
    (n("total"), n("count"), n("overheal"))
}

const MATE_OVERHEAL: &str =
    "[Wed Oct 14 20:03:05 2026] You healed Malkil for 105 (255) hit points by Talisman of Altuna.";
const MATE_PLAIN: &str =
    "[Wed Oct 14 20:21:25 2026] You healed Malkil for 887 hit points by Superior Healing.";
const PET_BIND: &str = "[Wed Oct 14 20:22:41 2026] Vasartik says, 'My leader is Drywrought.'";
const SELF_HEAL: &str =
    "[Wed Oct 14 20:23:26 2026] You healed Drywrought for 841 hit points by Superior Healing.";
const PET_HEAL: &str =
    "[Wed Oct 14 20:56:14 2026] You healed Vasartik for 255 hit points by Talisman of Altuna.";
const SWING: &str = "[Wed Oct 14 20:21:20 2026] You punch Terror for 98 points of damage.";

#[test]
fn your_heals_on_a_group_mate_book_on_your_row_beside_self_and_pet_heals() {
    let view = fold(
        &[MATE_OVERHEAL, MATE_PLAIN, PET_BIND, SELF_HEAL, PET_HEAL],
        Some("zone"),
    );
    let you = healer(&view, "you").expect("your row");
    assert_eq!(you["kind"], "you");
    assert_eq!(you["total"], 105 + 887 + 841 + 255);
    assert_eq!(you["count"], 4);
    // The `(M)` form on the group mate is overheal, as it is on a self-heal.
    assert_eq!(you["overheal"], 150);
    assert_eq!(lane(you, "Superior Healing"), (887 + 841, 2, 0));
    assert_eq!(lane(you, "Talisman of Altuna"), (105 + 255, 2, 150));
    // One row: the group mate gets none of their own, and nothing is counted twice.
    assert_eq!(view["healing"]["healers"].as_array().unwrap().len(), 1);
    assert_eq!(view["healing"]["total"], 2088);
    // Healing YOU received stays the self-heal and the pet heal; Malkil's heals were not on you.
    assert_eq!(view["incomingHealTotal"], 841 + 255);
}

#[test]
fn a_heal_on_a_group_mate_during_a_fight_books_into_that_fight() {
    let fight = fold(&[SWING, MATE_PLAIN], None);
    assert_ne!(fight["id"], "zone", "the open fight is selected");
    let you = healer(&fight, "you").expect("your row in the fight");
    assert_eq!(you["total"], 887);
    assert_eq!(lane(you, "Superior Healing"), (887, 1, 0));
}

#[test]
fn a_heal_you_land_on_an_engaged_hostile_stays_enemy_healing() {
    let forged = "[Wed Oct 14 20:21:24 2026] You healed Terror for 76 hit points by Superior Healing.";
    let fight = fold(&[SWING, forged], None);
    assert!(healer(&fight, "you").is_none(), "{}", fight["healing"]);
    assert_eq!(fight["healing"]["enemyTotal"], 76);
}
