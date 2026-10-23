//! An NPC handing a quest item over prints `You have been given: <item>` (owner's log, 2026-10-22:
//! 14 lines, Encoded Missive from Ty`Klerr among them). It is an item received, by "given".

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
        p.parse_event(&format!("[Thu Oct 22 22:27:39 2026] {text}"), 0, &mut ev),
        "{text}"
    );
    serde_json::from_str(ev.finish()).unwrap()
}

#[test]
fn a_quest_item_an_npc_hands_over_is_received_by_given() {
    let v = parsed("You have been given: Encoded Missive");
    assert_eq!(v["kind"], "itemReceived");
    assert_eq!(v["item"], "Encoded Missive");
    assert_eq!(v["via"], "given");
    let v = parsed("You have been given: Void-Touched Potential");
    assert_eq!(v["item"], "Void-Touched Potential");
}
