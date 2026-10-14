//! The bazaar parser and module, on lines taken from the owner's log (2026-10-06).

use super::super::bazaar_parse::{parse_trade, Dir, ItemIndex, Offer};
use super::BazaarModule;
use crate::event::Event;
use crate::knowledge::{Answer, Knowledge, Miss, OwnLoot};
use crate::EqModule;
use serde_json::json;
use std::sync::Arc;

const NAMES: &[&str] = &[
    "Cloak of Flames",
    "Loam Encrusted Robe",
    "Bone-Clasped Girdle",
    "McVaxius` Horn of War",
    "Lyssa`s Darkwood Piccolo",
    "High Quality Lion Skin",
    "High Quality Cat Pelt",
    "White Dragonscale Cloak",
    "Fruit",
    "Jacinth",
    "Black Sapphire",
    "Mithril Champion Arrows",
    "Arrow",
    "Quiver",
    "Fleeting Quiver",
    "Stonemelder's Band",
    "Potion of the Swamp",
    "Potion of the Frost",
    "Phosphorous Powder",
    "Bone Chips",
    "Black Wolf Skin",
    "Slime Blood of Cazic-Thule",
    "Gauntlets of Fiery Might",
];

fn ix() -> ItemIndex {
    ItemIndex::new(NAMES.iter().map(|s| s.to_string()))
}

fn short(o: &Offer) -> String {
    let mut s = format!("{} {}", o.dir.as_str(), o.item);
    if o.tier > 0 {
        s += &format!(" +{}", o.tier);
    }
    if let Some(q) = o.qty {
        s += &format!(" x{q}");
    }
    if let Some(p) = o.unit_pp() {
        s += &format!(" {p}pp");
    }
    s
}

fn read(msg: &str) -> Vec<String> {
    parse_trade(msg, &ix()).iter().map(short).collect()
}

#[test]
fn several_items_each_with_tier_and_price() {
    assert_eq!(
        read("WTS Loam Encrusted Robe +4 3k, Bone-Clasped Girdle +2 5k"),
        [
            "sell Loam Encrusted Robe +4 3000pp",
            "sell Bone-Clasped Girdle +2 5000pp"
        ]
    );
    assert_eq!(
        read("WTS White Dragonscale Cloak6k"),
        ["sell White Dragonscale Cloak 6000pp"]
    );
    assert_eq!(
        read("WTS Gauntlets of Fiery Might +4 2.5k"),
        ["sell Gauntlets of Fiery Might +4 2500pp"]
    );
}

#[test]
fn a_leading_each_price_covers_every_item_after_it() {
    assert_eq!(
        read("WTS 3k each:  McVaxius` Horn of War +5  |  Lyssa`s Darkwood Piccolo +1"),
        [
            "sell McVaxius` Horn of War +5 3000pp",
            "sell Lyssa`s Darkwood Piccolo +1 3000pp"
        ]
    );
    // Without "each" a leading number prices nothing; the `800x` before the name counts it.
    assert_eq!(
        read("WTS froglok unlock mats, 10k, 800x Phosphorous Powder"),
        ["sell Phosphorous Powder x800"]
    );
}

#[test]
fn a_trailing_each_price_covers_the_unpriced_items_before_it() {
    assert_eq!(
        read("wts Potion of the Swamp, Potion of the Frost 150g each"),
        [
            "sell Potion of the Swamp 15pp",
            "sell Potion of the Frost 15pp"
        ]
    );
}

#[test]
fn counts_divide_a_total_but_not_an_each_price() {
    assert_eq!(read("WTS 400 Fruit 30k plat"), ["sell Fruit x400 75pp"]);
    assert_eq!(
        read("WTS Bone Chips 1000 for 10k pst"),
        ["sell Bone Chips x1000 10pp"]
    );
    assert_eq!(
        read("WTS High Quality Lion Skin x2 6k each High Quality Cat Pelt 2k each"),
        [
            "sell High Quality Lion Skin x2 6000pp",
            "sell High Quality Cat Pelt 2000pp"
        ]
    );
    assert_eq!(
        read("WTS Jacinthx16, Black Sapphire x10 pst"),
        ["sell Jacinth x16", "sell Black Sapphire x10"]
    );
}

