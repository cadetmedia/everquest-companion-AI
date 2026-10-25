//! Merchant offers on the gap rows (owner, 2026-10-20), and the other mentions that place an item
//! nowhere, on the parent test file's corpus.

use super::{feed, module, rows};
use crate::EqModule;
use serde_json::{json, Value};

fn line(text: &str) -> Value {
    json!({ "kind": "unknown", "raw": format!("[Tue Oct 20 22:27:39 2026] {text}") })
}

fn item_row(m: &super::GapsModule, name: &str) -> Value {
    let served = m.snapshot()["state"]["rows"].clone();
    let rows = served.as_array().cloned().unwrap_or_default();
    rows.into_iter().find(|r| r["domain"] == "item" && r["name"] == name).unwrap_or(Value::Null)
}

#[test]
fn an_offer_lands_on_the_item_row_with_the_standing_and_places_the_item_nowhere() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "zone", "zone": "Butcherblock Mountains" }));
    feed(&mut m, 2, json!({ "kind": "loot", "item": "Fungus Spores", "source": "a fungus man" }));
    feed(&mut m, 3, json!({ "kind": "zone", "zone": "Oggok" }));
    feed(&mut m, 4, json!({ "kind": "consider", "mob": "Klok Koglin", "faction": "ally", "level": 50 }));
    feed(&mut m, 5, line("Klok Koglin told you, 'I'll give you 1 platinum 1 gold 4 silver 3 copper for the Fungus Spores.'"));
    let row = item_row(&m, "Fungus Spores");
    assert_eq!(row["kinds"], json!(["looted", "appraised"]));
    assert_eq!(row["details"]["zones"]["all"], json!(["Butcherblock Mountains"]), "the sale's zone is not the item's");
    let offer = json!({ "merchant": "Klok Koglin", "coin": "1 platinum 1 gold 4 silver 3 copper", "copper": 1143, "standing": "ally", "zone": "Oggok", "n": 1, "last": "2026-10-20 22:27:39" });
    assert_eq!(row["details"]["offers"], json!([offer]));
    assert!(row["details"]["samples"].as_array().is_some_and(|s| s.len() == 2), "the offer line is proof too");
}

#[test]
fn an_offer_with_no_con_has_no_standing_and_a_known_item_is_no_row() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "zone", "zone": "Oggok" }));
    feed(&mut m, 2, line("Klok Koglin told you, 'I'll give you 5 silver 7 copper per Pristine Lizard Scale'"));
    feed(&mut m, 3, line("Klok Koglin told you, 'I'll give you 2 copper per Bone Chips'"));
    assert_eq!(rows(&m), ["item Pristine Lizard Scale x1 [appraised]"], "the known merchant and item are no rows");
    let row = item_row(&m, "Pristine Lizard Scale");
    assert!(row["details"].get("zones").is_none(), "an item only offered was placed nowhere");
    let offer = &row["details"]["offers"][0];
    assert_eq!((offer["copper"].as_i64(), offer["per"].as_bool()), (Some(57), Some(true)));
    assert!(offer.get("standing").is_none(), "no con of the merchant, no standing");
}

#[test]
fn a_merchant_the_wiki_does_not_list_is_a_row_by_its_offer() {
    let mut m = module();
    feed(&mut m, 1, line("Elder Jantiz told you, 'I'll give you absolutely nothing for the Bone Chips.'"));
    assert_eq!(rows(&m), ["merchant Elder Jantiz x1 [appraised]"]);
}

