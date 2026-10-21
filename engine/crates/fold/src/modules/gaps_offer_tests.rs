//! Merchant offers on the gap rows (owner, 2026-10-20), on the parent test file's corpus.

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