#[test]
fn price_shapes() {
    assert_eq!(
        read("wtb Fleeting Quiver 10 000pp"),
        ["buy Fleeting Quiver 10000pp"]
    );
    assert_eq!(
        read("Selling Mithril Champion Arrows 100 pp each"),
        ["sell Mithril Champion Arrows 100pp"]
    );
    assert_eq!(
        read("WTS Fleeting Quiver 20kPCT;PCT;"),
        ["sell Fleeting Quiver 20000pp"]
    );
    assert_eq!(
        read("WTS Fleeting Quiver 5kpp"),
        ["sell Fleeting Quiver 5000pp"]
    );
    assert_eq!(
        read("WTS Fleeting Quiver 1.5m"),
        ["sell Fleeting Quiver 1500000pp"]
    );
    assert_eq!(
        read("WTS Bone Chips 20 copper each"),
        ["sell Bone Chips 0.02pp"]
    );
}

#[test]
fn a_bare_number_after_other_words_is_a_count_not_a_price() {
    assert_eq!(read("WTS Bone Chips only have 1"), ["sell Bone Chips"]);
    assert_eq!(
        read("wts Fruit +4 - buying 100 10lb meatpies"),
        ["sell Fruit +4"]
    );
    assert_eq!(
        read("Selling Bone Chips 200 each"),
        ["sell Bone Chips 200pp"]
    );
    assert_eq!(read("WTS Bone Chips 500"), ["sell Bone Chips 500pp"]);
}

#[test]
fn names_ignore_case_apostrophes_and_shorthand() {
    assert_eq!(
        read("WTB Stonemelders Band 4+"),
        ["buy Stonemelder's Band +4"]
    );
    assert_eq!(
        read("wtb mithril champ arrows +5"),
        ["buy Mithril Champion Arrows +5"]
    );
    assert_eq!(read("WTB FLEETING QUIVER"), ["buy Fleeting Quiver"]);
}

#[test]
fn a_name_never_starts_inside_unmatched_words() {
    // "Mithril Champ" is matched; "Mithril Something arrows" is not "Arrow".
    assert_eq!(read("wtb Mithril Something arrows"), Vec::<String>::new());
}

#[test]
fn direction_switches_and_barter() {
    assert_eq!(
        read("WTS Phosphorous Powder & Bone Chips 10pp, WTB Black Wolf Skin 20pp"),
        [
            "sell Phosphorous Powder",
            "sell Bone Chips 10pp",
            "buy Black Wolf Skin 20pp"
        ]
    );
    assert_eq!(
        read("WTT Slime Blood of Cazic-Thule for 15 LQ pelts"),
        ["trade Slime Blood of Cazic-Thule"]
    );
}

#[test]
fn only_a_message_that_opens_with_a_direction_is_an_offer() {
    assert!(read("anyone selling Fleeting Quiver?").is_empty());
    assert!(read("aint nobody buying slime bloods").is_empty());
    assert_eq!(read("!! WTS Fruit 5pp"), ["sell Fruit 5pp"]);
    assert_eq!(parse_trade("selling Fruit 5pp", &ix())[0].dir, Dir::Sell);
}

pub(super) struct Names;

impl Knowledge for Names {
    fn item(&self, _name: &str) -> Answer {
        Answer {
            record: json!({}),
            found: false,
        }
    }
    fn identity_keys(&self, mob: &str) -> Vec<String> {
        vec![mob.to_string()]
    }
    fn mob(&self, _name: &str, _loot: &dyn OwnLoot) -> Answer {
        self.item("")
    }
    fn known_mob(&self, _name: &str) -> bool {
        false
    }
    fn take_misses(&self) -> Vec<Miss> {
        Vec::new()
    }
    fn item_names(&self) -> Vec<String> {
        NAMES.iter().map(|s| s.to_string()).collect()
    }
}

