//! The Event log's con marks against the Gaps tab's Mobs rows, on the owner's lines of 2026-10-22/23
//! (eqlog_Drywrought_oggok.txt, Lake Nerius): one decision, so the two always agree.

use super::ConMarks;
use crate::event::Event;
use crate::knowledge::{Answer, GapIndex, Knowledge, Miss, OwnLoot};
use crate::modules::consider::mob_key;
use crate::modules::event_feed::EventFeedModule;
use crate::modules::gaps::GapsModule;
use crate::EqModule;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::sync::Arc;

/// Knows two mobs: one with a picture, one without.
struct Corpus;

impl Knowledge for Corpus {
    fn item(&self, _name: &str) -> Answer {
        panic!("a con must never ask a lookup that notes a miss")
    }
    fn identity_keys(&self, mob: &str) -> Vec<String> {
        vec![mob_key(mob)]
    }
    fn mob(&self, _name: &str, _loot: &dyn OwnLoot) -> Answer {
        panic!("a con must never ask a lookup that notes a miss")
    }
    fn known_mob(&self, name: &str) -> bool {
        matches!(mob_key(name).as_str(), "the great zultor" | "a froglok")
    }
    fn imageless_mob(&self, name: &str) -> bool {
        mob_key(name) == "a froglok"
    }
    fn take_misses(&self) -> Vec<Miss> {
        Vec::new()
    }
    fn gap_index(&self) -> GapIndex {
        GapIndex {
            mob_names: vec!["The Great Zultor".into(), "a froglok".into()],
            ..GapIndex::default()
        }
    }
}

/// The two modules as `crate::registered` builds them: one slot, the Gaps module first.
struct Pair {
    gaps: GapsModule,
    feed: EventFeedModule,
    seq: i64,
}

const T0: i64 = 1_792_717_000_000;

impl Pair {
    fn new() -> Self {
        let slot = ConMarks::default();
        let k: Arc<dyn Knowledge> = Arc::new(Corpus);
        let mut gaps = GapsModule::sharing(slot.clone());
        gaps.install_knowledge(&k);
        let mut feed = EventFeedModule::sharing(slot);
        feed.install_knowledge(&k);
        let mut p = Pair { gaps, feed, seq: 0 };
        p.send(0, json!({ "kind": "zone", "zone": "Lake Nerius" }));
        p
    }

    /// One event at `at` seconds, delivered live to both, in registration order.
    fn send(&mut self, at: i64, mut ev: Value) {
        self.seq += 1;
        ev["seq"] = json!(self.seq);
        ev["ts"] = json!(T0 + at * 1000);
        if ev.get("raw").is_none() {
            ev["raw"] = json!(format!("[Fri Oct 23 01:53:33 2026] line {}", self.seq));
        }
        let ev = Event::from_value(ev);
        self.gaps.on_event(&ev, true);
        self.feed.on_event(&ev, true);
    }

    fn line(&mut self, at: i64, text: &str) {
        self.send(at, json!({ "kind": "unknown", "raw": format!("[Fri Oct 23 01:53:33 2026] {text}") }));
    }

    fn con(&mut self, at: i64, mob: &str, level: i64) {
        self.send(at, json!({ "kind": "consider", "mob": mob, "level": level, "faction": "dubiously" }));
    }

    /// The last feed row's mark, as the overlay reads it.
    fn mark(&self) -> &'static str {
        let ring = self.feed.snapshot()["state"].clone();
        let row = ring.as_array().and_then(|r| r.last()).cloned().unwrap_or(Value::Null);
        match (row["unknown"] == true, row["maybePlayer"] == true, row["needsImage"] == true) {
            (true, true, _) => "missing, may be a player",
            (true, false, _) => "missing",
            (false, _, true) => "no picture",
            _ => "none",
        }
    }

    /// The Gaps tab's Mobs rows with no page, by mob key → "may be a player".
    fn mob_rows(&self) -> BTreeMap<String, bool> {
        let rows = self.gaps.snapshot()["state"]["rows"].clone();
        rows.as_array()
            .expect("rows")
            .iter()
            // A merchant's con row is served under Merchants (owner, 2026-10-23); it is the same NPC row.
            .filter(|r| (r["domain"] == "mob" || r["domain"] == "merchant") && r.get("viaRedirect").is_none())
            .map(|r| (mob_key(r["name"].as_str().unwrap_or("")), r["maybePlayer"] == true))
            .collect()
    }
}

