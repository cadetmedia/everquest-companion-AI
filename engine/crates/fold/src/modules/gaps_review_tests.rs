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

#[test]
fn a_one_word_name_conned_above_the_player_cap_is_an_npc_row_never_a_maybe_player() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "zone", "zone": "Oggok" }));
    // `Bordag regards you indifferently -- what would you like your tombstone to say? (Lvl: 70)`
    feed(&mut m, 2, json!({ "kind": "consider", "mob": "Bordag", "level": 70 }));
    let line = |text: &str| json!({ "kind": "unknown", "raw": format!("[Sun Oct 18 20:26:58 2026] {text}") });
    feed(&mut m, 3, line("Bordag tells you, 'not a player'"));
    let served = m.snapshot()["state"]["rows"].clone();
    let bordag = served
        .as_array()
        .expect("rows")
        .iter()
        .find(|r| r["name"] == "Bordag")
        .expect("Bordag stays a row");
    assert!(bordag.get("maybePlayer").is_none(), "level 70 is no player's level");
}

#[test]
fn a_kill_claims_the_corpse_coin_printed_just_before_it_and_the_snapshot_serves_each_mob_range() {
    let mut m = module();
    let coin = |text: &str| json!({ "kind": "coin", "source": "corpse", "raw": format!("[Tue Oct 06 18:20:21 2026] {text}") });
    feed(&mut m, 1, coin("You receive 4 silver and 1 copper from the corpse."));
    feed(&mut m, 2, json!({ "kind": "death", "name": "a rabid kobold", "bySelf": true }));
    feed(&mut m, 3, coin("You receive 2 gold and 9 copper from the corpse."));
    feed(&mut m, 4, json!({ "kind": "death", "name": "a rabid kobold", "bySelf": true }));
    let coin = m.snapshot()["state"]["mobCoin"].clone();
    assert_eq!(
        coin,
        json!([{ "mob": "a rabid kobold", "n": 2, "min": [0, 0, 0, 1], "max": [0, 2, 4, 9] }])
    );
}

#[test]
fn an_npc_only_traded_with_or_heard_speaking_is_a_mobs_row_but_a_one_word_speaker_is_not() {
    let mut m = module();
    let line = |text: &str| json!({ "kind": "unknown", "raw": format!("[Mon Oct 19 22:54:28 2026] {text}") });
    feed(&mut m, 1, json!({ "kind": "zone", "zone": "Innothule Swamp" }));
    feed(&mut m, 2, json!({ "kind": "offer", "item": "Fruit", "npc": "a fallen froglok" }));
    feed(&mut m, 3, line("A fallen froglok says, 'I have no need for this, Drywrought. You can have it back.'"));
    feed(&mut m, 4, line("A swamp hermit says, 'Leave me be.'"));
    // A player's /say and a one-word NPC's line are the same shape: never a row from speech alone.
    feed(&mut m, 5, line("Xober says, 'heading to Grobb'"));
    feed(&mut m, 6, line("You say, 'hello'"));
    // A corpse's last words are the mob's; another `X's ...` speaker is nobody met.
    feed(&mut m, 7, line("A swamp hermit's corpse says, 'Curse you! Da bashers will have yer head.'"));
    feed(&mut m, 8, line("Xober's warder says, 'Grr'"));
    let served = m.snapshot()["state"]["rows"].clone();
    let kinds = |name: &str| -> Vec<String> {
        served
            .as_array()
            .expect("rows")
            .iter()
            .find(|r| r["domain"] == "mob" && r["name"].as_str().is_some_and(|n| n.eq_ignore_ascii_case(name)))
            .map(|r| r["kinds"].as_array().expect("kinds").iter().map(|k| k.as_str().unwrap_or("").to_string()).collect())
            .unwrap_or_default()
    };
    assert_eq!(kinds("a fallen froglok"), vec!["offered", "spoke"]);
    assert_eq!(kinds("a swamp hermit"), vec!["spoke"]);
    assert!(kinds("Xober").is_empty());
    assert!(kinds("You").is_empty());
    assert!(kinds("A swamp hermit's corpse").is_empty());
    assert!(kinds("Xober's warder").is_empty());
}
