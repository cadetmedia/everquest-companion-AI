//! NPC roles, fished items, turn-ins and the Quests rows (owner, 2026-10-22), on the parent test
//! file's corpus and the owner's lines.

use super::{feed, module, rows};
use crate::EqModule;
use serde_json::{json, Value};

fn line(text: &str) -> Value {
    json!({ "kind": "unknown", "raw": format!("[Thu Oct 22 23:10:26 2026] {text}") })
}

fn row(m: &super::GapsModule, domain: &str, name: &str) -> Value {
    let served = m.snapshot()["state"]["rows"].clone();
    let hit = served.as_array().expect("rows").iter().find(|r| r["domain"] == domain && r["name"] == name).cloned();
    hit.unwrap_or(Value::Null)
}

#[test]
fn a_player_target_withdraws_its_row_and_an_npc_target_gives_the_row_its_role() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "consider", "mob": "Malkil", "level": 46 }));
    assert_eq!(rows(&m), ["mob Malkil x1 [considered]"]);
    feed(&mut m, 2, line("Targeted (Player): Malkil"));
    assert!(rows(&m).is_empty(), "a player is never a mob row");
    feed(&mut m, 3, json!({ "kind": "consider", "mob": "Malkil", "level": 46 }));
    assert!(rows(&m).is_empty(), "and stays a player");
    // Neuven F`Lok, conned and targeted as the bank: the row serves the role.
    feed(&mut m, 4, json!({ "kind": "consider", "mob": "Neuven F`Lok", "level": 50 }));
    feed(&mut m, 5, line("Targeted (Banker): Neuven F`Lok"));
    assert_eq!(row(&m, "mob", "Neuven F`Lok")["role"], json!("Banker"));
    // A one-word merchant is an NPC by its target line: never "may be a player". A merchant is a
    // Merchants row only (owner, 2026-10-23), so its con's row is served there.
    feed(&mut m, 6, json!({ "kind": "consider", "mob": "Kogg", "level": 30 }));
    feed(&mut m, 7, line("Targeted (Merchant): Kogg"));
    assert!(row(&m, "mob", "Kogg").is_null());
    let kogg = row(&m, "merchant", "Kogg");
    assert_eq!(kogg["role"], json!("Merchant"));
    assert!(kogg.get("maybePlayer").is_none());
}

/// Owner, 2026-10-23: "if an NPC is a merchant, do not show it on mobs, only show it on merchants".
/// A conned vendor the catalog lacks, then a price quote: one Merchants row, no Mobs row, and the
/// counts say the same. A plain mob beside it stays a Mobs row.
#[test]
fn a_merchant_is_served_under_merchants_only_and_counted_there() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "consider", "mob": "Mindiinya N`Zar", "level": 40 }));
    feed(&mut m, 2, json!({ "kind": "consider", "mob": "a swamp lurker", "level": 12 }));
    assert!(!row(&m, "mob", "Mindiinya N`Zar").is_null(), "before any trade, a conned NPC is a mob");
    feed(&mut m, 3, line("Mindiinya N`Zar told you, 'That'll be 2 gold 9 copper per Cat's Eye Agate.'"));
    assert!(row(&m, "mob", "Mindiinya N`Zar").is_null(), "no Mobs row beside its Merchants row");
    assert!(!row(&m, "merchant", "Mindiinya N`Zar").is_null());
    assert!(!row(&m, "mob", "a swamp lurker").is_null());
    let totals = m.snapshot()["state"]["totals"].clone();
    assert_eq!((totals["mob"].clone(), totals["merchant"].clone()), (json!(1), json!(1)));
}

