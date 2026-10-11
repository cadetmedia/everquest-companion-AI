//! The gaps module on synthetic events against a three-name corpus and the real spell catalog.

use super::GapsModule;
use crate::event::Event;
use crate::knowledge::{Answer, Knowledge, Miss, OwnLoot};
use crate::EqModule;
use serde_json::{json, Value};
use std::sync::Arc;

/// Knows one item and one mob, and would panic if a lookup that notes a miss were ever asked.
struct Corpus;

impl Knowledge for Corpus {
    fn item(&self, _name: &str) -> Answer {
        panic!("the gaps module must never ask a lookup that notes a miss")
    }
    fn identity_keys(&self, mob: &str) -> Vec<String> {
        vec![super::mob_key(mob)]
    }
    fn mob(&self, _name: &str, _loot: &dyn OwnLoot) -> Answer {
        panic!("the gaps module must never ask a lookup that notes a miss")
    }
    fn known_mob(&self, name: &str) -> bool {
        super::mob_key(name) == "a decaying skeleton"
    }
    fn take_misses(&self) -> Vec<Miss> {
        Vec::new()
    }
    fn item_names(&self) -> Vec<String> {
        vec!["Bone Chips".to_string()]
    }
}

const RAW: &str = "[Tue Oct 06 18:12:26 2026] (the line)";

fn module() -> GapsModule {
    let mut m = GapsModule::new();
    m.install_knowledge(&(Arc::new(Corpus) as Arc<dyn Knowledge>));
    m
}

fn feed(m: &mut GapsModule, seq: i64, mut ev: Value) {
    ev["seq"] = json!(seq);
    ev["ts"] = json!(1_791_339_146_000_i64 + seq);
    ev["raw"] = json!(RAW);
    m.on_event(&Event::from_value(ev), false);
}

fn rows(m: &GapsModule) -> Vec<String> {
    m.snapshot()["state"]["rows"]
        .as_array()
        .expect("rows")
        .iter()
        .map(|r| {
            let kinds: Vec<&str> = r["kinds"]
                .as_array()
                .expect("kinds")
                .iter()
                .filter_map(Value::as_str)
                .collect();
            format!(
                "{} {} x{} [{}]",
                r["domain"].as_str().unwrap_or(""),
                r["name"].as_str().unwrap_or(""),
                r["count"],
                kinds.join(",")
            )
        })
        .collect()
}

#[test]
fn known_names_are_not_rows_and_unknown_ones_are_counted_per_kind() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "loot", "item": "Bone Chips", "source": "a decaying skeleton" }));
    feed(&mut m, 2, json!({ "kind": "loot", "item": "Glowing Widget +2", "source": "a nameless thing" }));
    feed(&mut m, 3, json!({ "kind": "itemReceived", "item": "Glowing Widget", "via": "fashioned" }));
    feed(&mut m, 4, json!({ "kind": "purchase", "item": "glowing widget", "count": 1 }));
    feed(&mut m, 5, json!({ "kind": "consider", "mob": "A nameless thing", "level": 10 }));
    feed(&mut m, 6, json!({ "kind": "castBegin", "spell": "Call of Flame VII" }));
    feed(&mut m, 7, json!({ "kind": "otherCastBegin", "caster": "Kamas", "spell": "Totally Made Up II" }));
    assert_eq!(
        rows(&m),
        [
            "item Glowing Widget x3 [looted,crafted,bought]",
            "mob a nameless thing x2 [dropped-by,considered]",
            "spell Totally Made Up x1 [cast]",
        ]
    );
    let state = m.snapshot()["state"].clone();
    assert_eq!(state["totals"], json!({ "item": 1, "mob": 1, "spell": 1 }));
    assert_eq!(state["seen"], json!({ "item": 2, "mob": 2, "spell": 2 }));
    assert_eq!(state["rows"][0]["first"], json!("2026-10-06 18:12:26"));
}

#[test]
fn a_player_shaped_name_is_a_mob_only_by_the_death_rule() {
    let mut m = module();
    // A single word that /con'd: could be a guildmate, so not filed.
    feed(&mut m, 1, json!({ "kind": "consider", "mob": "Kamas", "level": 50 }));
    // Killed by nobody (a DoT) and by a player: a named mob.
    feed(&mut m, 2, json!({ "kind": "death", "name": "Fright", "bySelf": false }));
    feed(&mut m, 3, json!({ "kind": "death", "name": "Fright", "bySelf": false, "killer": "Malkil" }));
    // An article: a mob whoever killed it.
    feed(&mut m, 4, json!({ "kind": "death", "name": "a turmoil toad", "bySelf": true }));
    // Killed by a mob: a player (or a pet) — and once a player, never a row.
    feed(&mut m, 5, json!({ "kind": "death", "name": "Kamas", "bySelf": false, "killer": "a turmoil toad" }));
    feed(&mut m, 6, json!({ "kind": "death", "name": "Kamas", "bySelf": false }));
    feed(&mut m, 7, json!({ "kind": "loot", "item": "Bone Chips", "source": "Kamas" }));
    assert_eq!(rows(&m), ["mob Fright x2 [killed]", "mob a turmoil toad x1 [killed]"]);
}

#[test]
fn a_row_filed_before_the_name_died_to_a_mob_is_withdrawn() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "death", "name": "Revilus", "bySelf": false }));
    assert_eq!(rows(&m), ["mob Revilus x1 [killed]"]);
    let before = m.published_seq();
    feed(&mut m, 2, json!({ "kind": "death", "name": "Revilus", "bySelf": false, "killer": "a glyphed sentry" }));
    assert!(rows(&m).is_empty());
    assert!(m.published_seq() > before, "a withdrawal is a change the tab must see");
}

#[test]
fn nothing_is_checked_before_the_knowledge_is_installed_and_an_epoch_clears() {
    let mut bare = GapsModule::new();
    feed(&mut bare, 1, json!({ "kind": "loot", "item": "Glowing Widget" }));
    assert!(rows(&bare).is_empty());
    assert_eq!(bare.published_seq(), Some(0));

    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "loot", "item": "Glowing Widget" }));
    feed(&mut m, 2, json!({ "kind": "epoch" }));
    assert!(rows(&m).is_empty());
    assert_eq!(m.snapshot()["state"]["seen"], json!({ "item": 0, "mob": 0, "spell": 0 }));
}
