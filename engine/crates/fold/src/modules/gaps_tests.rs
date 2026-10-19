//! The gaps module on synthetic events against a three-name corpus and the real spell catalog.

use super::GapsModule;
use crate::event::Event;
use crate::knowledge::{Answer, GapIndex, Knowledge, Miss, OwnLoot};
use crate::EqModule;
use serde_json::{json, Value};
use std::sync::Arc;

/// Knows one item and one mob, and would panic if a lookup that notes a miss were ever asked.
struct Corpus;

impl Knowledge for Corpus {
    fn item(&self, _name: &str) -> Answer {
        panic!("the gaps module must never ask a lookup that notes a miss")
    }
    /// The roster states one alias: the god by his title.
    fn identity_keys(&self, mob: &str) -> Vec<String> {
        let key = super::mob_key(mob);
        if key == "innoruuk, the prince of hate" {
            return vec!["innoruuk".to_string(), key];
        }
        vec![key]
    }
    fn mob(&self, _name: &str, _loot: &dyn OwnLoot) -> Answer {
        panic!("the gaps module must never ask a lookup that notes a miss")
    }
    fn known_mob(&self, name: &str) -> bool {
        matches!(super::mob_key(name).as_str(), "a decaying skeleton" | "innoruuk")
    }
    /// The corpus's one vendor, a `{{MerchantPage}}` on the wiki.
    fn known_merchant(&self, name: &str) -> bool {
        name == "Klok Koglin"
    }
    fn take_misses(&self) -> Vec<Miss> {
        Vec::new()
    }
    fn item_names(&self) -> Vec<String> {
        // Page TITLES, as the bazaar matches them — not what the gaps module checks against.
        vec!["Bone Chips".to_string(), "Copper Ring (Ring of Opolla)".to_string()]
    }
    /// The DB's KEYS: a disambiguated page is keyed by its name too; the wiki spells the potion
    /// with an apostrophe where the game prints a backtick.
    fn gap_index(&self) -> GapIndex {
        let item_pages = [
            ("bone chips", "Bone Chips"),
            ("copper ring", "Copper Ring (Ring of Opolla)"),
            ("copper ring (ring of opolla)", "Copper Ring (Ring of Opolla)"),
            ("10 dose ant's potion", "10 Dose Ant's Potion"),
            ("torn, frost covered book", "Torn, Frost Covered Book"),
            ("tier'dal arcane insignia", "Tier'Dal Arcane Insignia"),
            ("bone chops", "Bone Chops"),
            ("rat meat", "Rat Meat"),
            ("giant scarab egg sack", "Giant Scarab Egg Sack"),
            ("desecrated kejaar totem", "Desecrated Kejaar Totem"),
        ]
        .iter()
        .map(|(k, p)| (k.to_string(), p.to_string()))
        .collect();
        // The catalog's names as the wiki writes them: a god's disambiguated page, a name with
        // no article, a page split by zone.
        let mob_names = ["a decaying skeleton", "Cazic-Thule (God)", "fire giant warrior", "a kobold (Warrens)", "an imp / imp"];
        GapIndex {
            item_pages,
            item_effects: vec![("Summon Horse".to_string(), "Black Chain Bridle".to_string())],
            mob_names: mob_names.iter().map(|n| n.to_string()).collect(),
        }
    }
}


fn module() -> GapsModule {
    let mut m = GapsModule::new();
    m.install_knowledge(&(Arc::new(Corpus) as Arc<dyn Knowledge>));
    m
}

fn feed(m: &mut GapsModule, seq: i64, mut ev: Value) {
    ev["seq"] = json!(seq);
    ev["ts"] = json!(1_791_339_146_000_i64 + seq);
    if ev.get("raw").is_none() {
        ev["raw"] = json!(format!("[Tue Oct 06 18:12:26 2026] line {seq}"));
    }
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
    assert_eq!(state["totals"], json!({ "item": 1, "mob": 1, "spell": 1, "merchant": 0 }));
    assert_eq!(state["seen"], json!({ "item": 2, "mob": 2, "spell": 2, "merchant": 0 }));
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
    assert_eq!(m.snapshot()["state"]["seen"], json!({ "item": 0, "mob": 0, "spell": 0, "merchant": 0 }));
}