pub(super) fn line(seq: i64, raw: &str) -> Event<'static> {
    Event::from_json(&json!({ "kind": "unknown", "seq": seq, "ts": 0, "raw": raw }).to_string())
        .expect("an event")
}

#[test]
fn the_module_keeps_one_row_per_day_item_tier_and_direction() {
    let mut m = BazaarModule::new();
    let k: Arc<dyn Knowledge> = Arc::new(Names);
    m.install_knowledge(&k);
    for (seq, raw) in [
        "[Wed Sep 23 17:54:48 2026] Leric tells General:1, 'WTS Fleeting Quiver 20k'",
        // The same seller repeating the same offer counts once.
        "[Wed Sep 23 18:04:48 2026] Leric tells General:1, 'WTS Fleeting Quiver 20k'",
        "[Wed Sep 23 18:10:00 2026] Aaron tells General:1, 'WTS Fleeting Quiver 18k'",
        "[Wed Sep 23 18:11:00 2026] Bbqz tells General:1, 'WTB Fleeting Quiver'",
        "[Thu Sep 24 09:00:00 2026] Leric tells General:1, 'WTS Fleeting Quiver 20k'",
        "[Thu Sep 24 09:01:00 2026] You tell General:1, 'WTS Fleeting Quiver 19k'",
        // Not chat, and not an offer.
        "[Thu Sep 24 09:02:00 2026] Leric says, 'WTS Fleeting Quiver 1k'",
        "[Thu Sep 24 09:03:00 2026] Leric tells General:1, 'anyone selling Fleeting Quiver?'",
    ]
    .iter()
    .enumerate()
    {
        m.on_event(&line(seq as i64 + 1, raw), false);
    }
    let mut rows = m.snapshot()["state"]["rows"].clone();
    // Who said what, once per counted offer, with the time of day.
    let quotes: Vec<serde_json::Value> = rows
        .as_array_mut()
        .expect("rows")
        .iter_mut()
        .map(|r| {
            r.as_object_mut()
                .and_then(|o| o.remove("quotes"))
                .expect("quotes")
        })
        .collect();
    assert_eq!(
        quotes[0],
        json!([
            { "at": "17:54:48", "who": "Leric", "price": 20000.0, "msg": "WTS Fleeting Quiver 20k" },
            { "at": "18:10:00", "who": "Aaron", "price": 18000.0, "msg": "WTS Fleeting Quiver 18k" }
        ])
    );
    assert_eq!(
        rows,
        json!([
            { "day": "2026-09-23", "dir": "sell", "item": "Fleeting Quiver", "tier": 0, "n": 2, "unpriced": 0, "min": 18000.0, "max": 20000.0, "sum": 38000.0, "prices": [20000.0, 18000.0] },
            { "day": "2026-09-23", "dir": "buy", "item": "Fleeting Quiver", "tier": 0, "n": 0, "unpriced": 1, "min": null, "max": null, "sum": 0.0, "prices": [] },
            { "day": "2026-09-24", "dir": "sell", "item": "Fleeting Quiver", "tier": 0, "n": 2, "unpriced": 0, "min": 19000.0, "max": 20000.0, "sum": 39000.0, "prices": [20000.0, 19000.0] }
        ])
    );
}

