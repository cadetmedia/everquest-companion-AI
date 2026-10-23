//! A turn-in line names the item, then the NPC: `You offered 1 <item> to <NPC>.` An item name may
//! hold " to " itself (owner's log, 2026-10-22 23:28:58: `You offered 1 Plea to Freeport to Sir
//! Mollin.`), so the NPC is what follows the LAST " to ".

use eqlog::event::Ev;
use eqlog::{Clock, Parser};
use serde_json::Value;

fn parsed(text: &str) -> Value {
    let p = Parser::new(
        Clock::new(chrono_tz::America::Los_Angeles),
        None,
        Some("Drywrought".to_string()),
    );
    let mut ev = Ev::new();
    assert!(
        p.parse_event(&format!("[Thu Oct 22 23:28:58 2026] {text}"), 0, &mut ev),
        "{text}"
    );
    serde_json::from_str(ev.finish()).unwrap()
}

#[test]
fn an_item_named_with_to_is_offered_whole_to_the_npc_after_the_last_to() {
    let v = parsed("You offered 1 Plea to Freeport to Sir Mollin.");
    assert_eq!(v["kind"], "offer");
    assert_eq!(v["item"], "Plea to Freeport");
    assert_eq!(v["npc"], "Sir Mollin");
    let v = parsed("You offered 1 Encoded Missive to Dorian G`Wyn.");
    assert_eq!(v["item"], "Encoded Missive");
    assert_eq!(v["npc"], "Dorian G`Wyn");
}