#[test]
fn details_say_where_and_from_whom_and_keep_the_last_lines() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "zone", "zone": "Paineel" }));
    feed(&mut m, 2, json!({ "kind": "loot", "item": "Glowing Widget", "source": "a nameless thing", "disposition": "depot" }));
    feed(&mut m, 3, json!({ "kind": "zone", "zone": "The Hole" }));
    feed(&mut m, 4, json!({ "kind": "loot", "item": "Glowing Widget", "source": "a nameless thing" }));
    feed(&mut m, 5, json!({ "kind": "purchase", "item": "Glowing Widget", "npc": "Klok Koglin" }));
    feed(&mut m, 6, json!({ "kind": "consider", "mob": "A nameless thing", "level": 12, "faction": "scowls" }));
    feed(&mut m, 7, json!({ "kind": "death", "name": "a nameless thing", "bySelf": true }));
    let rows = m.snapshot()["state"]["rows"].clone();
    let item = &rows[0]["details"];
    assert_eq!(
        item["zones"],
        json!({ "entries": [{ "name": "The Hole", "n": 2 }, { "name": "Paineel", "n": 1 }], "distinct": 2, "all": ["Paineel", "The Hole"] })
    );
    assert_eq!(
        item["sources"],
        json!({ "entries": [{ "name": "a nameless thing", "n": 2 }, { "name": "Klok Koglin", "n": 1 }], "distinct": 2 })
    );
    assert_eq!(item["dispositions"]["entries"], json!([{ "name": "depot", "n": 1 }]));
    assert_eq!(
        item["samples"],
        json!(["[Tue Oct 06 18:12:26 2026] line 2", "[Tue Oct 06 18:12:26 2026] line 4", "[Tue Oct 06 18:12:26 2026] line 5"])
    );
    assert!(item.get("drops").is_none(), "an item has no drops list");
    let mob = &rows[1]["details"];
    assert_eq!(mob["drops"]["entries"], json!([{ "name": "Glowing Widget", "n": 2 }]));
    assert_eq!(mob["cons"]["entries"], json!([{ "name": "L12 scowls", "n": 1 }]));
    assert_eq!(mob["killers"]["entries"], json!([{ "name": "you", "n": 1 }]));
}

#[test]
fn a_capped_list_serves_the_most_frequent_and_still_counts_the_rest() {
    let mut m = module();
    let mut seq = 0;
    for zone in 0..10 {
        seq += 1;
        feed(&mut m, seq, json!({ "kind": "zone", "zone": format!("Zone {zone:02}") }));
        for _ in 0..(if zone == 9 { 3 } else { 1 }) {
            seq += 1;
            feed(&mut m, seq, json!({ "kind": "castBegin", "spell": "Totally Made Up" }));
        }
    }
    let zones = m.snapshot()["state"]["rows"][0]["details"]["zones"].clone();
    assert_eq!(zones["distinct"], json!(10));
    let names: Vec<&str> = zones["entries"].as_array().expect("entries").iter().filter_map(|e| e["name"].as_str()).collect();
    assert_eq!(names.len(), 8);
    assert_eq!(names[0], "Zone 09", "the most frequent first");
    assert_eq!(&names[1..], ["Zone 00", "Zone 01", "Zone 02", "Zone 03", "Zone 04", "Zone 05", "Zone 06"]);
    // Every zone by name, beyond the cap, for the tab's "this zone" filter.
    assert_eq!(zones["all"].as_array().expect("all").len(), 10);
    assert_eq!(m.snapshot()["state"]["rows"][0]["count"], json!(12));
    assert_eq!(m.snapshot()["state"]["rows"][0]["details"]["casters"]["entries"], json!([{ "name": "you", "n": 12 }]));
}

