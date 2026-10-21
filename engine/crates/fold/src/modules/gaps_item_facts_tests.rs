//! What a copied item page can carry beyond where it dropped (owner, 2026-10-20,
//! plans/2026-10-20-gaps-item-page-facts.md): the zones it was foraged in, and the tradeskill a
//! combine of it raised. On the parent test file's corpus.

use super::{feed, module, GapsModule};
use crate::event::Event;
use crate::EqModule;
use serde_json::{json, Value};

fn line(text: &str) -> Value {
    json!({ "kind": "unknown", "raw": format!("[Tue Oct 20 22:27:39 2026] {text}") })
}

/// An event at the log's second `sec`: lines of one second share a stamp, as the parser gives them.
fn at(m: &mut GapsModule, seq: i64, sec: i64, mut ev: Value) {
    ev["seq"] = json!(seq);
    ev["ts"] = json!(1_791_339_146_000_i64 + sec * 1000);
    if ev.get("raw").is_none() {
        ev["raw"] = json!(format!("[Tue Oct 20 22:27:39 2026] line {seq}"));
    }
    m.on_event(&Event::from_value(ev), false);
}

fn item_row(m: &GapsModule, name: &str) -> Value {
    let served = m.snapshot()["state"]["rows"].clone();
    let rows = served.as_array().cloned().unwrap_or_default();
    rows.into_iter().find(|r| r["domain"] == "item" && r["name"] == name).unwrap_or(Value::Null)
}

#[test]
fn a_forage_zone_is_kept_apart_from_the_zones_it_was_looted_in() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "zone", "zone": "Qeynos Hills" }));
    feed(&mut m, 2, line("You have scrounged up a Gray Wolf Skull."));
    feed(&mut m, 3, json!({ "kind": "zone", "zone": "Blackburrow" }));
    feed(&mut m, 4, json!({ "kind": "loot", "item": "Gray Wolf Skull", "source": "a gnoll" }));
    feed(&mut m, 5, json!({ "kind": "zone", "zone": "Qeynos Hills" }));
    feed(&mut m, 6, line("You have scrounged up a Gray Wolf Skull."));
    let row = item_row(&m, "Gray Wolf Skull");
    assert_eq!(row["kinds"], json!(["foraged", "looted"]));
    assert_eq!(row["details"]["zones"]["all"], json!(["Blackburrow", "Qeynos Hills"]));
    let forage = &row["details"]["forageZones"];
    assert_eq!(forage["entries"], json!([{ "name": "Qeynos Hills", "n": 2 }]));
    assert_eq!(forage["all"], json!(["Qeynos Hills"]));
}

#[test]
fn a_row_never_foraged_has_no_forage_list() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "zone", "zone": "Blackburrow" }));
    feed(&mut m, 2, json!({ "kind": "loot", "item": "Gnoll Fang", "source": "a gnoll" }));
    assert!(item_row(&m, "Gnoll Fang")["details"].get("forageZones").is_none());
}

#[test]
fn a_combine_carries_the_tradeskill_its_second_raised_in_either_order() {
    let mut m = module();
    let made = |item: &str| json!({ "kind": "itemReceived", "item": item, "via": "fashioned" });
    let tick = |skill: &str| json!({ "kind": "skillUp", "skill": skill, "value": 4 });
    // A success: the tick first.
    at(&mut m, 1, 10, tick("Jewelry Making"));
    at(&mut m, 2, 10, made("Silver Malachite Ring"));
    // A failure: the tick after the line.
    at(&mut m, 3, 20, line("You lacked the skills to fashion Silver Malachite Ring."));
    at(&mut m, 4, 20, tick("Jewelry Making"));
    // A tick a second off, or of a skill no combine raises, names nothing.
    at(&mut m, 5, 30, tick("Brewing"));
    at(&mut m, 6, 31, made("Bog Juice"));
    at(&mut m, 7, 40, made("Edible Goo"));
    at(&mut m, 8, 40, tick("Kick"));
    let ring = item_row(&m, "Silver Malachite Ring");
    assert_eq!(ring["kinds"], json!(["crafted", "failed-combine"]));
    assert_eq!(ring["details"]["tradeskills"]["entries"], json!([{ "name": "Jewelry Making", "n": 2 }]));
    for item in ["Bog Juice", "Edible Goo"] {
        let row = item_row(&m, item);
        assert_eq!(row["kinds"], json!(["crafted"]), "{item}");
        assert!(row["details"].get("tradeskills").is_none(), "{item}");
    }
}

#[test]
fn an_alternate_product_is_a_crafted_item() {
    let mut m = module();
    feed(&mut m, 1, line("You have fashioned the items together to create alternate product: Empty Bottle."));
    assert_eq!(item_row(&m, "Empty Bottle")["kinds"], json!(["crafted"]));
}
