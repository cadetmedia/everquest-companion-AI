//! The 2026-10-19 review's engine rules (docs/community/audits/2026-10-19-gaps-review.md), on the
//! parent test file's corpus.

use super::{feed, module, rows};
use crate::EqModule;
use serde_json::json;

#[test]
fn hails_and_cons_of_one_word_names_are_rows_that_may_be_players_until_shown_otherwise() {
    let mut m = module();
    let line = |text: &str| json!({ "kind": "unknown", "raw": format!("[Tue Oct 06 18:12:26 2026] {text}") });
    feed(&mut m, 1, json!({ "kind": "zone", "zone": "Oggok" }));
    feed(&mut m, 2, line("You say, 'Hail, Grapok'"));
    feed(&mut m, 3, line("You say, 'Hail, a kejekan lookout'"));
    feed(
        &mut m,
        4,
        json!({ "kind": "consider", "mob": "Kamas", "level": 50 }),
    );
    let served = m.snapshot()["state"]["rows"].clone();
    let maybe: Vec<(String, bool)> = served
        .as_array()
        .expect("rows")
        .iter()
        .map(|r| {
            (
                r["name"].as_str().unwrap_or("").to_string(),
                r["maybePlayer"] == true,
            )
        })
        .collect();
    assert!(maybe.contains(&("Grapok".to_string(), true)));
    assert!(maybe.contains(&("Kamas".to_string(), true)));
    assert!(
        maybe.contains(&("a kejekan lookout".to_string(), false)),
        "a mob-shaped name is a mob"
    );
    // Grapok answers the hail: an NPC. Kamas chats: a player, and the row goes.
    feed(&mut m, 5, line("Grapok says, 'Hi Drywrought.'"));
    feed(&mut m, 6, line("Kamas tells the guild, 'that con was me'"));
    let served = m.snapshot()["state"]["rows"].clone();
    let names: Vec<&str> = served
        .as_array()
        .expect("rows")
        .iter()
        .filter_map(|r| r["name"].as_str())
        .collect();
    assert!(!names.contains(&"Kamas"));
    let grapok = served
        .as_array()
        .expect("rows")
        .iter()
        .find(|r| r["name"] == "Grapok")
        .expect("Grapok");
    assert!(
        grapok.get("maybePlayer").is_none(),
        "an NPC once it answered"
    );
}

#[test]
fn a_forage_the_ability_switch_and_a_starred_guard() {
    let mut m = module();
    let line = |text: &str| json!({ "kind": "unknown", "raw": format!("[Tue Oct 06 18:12:26 2026] {text}") });
    feed(
        &mut m,
        1,
        line("You have scrounged up a Tuft of Black Bear Fur."),
    );
    feed(
        &mut m,
        2,
        json!({ "kind": "otherCastBegin", "caster": "Vladdq", "spell": "Use Ability" }),
    );
    feed(
        &mut m,
        3,
        json!({ "kind": "death", "name": "*Guard Willia", "bySelf": true }),
    );
    // The loot line strips its own article; the wiki titles the page `A skeletal finger`.
    feed(
        &mut m,
        4,
        json!({ "kind": "loot", "item": "Skeletal Finger", "source": "a decaying skeleton" }),
    );
    assert_eq!(
        rows(&m),
        [
            "item Tuft of Black Bear Fur x1 [foraged]",
            "mob *Guard Willia x1 [killed]"
        ]
    );
}

#[test]
fn a_mob_rampaging_is_served_for_its_page() {
    let mut m = module();
    feed(
        &mut m,
        1,
        json!({ "kind": "damage", "attacker": "Lord of Ire", "target": "You", "modifiers": ["Flurry"] }),
    );
    assert_eq!(
        m.snapshot()["state"]["mobSpecials"],
        json!([{ "mob": "Lord of Ire", "specials": ["Flurries"] }])
    );
}
