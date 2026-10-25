//! `You have taken N damage from <Spell> by <mob>.` is a DoT tick a mob landed on you (owner,
//! 2026-10-25: damage between us and them counts; parsed as fix-self-dot-ticks parses it). Inside a
//! fight it is that mob's damage to you, on the mob's own incoming row, and it extends the fight as
//! its direct hits do. It is no proof that a third party's charm pet turned on you. The `by`-less
//! form (your own DoT on yourself) is not damage between you and anyone, and counts nowhere. Every
//! line is a real shape from the owner's logs.

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
        engine.set_player_name("Drywrought");
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

fn parse(raw: &str) -> Value {
    let p = Parser::new(Clock::new(Tz::America__Los_Angeles), None, None);
    let mut ev = Ev::new();
    assert!(p.parse_event(raw, 0, &mut ev), "{raw}");
    serde_json::from_str(ev.finish()).unwrap()
}

fn ts_of(raw: &str) -> i64 {
    parse(raw)["ts"].as_i64().unwrap()
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

/// The incoming rows whose name folds to `name`: (total, hits) each.
fn incoming(selected: &Value, name: &str) -> Vec<(i64, i64)> {
    selected["incoming"]
        .as_array()
        .expect("incoming")
        .iter()
        .filter(|r| r["name"].as_str().unwrap().eq_ignore_ascii_case(name))
        .map(|r| (r["total"].as_i64().unwrap(), r["hits"].as_i64().unwrap()))
        .collect()
}

/// One incoming row's category total, by the category's name.
fn incoming_category(selected: &Value, name: &str, category: &str) -> Option<i64> {
    let row = selected["incoming"]
        .as_array()?
        .iter()
        .find(|r| r["name"].as_str().unwrap().eq_ignore_ascii_case(name))?;
    row["categories"]
        .as_array()?
        .iter()
        .find(|c| c["category"] == category)?["total"]
        .as_i64()
}

/// Sat Oct 10 2026: the shadowknight beside it is the one being hit, the ranger nukes you with
/// Searing Arrow, swings, and its DoT ticks twice; the second tick is the fight's last damage.
const RANGER: [&str; 10] = [
    "[Sat Oct 10 18:13:56 2026] A Teir`Dal ranger begins casting Searing Arrow.",
    "[Sat Oct 10 18:13:57 2026] a Teir`Dal ranger hit you for 69 points of fire damage by Searing Arrow.",
    "[Sat Oct 10 18:13:57 2026] You pierce a Teir`Dal shadowknight for 72 points of damage.",
    "[Sat Oct 10 18:13:58 2026] A Teir`Dal ranger slashes YOU for 2 points of damage.",
    "[Sat Oct 10 18:13:58 2026] A Teir`Dal ranger kicks YOU for 6 points of damage.",
    "[Sat Oct 10 18:14:01 2026] A Teir`Dal ranger slashes YOU for 6 points of damage.",
    "[Sat Oct 10 18:14:02 2026] You pierce a Teir`Dal shadowknight for 63 points of damage.",
    "[Sat Oct 10 18:14:02 2026] You have taken 29 damage from Searing Arrow by a Teir`Dal ranger.",
    "[Sat Oct 10 18:14:03 2026] A Teir`Dal ranger slashes YOU for 2 points of damage.",
    "[Sat Oct 10 18:14:08 2026] You have taken 29 damage from Searing Arrow by a Teir`Dal ranger.",
];

/// By-form ticks: a backtick, a comma, a mob's pet, a proper name, a lower-case article.
#[test]
fn a_tick_parses_as_the_casters_dot_on_you() {
    for (raw, attacker, amount, skill) in [
        (RANGER[7], "a Teir`Dal ranger", 29, "Searing Arrow"),
        (
            "[Wed Oct 07 22:52:32 2026] You have taken 156 damage from Plague by Innoruuk, the Prince of Hate.",
            "Innoruuk, the Prince of Hate",
            156,
            "Plague",
        ),
        (
            "[Sun Oct 11 14:49:35 2026] You have taken 43 damage from Heat Blood by a dar ghoul knight pet.",
            "a dar ghoul knight pet",
            43,
            "Heat Blood",
        ),
        (
            "[Wed Oct 07 19:46:56 2026] You have taken 67 damage from Boil Blood by Cazic-Thule.",
            "Cazic-Thule",
            67,
            "Boil Blood",
        ),
        (
            "[Wed Oct 07 20:59:22 2026] You have taken 200 damage from Whirl Bolt by Protector of Sky.",
            "Protector of Sky",
            200,
            "Whirl Bolt",
        ),
        (
            "[Sun Oct 11 18:40:10 2026] You have taken 42 damage from Suffocate by the ghoul arch magus.",
            "the ghoul arch magus",
            42,
            "Suffocate",
        ),
    ] {
        let v = parse(raw);
        assert_eq!(v["kind"], "damage", "{v}");
        assert_eq!(v["attacker"], attacker, "{v}");
        assert_eq!(v["target"], "You", "{v}");
        assert_eq!(v["amount"], amount, "{v}");
        assert_eq!(v["dtype"], "dot", "{v}");
        assert_eq!(v["category"], "dot", "{v}");
        assert_eq!(v["skill"], skill, "{v}");
        assert_eq!(v["crit"], false, "{v}");
    }
}

/// Sun Oct 11 2026: the owner's own DoTs cast on himself, no caster named. The last line is Fri
/// Oct 23's Everling fight, whose Envenomed Bolt the game framed as self-cast (it landed as `You hit
/// yourself for 41 points of poison damage by Envenomed Bolt.`).
const SELF_DOTS: [&str; 7] = [
    "[Sun Oct 11 15:28:39 2026] You begin casting Odium X.",
    "[Sun Oct 11 15:28:39 2026] You stagger under a dark curse.",
    "[Sun Oct 11 15:28:42 2026] You hit yourself for 41 points of poison damage by Envenomed Bolt IX.",
    "[Sun Oct 11 15:28:45 2026] You have taken 424 damage from Odium X.",
    "[Sun Oct 11 15:28:45 2026] You have taken 527 damage from Envenomed Bolt IX.",
    "[Sun Oct 11 15:28:51 2026] You have taken 516 damage from Plague IV. (Critical)",
    "[Fri Oct 23 23:37:25 2026] You have taken 373 damage from Envenomed Bolt.",
];

#[test]
fn a_tick_naming_no_caster_is_not_damage() {
    for raw in [SELF_DOTS[3], SELF_DOTS[5], SELF_DOTS[6]] {
        let v = parse(raw);
        assert_eq!(v["kind"], "unknown", "{v}");
    }
    // The same opening words on a depot withdrawal are not damage either.
    let depot = parse(
        "[Tue Oct 20 23:02:26 2026] You have taken 1 Gray Wolf Skull from your personal depot.",
    );
    assert_ne!(depot["kind"], "damage", "{depot}");
}

#[test]
fn ticks_join_the_casters_row_and_extend_the_fight() {
    let mut run = Run::new();
    run.feed(&RANGER);
    let snap = run.snapshot(None);
    let fights = fights(&snap);
    assert_eq!(fights.len(), 1, "{}", snap["segments"]);
    let fight = &fights[0];
    // The last tick is the fight's last damage, as a direct hit there would be.
    assert_eq!(fight["startTs"], ts_of(RANGER[1]), "{fight}");
    assert_eq!(
        fight["durationSec"].as_f64().unwrap(),
        ((ts_of(RANGER[9]) - ts_of(RANGER[1])) / 1000) as f64,
        "{fight}"
    );
    let selected = &snap["selected"];
    assert_eq!(selected["id"], fight["id"]);
    // One row for the ranger: `a Teir`Dal ranger` in the tick and `A Teir`Dal ranger` in its
    // swings are one mob.
    assert_eq!(
        incoming(selected, "a Teir`Dal ranger"),
        vec![(69 + 2 + 6 + 6 + 29 + 2 + 29, 7)]
    );
    assert_eq!(
        incoming_category(selected, "a Teir`Dal ranger", "dot"),
        Some(58)
    );
    assert_eq!(selected["inTotal"], 143);
    // Outgoing is unchanged: the ticks credit you with nothing.
    assert_eq!(fight["total"], 72 + 63);
}

#[test]
fn your_own_dot_on_you_counts_nowhere() {
    let mut run = Run::new();
    run.feed(&SELF_DOTS);
    let snap = run.snapshot(Some("zone"));
    assert!(fights(&snap).is_empty(), "{}", snap["segments"]);
    let selected = &snap["selected"];
    assert_eq!(selected["inTotal"], 0, "{selected}");
    assert!(
        selected["incoming"].as_array().unwrap().is_empty(),
        "{selected}"
    );
}

/// Wed Oct 07 2026, mid-fight with Innoruuk`s Chosen: a scorn banshee DoTs you, Kamas charms it,
/// and the DoT it cast while hostile ticks on three times more. A tick names who cast it, not when,
/// so it is no proof the pet turned on you again: the bind holds and the banshee's swings at Magi
/// P`tasa stay Kamas's pet's.
#[test]
fn a_tick_from_a_mob_charmed_since_it_cast_leaves_the_charm_standing() {
    let mut run = Run::new();
    run.feed(&[
        "[Wed Oct 07 22:27:11 2026] You punch Innoruuk`s Chosen for 189 points of damage.",
        "[Wed Oct 07 22:27:17 2026] A scorn banshee tries to pierce YOU, but misses!",
        "[Wed Oct 07 22:27:21 2026] Kamas begins casting Allure.",
        "[Wed Oct 07 22:27:21 2026] You have taken 3 damage from Strong Disease by a scorn banshee.",
        "[Wed Oct 07 22:27:22 2026] You punch Innoruuk`s Chosen for 105 points of damage.",
        "[Wed Oct 07 22:27:26 2026] a scorn banshee has been charmed.",
        "[Wed Oct 07 22:27:28 2026] You have taken 3 damage from Strong Disease by a scorn banshee.",
        "[Wed Oct 07 22:27:34 2026] You have taken 3 damage from Strong Disease by a scorn banshee.",
        "[Wed Oct 07 22:27:40 2026] You have taken 3 damage from Strong Disease by a scorn banshee.",
        "[Wed Oct 07 22:27:40 2026] You cleave Magi P`tasa for 152 points of damage.",
        "[Wed Oct 07 22:27:40 2026] A scorn banshee pierces Magi P`tasa for 119 points of damage.",
        "[Wed Oct 07 22:27:40 2026] A scorn banshee punches Magi P`tasa for 119 points of damage.",
        "[Wed Oct 07 22:27:42 2026] A scorn banshee pierces Magi P`tasa for 109 points of damage.",
    ]);
    let snap = run.snapshot(None);
    let selected = &snap["selected"];
    let pet = selected["entities"]
        .as_array()
        .expect("entities")
        .iter()
        .find(|r| r["kind"] == "allyPet")
        .unwrap_or_else(|| panic!("no ally pet row: {}", selected["entities"]));
    assert_eq!(pet["total"], 119 + 119 + 109, "{pet}");
    // The ticks are still the banshee's damage to you.
    assert_eq!(incoming(selected, "a scorn banshee"), vec![(12, 4)]);
}