#[test]
fn the_coin_a_sale_on_loot_or_a_purchase_printed_is_read_off_the_line() {
    let sold = "[Sat Oct 10 16:11:23 2026] You looted a Glowing Widget from a treant's corpse and sold it for 4 platinum, 2 gold, 1 silver and 4 copper.";
    let free = "[Sat Oct 10 16:11:24 2026] You looted a Glowing Widget from a treant's corpse and sold it for free.";
    let bought = "[Sat Oct 10 19:20:04 2026] You purchased 100 Glowing Widgets from Klok Koglin for  5 platinum 2 gold.";
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "loot", "item": "Glowing Widget", "source": "a treant", "disposition": "sold", "raw": sold }));
    feed(&mut m, 2, json!({ "kind": "loot", "item": "Glowing Widget", "source": "a treant", "disposition": "sold", "raw": sold }));
    feed(&mut m, 3, json!({ "kind": "loot", "item": "Glowing Widget", "source": "a treant", "disposition": "sold", "raw": free }));
    feed(&mut m, 4, json!({ "kind": "purchase", "item": "Glowing Widget", "npc": "Klok Koglin", "count": 100, "raw": bought }));
    let d = m.snapshot()["state"]["rows"][0]["details"].clone();
    assert_eq!(
        d["sales"],
        json!({ "entries": [{ "name": "4 platinum 2 gold 1 silver 4 copper", "n": 2 }], "distinct": 1 })
    );
    assert_eq!(d["salesCopper"], json!(2 * 4214));
    assert_eq!(d["paid"], json!({ "entries": [{ "name": "5 platinum 2 gold", "n": 1 }], "distinct": 1 }));
    assert_eq!(d["paidCopper"], json!(5200));
    assert_eq!(d["dispositions"]["entries"], json!([{ "name": "sold", "n": 3 }]), "free is still a sale");

    let mut only_free = module();
    feed(&mut only_free, 1, json!({ "kind": "loot", "item": "Glowing Widget", "source": "a treant", "disposition": "sold", "raw": free }));
    let d = only_free.snapshot()["state"]["rows"][0]["details"].clone();
    assert!(d.get("sales").is_none() && d.get("salesCopper").is_none(), "free is no price");
}

#[test]
fn a_later_destroy_line_adds_its_disposition_and_line_but_no_zone_no_count_no_kind() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "zone", "zone": "The Stonebrunt Mountains" }));
    feed(&mut m, 2, json!({ "kind": "loot", "item": "Glowing Widget +1", "source": "a highland kobold shaman" }));
    feed(&mut m, 3, json!({ "kind": "zone", "zone": "New Sebilis Expedition" }));
    feed(&mut m, 4, json!({ "kind": "loot", "item": "Glowing Widget +1", "disposition": "destroyed", "count": 1 }));
    let row = m.snapshot()["state"]["rows"][0].clone();
    assert_eq!(row["count"], json!(1));
    assert_eq!(row["kinds"], json!(["looted"]));
    let d = &row["details"];
    assert_eq!(
        d["zones"],
        json!({ "entries": [{ "name": "The Stonebrunt Mountains", "n": 1 }], "distinct": 1, "all": ["The Stonebrunt Mountains"] })
    );
    assert_eq!(d["dispositions"]["entries"], json!([{ "name": "destroyed", "n": 1 }]));
    assert_eq!(d["sources"]["entries"], json!([{ "name": "a highland kobold shaman", "n": 1 }]));
    assert_eq!(d["samples"], json!(["[Tue Oct 06 18:12:26 2026] line 2", "[Tue Oct 06 18:12:26 2026] line 4"]));
    // The mob row took the loot line's zone and nothing from the destroy line.
    assert_eq!(m.snapshot()["state"]["rows"][1]["details"]["zones"]["distinct"], json!(1));
    assert_eq!(m.snapshot()["state"]["seen"]["item"], json!(1), "a disposal is not a name checked");

    // A name the log only ever destroyed is not filed.
    let mut only = module();
    feed(&mut only, 1, json!({ "kind": "loot", "item": "Glowing Widget", "disposition": "destroyed", "count": 1 }));
    assert!(rows(&only).is_empty());
    assert_eq!(only.published_seq(), Some(0));
}

#[test]
fn a_spell_rank_merged_is_no_item_and_an_unknown_merge_is_a_crafted_gap() {
    let mut m = module();
    // Real spells, as the merge line prints them: a rank, and a backtick where the catalog has an
    // apostrophe.
    feed(&mut m, 1, json!({ "kind": "itemMerge", "item": "Odium IX", "tier": null }));
    feed(&mut m, 2, json!({ "kind": "itemMerge", "item": "Jaxan`s Jig o` Vigor V", "tier": null }));
    assert!(rows(&m).is_empty());
    assert_eq!(m.snapshot()["state"]["seen"]["item"], json!(0), "a spell merged is not a name checked");
    feed(&mut m, 3, json!({ "kind": "itemMerge", "item": "Totally Made Up Thing +3", "tier": 3 }));
    assert_eq!(rows(&m), ["item Totally Made Up Thing x1 [crafted]"]);
}

