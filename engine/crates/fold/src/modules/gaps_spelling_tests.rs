//! What the gaps module knows beyond the exact lookups — see `gaps_names` and `gaps_keys` — on the
//! parent test file's corpus.

use super::{feed, module, rows};
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
