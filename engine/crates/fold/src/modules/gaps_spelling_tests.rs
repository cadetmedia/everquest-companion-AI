//! What the gaps module knows beyond the exact lookups — see `gaps_names` and `gaps_keys` — on the
//! parent test file's corpus.

use super::{feed, module, rows};
use crate::EqModule;
use serde_json::json;

#[test]
fn a_mob_the_wiki_spells_otherwise_is_known() {
    let mut m = module();
    // A disambiguated page, a hyphen, no article, a page split by zone, a roster alias.
    for (seq, name) in [
        "Cazic-Thule",
        "Cazic Thule",
        "a fire giant warrior",
        "a kobold",
        "Innoruuk, the Prince of Hate",
    ]
    .iter()
    .enumerate()
    {
        feed(
            &mut m,
            seq as i64 + 1,
            json!({ "kind": "death", "name": name, "bySelf": true }),
        );
    }
    feed(
        &mut m,
        8,
        json!({ "kind": "death", "name": "imp", "bySelf": true }),
    );
    feed(
        &mut m,
        9,
        json!({ "kind": "death", "name": "a kobold shaman", "bySelf": true }),
    );
    assert_eq!(rows(&m), ["mob a kobold shaman x1 [killed]"]);
}

#[test]
fn a_known_mobs_pet_is_known_and_a_players_pet_or_mount_is_no_mob() {
    let mut m = module();
    feed(
        &mut m,
        1,
        json!({ "kind": "death", "name": "a fire giant warrior pet", "bySelf": true }),
    );
    feed(
        &mut m,
        2,
        json!({ "kind": "death", "name": "a nameless thing pet", "bySelf": true }),
    );
    feed(
        &mut m,
        3,
        json!({ "kind": "consider", "mob": "Malkil`s Mount", "level": 30 }),
    );
    feed(
        &mut m,
        4,
        json!({ "kind": "death", "name": "Zonarer", "bySelf": false }),
    );
    feed(
        &mut m,
        8,
        json!({ "kind": "loot", "item": "Bone Chips", "source": "Reward Chest" }),
    );
    assert_eq!(
        rows(&m).len(),
        1,
        "the unknown mob's pet; a pet with a generated name (Zonarer) is no mob even before it speaks"
    );
    feed(
        &mut m,
        5,
        json!({ "kind": "petSay", "name": "Zonarer", "say": "follow" }),
    );
    feed(
        &mut m,
        6,
        json!({ "kind": "allyPetLeader", "pet": "Ztik", "owner": "Malkil" }),
    );
    feed(
        &mut m,
        7,
        json!({ "kind": "death", "name": "Ztik", "bySelf": false }),
    );
    // Filed under its mob: the wiki pages the mob, never its pet.
    assert_eq!(rows(&m), ["mob a nameless thing x1 [killed]"]);
}

/// A Dungeon Crawl's Reward Chest pays out any item from any mob of the crawl (owner, 2026-10-21):
/// the item is looted and keeps its zone and disposition, but the chest is no source of it.
#[test]
fn a_reward_chest_payout_files_the_item_and_no_source() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "zone", "zone": "Befallen 4 (Refined)" }));
    let raw = "[Tue Oct 06 18:12:26 2026] You looted a Glowing Widget from Reward Chest and sold it for free.";
    feed(
        &mut m,
        2,
        json!({ "kind": "loot", "item": "Glowing Widget", "source": "Reward Chest", "disposition": "sold", "raw": raw }),
    );
    assert_eq!(rows(&m), ["item Glowing Widget x1 [looted]"]);
    let details = &m.snapshot()["state"]["rows"][0]["details"];
    assert!(details.get("sources").is_none(), "{details}");
    assert_eq!(details["zones"]["all"], json!(["Befallen 4 (Refined)"]));
    assert_eq!(details["dispositions"]["entries"][0]["name"], "sold");
    feed(&mut m, 3, json!({ "kind": "loot", "item": "Glowing Widget", "source": "a decaying skeleton" }));
    let details = &m.snapshot()["state"]["rows"][0]["details"];
    assert_eq!(details["sources"], json!({ "entries": [{ "name": "a decaying skeleton", "n": 1 }], "distinct": 1 }));
}