#[test]
fn a_backtick_and_an_apostrophe_are_one_name_and_the_row_keeps_the_log_spelling() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "loot", "item": "10 Dose Ant`s Potion" }));
    feed(&mut m, 2, json!({ "kind": "castBegin", "spell": "Jaxan`s Jig o` Vigor V" }));
    assert!(rows(&m).is_empty(), "the corpus spells both with an apostrophe");
    assert_eq!(m.snapshot()["state"]["seen"], json!({ "item": 1, "mob": 0, "spell": 1, "merchant": 0 }));
    feed(&mut m, 3, json!({ "kind": "loot", "item": "Teir`Dal Arcane Insignia" }));
    feed(&mut m, 4, json!({ "kind": "loot", "item": "Teir'Dal Arcane Insignia" }));
    assert_eq!(rows(&m), ["item Teir`Dal Arcane Insignia x2 [looted]"]);
}

#[test]
fn a_scroll_is_known_by_its_spell_and_an_unknown_scroll_is_filed_whole() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "loot", "item": "Spell: Odium IX", "source": "a nameless thing" }));
    feed(&mut m, 2, json!({ "kind": "purchase", "item": "Song: Jaxan`s Jig o` Vigor V", "npc": "Klok Koglin" }));
    assert_eq!(
        rows(&m),
        ["mob a nameless thing x1 [dropped-by]"],
        "the scrolls' spells are in the catalog, so the scrolls are known"
    );
    assert_eq!(m.snapshot()["state"]["seen"]["item"], json!(2), "a known scroll is a name checked");
    feed(&mut m, 3, json!({ "kind": "itemReceived", "item": "Spell: Totally Made Up Spell", "via": "inventory" }));
    assert_eq!(
        rows(&m),
        ["item Spell: Totally Made Up Spell x1 [received]", "mob a nameless thing x1 [dropped-by]"]
    );
}

#[test]
fn a_reward_chest_tail_and_an_exaltation_tail_are_keyed_away() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "loot", "item": "Bone Chips from Reward Chest", "count": 3 }));
    feed(&mut m, 2, json!({ "kind": "loot", "item": "Bone Chips (Exaltation)" }));
    feed(&mut m, 3, json!({ "kind": "loot", "item": "Bone Chips +2 (Exaltation)" }));
    assert!(rows(&m).is_empty(), "the base is a known item");
    assert_eq!(m.snapshot()["state"]["seen"]["item"], json!(1), "one name, three spellings");
    // An unknown base keeps the whole spelling, so the row says where it came from.
    feed(&mut m, 4, json!({ "kind": "loot", "item": "Glowing Widget from Reward Chest" }));
    assert_eq!(rows(&m), ["item Glowing Widget from Reward Chest x1 [looted]"]);
}

#[test]
fn a_known_item_is_known_by_the_db_key_not_the_page_title() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "loot", "item": "Copper Ring", "source": "a nameless thing" }));
    assert_eq!(rows(&m), ["mob a nameless thing x1 [dropped-by]"], "the page is `Copper Ring (Ring of Opolla)`");
}

#[test]
fn the_loose_fold_matches_a_dropped_apostrophe_a_dash_a_comma_and_vs_and_nothing_more() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "loot", "item": "Torn, Frost-Covered Book" }));
    feed(&mut m, 2, json!({ "kind": "loot", "item": "Song: Angstlichs Appalling Screech" }));
    feed(&mut m, 3, json!({ "kind": "loot", "item": "Spell: Elnericks Entombment of Ice" }));
    feed(&mut m, 4, json!({ "kind": "purchase", "item": "Spell: Garrisons Mighty Mana Shock", "npc": "Klok Koglin" }));
    feed(&mut m, 5, json!({ "kind": "loot", "item": "Spell: Illusion: Half-Elf" }));
    feed(&mut m, 6, json!({ "kind": "loot", "item": "Spell: Invisibility versus Undead" }));
    feed(&mut m, 7, json!({ "kind": "castBegin", "spell": "Elnericks Entombment of Ice" }));
    feed(&mut m, 8, json!({ "kind": "itemMerge", "item": "Garrisons Mighty Mana Shock II" }));
    assert!(rows(&m).is_empty(), "every one is a loose match: {:?}", rows(&m));
    assert_eq!(m.snapshot()["state"]["seen"]["item"], json!(6));
    feed(&mut m, 9, json!({ "kind": "loot", "item": "Glowing Widget" }));
    feed(&mut m, 10, json!({ "kind": "loot", "item": "Spell: Totally Made Up" }));
    assert_eq!(rows(&m), ["item Glowing Widget x1 [looted]", "item Spell: Totally Made Up x1 [looted]"]);
}