/// The owner's lines, 2026-10-23: what a merchant quoted is its stock, priced only at ally.
#[test]
fn a_merchants_quotes_are_its_items_sold_priced_where_the_player_stood_at_ally_and_a_sale_to_it_is_none() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "zone", "zone": "Lake Nerius" }));
    feed(&mut m, 2, line("Mindiinya N`Zar told you, 'That'll be 2 gold 9 copper per Cat's Eye Agate.'"));
    feed(&mut m, 3, json!({ "kind": "consider", "mob": "Kaelin K`Toz", "faction": "ally", "level": 50 }));
    feed(&mut m, 4, line("Kaelin K`Toz told you, 'That'll be 104 platinum 9 gold 9 silver 9 copper per Platinum Bar.'"));
    feed(&mut m, 5, line("Kaelin K`Toz told you, 'That'll be 1 platinum 4 silver 9 copper for the Jeweler's Kit.'"));
    feed(&mut m, 6, line("Kaelin K`Toz told you, 'I'll give you 3 copper for the Bone Chips.'"));
    feed(&mut m, 7, json!({ "kind": "purchase", "npc": "Kaelin K`Toz", "item": "Bone Chips", "count": 1 }));
    let served = m.snapshot()["state"]["rows"].clone();
    let sold = |name: &str| served.as_array().and_then(|r| r.iter().find(|r| r["domain"] == "merchant" && r["name"] == name)).map(|r| r["itemsSold"].clone());
    // Bone Chips is bought, not offered to it, and goes under the catalog's title.
    assert_eq!(sold("Kaelin K`Toz"), Some(json!([{ "item": "Bone Chips" }, { "item": "Jeweler's Kit", "copper": 1049 }, { "item": "Platinum Bar", "copper": 104_999 }])));
    assert_eq!(sold("Mindiinya N`Zar"), Some(json!([{ "item": "Cat's Eye Agate" }])), "no con before the quote, no price");
}

/// The owner's Merchants rows, 2026-10-23: every one said "needs: level (/con)" though each was
/// conned (`Mindiinya N`Zar regards you as an ally -- looks like quite a gamble. (Lvl: 50)`). The con
/// files on the Mobs row; the Merchants row is served the name's cons too, so its page has a level.
/// Since 2026-10-23 that Mobs row is not served beside it (a merchant is a Merchants row only).
#[test]
fn a_merchants_row_carries_the_cons_of_its_name() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "zone", "zone": "Lake Nerius" }));
    feed(&mut m, 2, json!({ "kind": "consider", "mob": "Mindiinya N`Zar", "faction": "ally", "level": 50 }));
    feed(&mut m, 3, line("Mindiinya N`Zar told you, 'That'll be 2 gold 9 copper per Cat's Eye Agate.'"));
    let served = m.snapshot()["state"]["rows"].clone();
    let row = |domain: &str| served.as_array().and_then(|r| r.iter().find(|r| r["domain"] == domain && r["name"] == "Mindiinya N`Zar")).cloned();
    assert_eq!(row("merchant").map(|r| r["details"]["cons"].clone()), Some(json!({ "entries": [{ "name": "L50 ally", "n": 1 }], "distinct": 1 })));
    assert_eq!(row("mob"), None, "a merchant is not served under Mobs (owner, 2026-10-23)");
}

#[test]
fn a_fusion_or_a_combine_places_the_item_nowhere_either() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "zone", "zone": "Nektropos Castle" }));
    feed(&mut m, 2, json!({ "kind": "loot", "item": "Glowing Widget", "source": "a nameless thing" }));
    feed(&mut m, 3, json!({ "kind": "zone", "zone": "Lake Nerius" }));
    feed(&mut m, 4, json!({ "kind": "itemMerge", "item": "Glowing Widget +1", "tier": 1 }));
    feed(&mut m, 5, json!({ "kind": "itemReceived", "item": "Glowing Widget", "via": "fashioned" }));
    let row = item_row(&m, "Glowing Widget");
    assert_eq!(row["kinds"], json!(["looted", "fused", "crafted"]));
    // Owner, 2026-10-25: looted in the castle, fused in the lake, listed under the lake.
    assert_eq!(row["details"]["zones"]["all"], json!(["Nektropos Castle"]), "where it was made is not where it drops");
}