#[test]
fn an_aa_an_item_effect_and_a_spell_that_ends_in_a_numeral_are_known() {
    let mut m = module();
    // Heroic Leap is a Warrior AA (classes.json `abilities`, and `aas` where the data has it).
    feed(
        &mut m,
        1,
        json!({ "kind": "castBegin", "spell": "Heroic Leap I" }),
    );
    feed(
        &mut m,
        2,
        json!({ "kind": "castBegin", "spell": "Summon Horse" }),
    );
    // `Yaulp II` ranked: the catalog's own numeral is not a rank.
    feed(
        &mut m,
        3,
        json!({ "kind": "otherCastBegin", "caster": "Filbert", "spell": "Yaulp II V" }),
    );
    assert!(rows(&m).is_empty(), "{:?}", rows(&m));
}

/// The player's own pet (it calls the player Master, `petClaim`/`petSay`) is served as `ownPets`, so
/// the tab counts its kills as the player's (owner, 2026-10-22: Gonekn's kill moved five factions);
/// another player's pet (`allyPetLeader`) is not.
#[test]
fn the_players_own_pets_are_served_and_another_players_are_not() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "petSay", "name": "Gonekn", "say": "attack" }));
    feed(&mut m, 2, json!({ "kind": "petClaim", "name": "Gonekn" }));
    feed(&mut m, 3, json!({ "kind": "allyPetLeader", "pet": "Ztik", "owner": "Malkil" }));
    assert_eq!(m.snapshot()["state"]["ownPets"], json!(["Gonekn"]));
}

/// A store purchase arrives as `X has been placed in your inventory!` (owner's log, 2026-10-22:
/// Petamorph Wand: Werewolf, bought from the in-game store): the item is received, and an item the
/// wiki has no page for is an Items row like a looted one.
#[test]
fn a_store_delivery_is_a_received_item_and_an_unknown_one_is_a_row() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "zone", "zone": "Nektulos Forest" }));
    feed(
        &mut m,
        2,
        json!({ "kind": "itemReceived", "item": "Petamorph Wand: Werewolf", "via": "inventory" }),
    );
    assert_eq!(rows(&m), ["item Petamorph Wand: Werewolf x1 [received]"]);
}

/// A known mob or item met whose page says it may not be in Legends (`{{DNE}}`, `{{delete}}`) is a
/// Notices row under its page, with its notices and the lines that prove it exists (owner,
/// 2026-10-22: A Rotting Citizen); a known one without a notice is no row anywhere.
#[test]
fn a_met_mob_or_item_whose_page_says_not_legends_is_a_notices_row() {
    let mut m = module();
    feed(&mut m, 1, json!({ "kind": "zone", "zone": "Nektulos Forest" }));
    feed(&mut m, 2, json!({ "kind": "consider", "mob": "a rotting citizen", "level": 7 }));
    feed(&mut m, 3, json!({ "kind": "death", "name": "a rotting citizen", "bySelf": true }));
    feed(&mut m, 4, json!({ "kind": "loot", "item": "Old Wand", "source": "a rotting citizen" }));
    feed(&mut m, 5, json!({ "kind": "loot", "item": "Bone Chips", "source": "a decaying skeleton" }));
    assert_eq!(rows(&m), ["notice a rotting citizen x3 [considered,killed,dropped-by]", "notice Old Wand x1 [looted]"]);
    let state = m.snapshot()["state"].clone();
    let citizen = state["rows"].as_array().unwrap().iter().find(|r| r["name"] == "a rotting citizen").unwrap().clone();
    assert_eq!(citizen["page"], "A Rotting Citizen");
    assert_eq!(citizen["notices"], json!(["delete", "DNE"]));
    assert_eq!(citizen["subject"], "mob");
    assert_eq!(state["totals"]["notice"], 2);
}