fn suggest_of(m: &GapsModule, name: &str) -> Value {
    m.snapshot()["state"]["rows"]
        .as_array()
        .expect("rows")
        .iter()
        .find(|r| r["name"] == name)
        .map(|r| r["suggest"].clone())
        .expect("the row")
}

#[test]
fn a_name_one_character_from_one_known_name_suggests_that_page_and_nothing_else_does() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "loot", "item": "Teir`Dal Arcane Insignia" }));
    feed(&mut m, 2, json!({ "kind": "loot", "item": "Glowing Widget" }));
    feed(&mut m, 3, json!({ "kind": "castBegin", "spell": "Elnericks Entombment of Ise" }));
    assert_eq!(
        suggest_of(&m, "Teir`Dal Arcane Insignia"),
        json!({ "name": "Tier'Dal Arcane Insignia", "page": "Tier'Dal Arcane Insignia", "distance": 1 })
    );
    assert_eq!(suggest_of(&m, "Glowing Widget"), Value::Null, "far from everything");
    assert_eq!(
        suggest_of(&m, "Elnericks Entombment of Ise"),
        json!({ "name": "Elnerick's Entombment of Ice", "page": "Elnerick's Entombment of Ice", "distance": 1 })
    );
}

#[test]
fn a_doubtful_suggestion_is_silence() {
    let mut m = module();
    // One off from both Bone Chips and Bone Chops: not unique.
    feed(&mut m, 1, json!({ "kind": "loot", "item": "Bone Chaps" }));
    // Two off from Bone Chips, and ten characters is too short for two.
    feed(&mut m, 2, json!({ "kind": "loot", "item": "Bane Chaps" }));
    // One off from Bone Chips but a word more: not the same shape.
    feed(&mut m, 3, json!({ "kind": "loot", "item": "Bone Chip s" }));
    assert_eq!(suggest_of(&m, "Bone Chaps"), Value::Null);
    assert_eq!(suggest_of(&m, "Bane Chaps"), Value::Null);
    assert_eq!(suggest_of(&m, "Bone Chip s"), Value::Null);
}

#[test]
fn one_substituted_letter_in_a_short_name_is_a_different_word_but_a_dropped_letter_is_not() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "loot", "item": "Bat Meat" }));
    feed(&mut m, 2, json!({ "kind": "loot", "item": "Giant Scarab Egg Sac" }));
    feed(&mut m, 3, json!({ "kind": "loot", "item": "Desecrated Kejaar Tatem" }));
    assert_eq!(suggest_of(&m, "Bat Meat"), Value::Null, "a real item, one letter from Rat Meat");
    assert_eq!(
        suggest_of(&m, "Giant Scarab Egg Sac"),
        json!({ "name": "Giant Scarab Egg Sack", "page": "Giant Scarab Egg Sack", "distance": 1 })
    );
    assert_eq!(
        suggest_of(&m, "Desecrated Kejaar Tatem"),
        json!({ "name": "Desecrated Kejaar Totem", "page": "Desecrated Kejaar Totem", "distance": 1 }),
        "a substitution counts in a long name"
    );
}

/// The wiki's spellings, pets, AAs and item effects (owner ask, 2026-10-17): a file of their own
/// for the factoring bar, on this file's corpus.
#[path = "gaps_spelling_tests.rs"]
mod spelling;

#[test]
fn a_trader_the_wiki_lists_as_no_merchant_is_a_row_and_a_kill_keeps_its_faction_lines() {
    let mut m = module();
    let line = |text: &str| json!({ "kind": "unknown", "raw": format!("[Tue Oct 06 18:12:26 2026] {text}") });
    feed(&mut m, 1, line("Murga told you, 'That'll be 5 silver 3 copper per Tunic Pattern.'"));
    feed(&mut m, 2, line("Klok Koglin told you, 'That'll be 1 gold per Bread.'"));
    feed(&mut m, 3, json!({ "kind": "coin", "source": "vendor", "npc": "Murga", "item": "Bone Chips" }));
    assert_eq!(rows(&m), ["merchant Murga x2 [quoted,sold]"]);
    feed(&mut m, 4, line("Your faction standing with Undead Frogloks of Guk has been adjusted by -20."));
    feed(&mut m, 5, json!({ "kind": "death", "name": "a decaying skeleton", "killer": "You" }));
    let pairs = m.snapshot()["state"]["killFactions"].clone();
    assert_eq!(pairs, json!([{ "mob": "a decaying skeleton", "faction": "Undead Frogloks of Guk", "n": 1, "zone": "" }]));
}