#[test]
fn a_one_word_npc_that_answered_the_hail_is_plainly_missing() {
    let mut p = Pair::new();
    p.line(10, "You say, 'Hail, Blergagh'");
    p.line(10, "Blergagh says, 'Blergagh 'n Blargraah have plants. Plants for eatin', for grindin', for mixin' magics, for alchemist.'");
    p.con(14, "Blergagh", 50);
    assert_eq!(p.mark(), "missing");
}

#[test]
fn an_unproven_one_word_name_is_missing_but_may_be_a_player_until_a_target_line_proves_it() {
    let mut p = Pair::new();
    // `Raul glowers at you dubiously -- ... (Lvl: 35)`: no hail, no answer, no revisit yet.
    p.con(0, "Raul", 35);
    assert_eq!(p.mark(), "missing, may be a player");
    // Five hours later the client named him: `Targeted (Merchant): Raul`.
    p.line(100, "Targeted (Merchant): Raul");
    p.con(101, "Raul", 35);
    assert_eq!(p.mark(), "missing");
}

#[test]
fn a_one_word_player_is_never_marked() {
    let mut p = Pair::new();
    p.line(0, "Malkil tells the guild, 'Yeah, I'll join. I'm almost there.'");
    p.con(1, "Malkil", 50);
    assert_eq!(p.mark(), "none");
    // Conned before any chat, then shown a player: the next con carries no mark.
    p.con(2, "Kamas", 50);
    assert_eq!(p.mark(), "missing, may be a player");
    p.line(3, "Kamas tells you, 'that con was me'");
    p.con(30, "Kamas", 50);
    assert_eq!(p.mark(), "none");
    p.line(31, "Targeted (Player): Xober");
    p.con(32, "Xober", 50);
    assert_eq!(p.mark(), "none");
}

#[test]
fn a_pet_or_a_mount_is_never_marked_and_a_known_mob_keeps_its_picture_mark() {
    let mut p = Pair::new();
    p.send(0, json!({ "kind": "petSay", "name": "Gonekn" }));
    p.con(1, "Gonekn", 48);
    assert_eq!(p.mark(), "none");
    p.con(2, "Malkil`s Mount", 50);
    assert_eq!(p.mark(), "none");
    p.con(3, "Xober's warder", 50);
    assert_eq!(p.mark(), "none");
    p.con(4, "The Great Zultor", 50);
    assert_eq!(p.mark(), "none");
    p.con(5, "a froglok", 20);
    assert_eq!(p.mark(), "no picture");
    p.con(6, "a lizardman forager", 12);
    assert_eq!(p.mark(), "missing");
}

/// The owner's question: every name the Gaps tab files as a Mobs row is marked on the Event log,
/// with the same "may be a player", and no other name is.
#[test]
fn the_names_gaps_files_as_mob_rows_are_exactly_the_names_the_feed_marks() {
    let mut p = Pair::new();
    let names = ["Raul", "Ukbog", "Blergagh", "Blargraah", "The Great Zultor", "Malkil", "Gonekn", "Kamas", "Bordag", "Malkil`s Mount", "a lizardman forager", "a froglok"];
    p.line(0, "Malkil tells the guild, 'Alt-Z is default hotkey for lockouts'");
    p.send(1, json!({ "kind": "petSay", "name": "Gonekn" }));
    p.line(2, "Targeted (Merchant): Ukbog");
    p.line(3, "You say, 'Hail, Blergagh'");
    p.line(4, "Blergagh says, 'Dorian our best customer. Buys many plants.'");
    p.line(5, "You say, 'Hail, Blargraah'");
    p.line(30, "Kamas tells you, 'hi'");
    p.con(31, "Bordag", 70);
    let mut marked = BTreeMap::new();
    for (i, name) in names.iter().enumerate() {
        p.con(100 + i64::try_from(i).unwrap_or(0), name, 50);
        let mark = p.mark();
        if mark.starts_with("missing") {
            marked.insert(mob_key(name), mark == "missing, may be a player");
        }
    }
    assert_eq!(marked, p.mob_rows());
    // And what each one is: Blargraah never answered and was never targeted, so it may still be one.
    let expect: BTreeMap<String, bool> = [("raul", true), ("ukbog", false), ("blergagh", false), ("blargraah", true), ("bordag", false), ("a lizardman forager", false)]
        .iter()
        .map(|(n, m)| ((*n).to_string(), *m))
        .collect();
    assert_eq!(marked, expect);
}