#[test]
fn a_catch_files_a_fished_item_with_its_zone_and_a_turn_in_files_the_item() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "zone", "zone": "Lake Nerius" }));
    feed(&mut m, 2, line("You caught Fetid Lake Muck!"));
    feed(&mut m, 3, line("You caught something..."));
    feed(&mut m, 4, line("You caught Bone Chips!"));
    assert_eq!(rows(&m), ["item Fetid Lake Muck x1 [fished]"], "a known catch is no row");
    assert_eq!(row(&m, "item", "Fetid Lake Muck")["fishedIn"], json!(["Lake Nerius"]));
    // Owner, 2026-10-22, 23:28:58: Plea to Freeport, only ever in the export, turned in.
    feed(&mut m, 5, json!({ "kind": "offer", "item": "Plea to Freeport", "npc": "Sir Mollin", "raw": "[Thu Oct 22 23:28:58 2026] You offered 1 Plea to Freeport to Sir Mollin." }));
    let plea = row(&m, "item", "Plea to Freeport");
    assert_eq!(plea["kinds"], json!(["offered"]));
    assert!(plea["questFacts"].is_null(), "an offer is no turn-in until its trade completes (review E4)");
    feed(&mut m, 6, json!({ "kind": "trade", "npc": "Sir Mollin" }));
    let plea = row(&m, "item", "Plea to Freeport");
    assert_eq!(plea["questFacts"]["turnedInTo"], json!([{ "npc": "Sir Mollin", "n": 1 }]));
    // A hand-over to a player proves nothing to file.
    feed(&mut m, 7, json!({ "kind": "offer", "item": "Ancient Signet Ring", "npc": "Malkil" }));
    assert!(row(&m, "item", "Ancient Signet Ring").is_null());
}

/// Owner's log, 2026-10-22 23:41:53 and 23:29: Appeal of Neriak taken by Pishtian F`Lok, and A Curt
/// Dismissal handed back by Sir Mollin, which is no turn-in (the coordinator's rule).
#[test]
fn a_refused_hand_in_is_no_turn_in_but_the_item_is_still_filed() {
    let mut m = module();
    let offer = |item: &str, npc: &str| json!({ "kind": "offer", "item": item, "npc": npc, "raw": format!("[Thu Oct 22 23:41:53 2026] You offered 1 {item} to {npc}.") });
    feed(&mut m, 1, offer("Appeal of Neriak", "Pishtian F`Lok"));
    feed(&mut m, 2, json!({ "kind": "itemReceived", "item": "Exorbitant Commission", "via": "given" }));
    feed(&mut m, 3, line("Your task 'Call for Aid' has been updated."));
    feed(&mut m, 4, json!({ "kind": "trade", "npc": "Pishtian F`Lok" }));
    let appeal = row(&m, "item", "Appeal of Neriak");
    assert_eq!(appeal["questFacts"]["turnedInTo"], json!([{ "npc": "Pishtian F`Lok", "n": 1 }]));
    assert_eq!(appeal["questFacts"]["quests"], json!(["Call for Aid"]));
    feed(&mut m, 5000, offer("A Curt Dismissal", "Sir Mollin"));
    feed(&mut m, 5001, line("Sir Mollin says, 'I have no need for this, Drywrought. You can have it back.'"));
    let curt = row(&m, "item", "A Curt Dismissal");
    assert_eq!(curt["kinds"], json!(["offered"]), "the item exists all the same");
    assert!(curt.get("questFacts").is_none(), "Sir Mollin is no turn-in target: {curt}");
}

#[test]
fn every_task_the_log_names_is_a_quest_row_with_its_steps() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "zone", "zone": "Lake Nerius" }));
    feed(&mut m, 2, line("You say, 'help'"));
    feed(&mut m, 3, line("You have been assigned the task 'Something Fishy'."));
    feed(&mut m, 4, line("Nikko Canti says, 'That's so kind of you! Here I have an old fishing pole you can use, and some bait!'"));
    feed(&mut m, 5000, line("Your task 'Something Fishy' has been updated."));
    assert_eq!(rows(&m), ["mob Nikko Canti x1 [spoke]", "quest Something Fishy x2 [assigned,updated]"]);
    let q = row(&m, "quest", "Something Fishy");
    assert_eq!(q["quest"]["giver"], json!("Nikko Canti"));
    assert_eq!(q["quest"]["zone"], json!("Lake Nerius"));
    assert_eq!(m.snapshot()["state"]["totals"]["quest"], json!(1));
}