#[test]
fn offers_heard_live_are_kept_for_the_watch_alerts() {
    let mut m = BazaarModule::new();
    let k: Arc<dyn Knowledge> = Arc::new(Names);
    m.install_knowledge(&k);
    // Replayed history is never alerted on, and a repeat of one offer counts once.
    m.on_event(
        &line(
            1,
            "[Wed Sep 23 17:54:48 2026] Leric tells General:1, 'WTS Fleeting Quiver 20k'",
        ),
        false,
    );
    m.on_event(
        &line(
            2,
            "[Wed Sep 23 18:00:00 2026] Aaron tells General:1, 'WTS Fleeting Quiver 18k'",
        ),
        true,
    );
    m.on_event(
        &line(
            3,
            "[Wed Sep 23 18:05:00 2026] Aaron tells General:1, 'WTS Fleeting Quiver 18k'",
        ),
        true,
    );
    m.on_event(
        &line(
            4,
            "[Wed Sep 23 18:06:00 2026] Bbqz tells General:1, 'WTB Fleeting Quiver'",
        ),
        true,
    );
    assert_eq!(
        m.snapshot()["state"]["live"],
        json!([
            { "seq": 2, "at": "2026-09-23 18:00:00", "speaker": "Aaron", "dir": "sell", "item": "Fleeting Quiver", "tier": 0, "price": 18000.0 },
            { "seq": 4, "at": "2026-09-23 18:06:00", "speaker": "Bbqz", "dir": "buy", "item": "Fleeting Quiver", "tier": 0, "price": null }
        ])
    );
}

#[test]
fn the_latest_twenty_people_are_quoted_once_each() {
    let mut m = BazaarModule::new();
    let k: Arc<dyn Knowledge> = Arc::new(Names);
    m.install_knowledge(&k);
    for i in 0..30 {
        let raw = format!(
            "[Wed Sep 23 18:{i:02}:00 2026] Seller{}{} tells General:1, 'WTS Fleeting Quiver 20k'",
            (b'a' + i as u8 / 26) as char,
            (b'a' + i as u8 % 26) as char
        );
        m.on_event(&line(i64::from(i) + 1, &raw), false);
    }
    // The first seller again, at a new price: their newest quote replaces the old one.
    let again = "[Wed Sep 23 19:00:00 2026] Selleraa tells General:1, 'WTS Fleeting Quiver 18k'";
    m.on_event(&line(40, again), false);
    let quotes = m.snapshot()["state"]["rows"][0]["quotes"].clone();
    let who: Vec<&str> = quotes
        .as_array()
        .expect("quotes")
        .iter()
        .filter_map(|q| q["who"].as_str())
        .collect();
    assert_eq!(who.len(), 20);
    assert_eq!(who.first(), Some(&"Selleral"));
    assert_eq!(who.last(), Some(&"Selleraa"));
    assert_eq!(quotes[19]["price"], 18000.0);
}

#[test]
fn paying_after_several_items_prices_each_of_them() {
    // The owner's screenshot, 2026-10-06.
    assert_eq!(read("Buying Fruit PST"), ["buy Fruit"]);
    assert_eq!(
        read("wtb Cloak of Flames +5/Slime Blood of Cazic-Thule +5 paying 4k "),
        [
            "buy Cloak of Flames +5 4000pp",
            "buy Slime Blood of Cazic-Thule +5 4000pp"
        ]
    );
    assert_eq!(
        read("WTB Fleeting Quiver PST paying 10k"),
        ["buy Fleeting Quiver 10000pp"]
    );
    // And the next one, the same evening: a buy that opens with "paying", its price first.
    assert_eq!(
        read("paying 15k for fleeting quiver"),
        ["buy Fleeting Quiver 15000pp"]
    );
    assert_eq!(
        read("WTB Fleeting Quiver. Paying 2k."),
        ["buy Fleeting Quiver 2000pp"]
    );
    assert_eq!(
        read("WTS 5k for Fleeting Quiver"),
        ["sell Fleeting Quiver 5000pp"]
    );
    assert_eq!(
        read("paying 400 plat for black sapphires and 250 for jacinth"),
        ["buy Black Sapphire 400pp", "buy Jacinth 250pp"]
    );
    // "for both" names no item, so the price stays with the item before it.
    assert_eq!(
        read("WTS Fleeting Quiver 3k for both"),
        ["sell Fleeting Quiver 3000pp"]
    );
}
