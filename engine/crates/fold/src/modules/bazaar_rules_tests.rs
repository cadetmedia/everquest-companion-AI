//! The parser's rules measured on the owner's archived log, 2026-08-12 to 2026-10-07 (58,890 chat
//! lines): acronyms, the spellings chat uses, glued item links, several tiers in one offer, what an
//! offer is for, and numbers that count rather than price.

use super::{parse_trade, ItemIndex, Offer};

const NAMES: &[&str] = &[
    "Cloak of Flames",
    "Bone-Clasped Girdle",
    "McVaxius` Horn of War",
    "White Dragonscale Cloak",
    "Mithril Champion Arrows",
    "Fleeting Quiver",
    "Stonemelder's Band",
    "Bone Chips",
    "Runed Bolster Belt",
    "Flowing Black Silk Sash",
    "Short Sword of the Ykesha",
    "Steel Guardian Arrows",
    "Book of Scale",
    "Fiery Avenger",
    "Diamond",
    "Blue Diamond",
    "Rain Caller",
    "Ivandyr's Hoop",
    "Slime Blood of Cazic-Thule",
    "Slime Blood of Cazic Thule",
    "Bones",
    "Gears",
    "Deepwater Ink",
    "Bow of the Underfoot",
    "Phosphorous Powder",
];

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
    let ix = ItemIndex::new(NAMES.iter().map(|s| s.to_string()));
    parse_trade(msg, &ix).iter().map(short).collect()
}

#[test]
fn acronyms_one_item_fits() {
    assert_eq!(read("WTB COF 4+ pls"), ["buy Cloak of Flames +4"]);
    assert_eq!(
        read("WTB FBSS for 500pp"),
        ["buy Flowing Black Silk Sash 500pp"]
    );
    assert_eq!(read("WTB BCG 8k"), ["buy Bone-Clasped Girdle 8000pp"]);
    assert_eq!(read("wtb RBB pst"), ["buy Runed Bolster Belt"]);
    assert_eq!(
        read("buying ssoy 4, 1k"),
        ["buy Short Sword of the Ykesha 1000pp"]
    );
    // No item fits these, so they stay unread rather than guessed.
    assert!(read("wtb KR 10 000pp").is_empty());
}

#[test]
fn spellings_chat_uses() {
    assert_eq!(
        read("WTB Mithril Champion Arrow(s)"),
        ["buy Mithril Champion Arrows"]
    );
    assert_eq!(
        read("wtb mith champ arrow +5"),
        ["buy Mithril Champion Arrows +5"]
    );
    assert_eq!(read("WTB bone clasped girdle"), ["buy Bone-Clasped Girdle"]);
    // Pages one hyphen apart are one item, under the game's own spelling.
    assert_eq!(
        read("WTS Slime Blood of Cazic Thule +4 5k"),
        ["sell Slime Blood of Cazic-Thule +4 5000pp"]
    );
    // A singular finds a plural name of several words, never a one-word one.
    assert_eq!(read("wtb bone 300 bone chips"), ["buy Bone Chips x300"]);
}

#[test]
fn glued_item_links_read_apart() {
    assert_eq!(
        read("selling Stonemelder's BandFleeting Quiver"),
        ["sell Stonemelder's Band", "sell Fleeting Quiver"]
    );
    assert_eq!(
        read("WTB StoneMelders Band 4+"),
        ["buy Stonemelder's Band +4"]
    );
    assert_eq!(
        read("WTS McVaxius` Horn of War +4 3k"),
        ["sell McVaxius` Horn of War +4 3000pp"]
    );
}

#[test]
fn every_tier_of_one_item_gets_its_own_price() {
    assert_eq!(
        read("WTS Mithril Champion Arrows +7 20k, +6 11k, +4 3k, +3 1.5k, +1 400 at west commons"),
        [
            "sell Mithril Champion Arrows +7 20000pp",
            "sell Mithril Champion Arrows +6 11000pp",
            "sell Mithril Champion Arrows +4 3000pp",
            "sell Mithril Champion Arrows +3 1500pp",
            "sell Mithril Champion Arrows +1 400pp"
        ]
    );
    assert_eq!(
        read("selling Steel Guardian Arrows +43k"),
        ["sell Steel Guardian Arrows +4 3000pp"]
    );
    // A tier after the price that has no price of its own changes nothing.
    assert_eq!(
        read("wts Fleeting Quiver 400 plat! can make up to +5!"),
        ["sell Fleeting Quiver 400pp"]
    );
    assert_eq!(
        read("Selling Ivandyr's Hoop 3k each or 2k if buying 3+"),
        ["sell Ivandyr's Hoop 3000pp"]
    );
}

#[test]
fn an_item_after_for_is_what_the_offer_is_for() {
    assert_eq!(
        read("WTS Book of Scale for Fiery Avenger .. 5k"),
        ["sell Book of Scale 5000pp"]
    );
    // But a price before "for" still prices the item after it, and a barter offers both.
    assert_eq!(
        read("paying 15k for fleeting quiver"),
        ["buy Fleeting Quiver 15000pp"]
    );
    assert_eq!(
        read("WTT Fleeting Quiver for Stonemelder's Band"),
        ["trade Fleeting Quiver", "trade Stonemelder's Band"]
    );
}

#[test]
fn numbers_that_count_rather_than_price() {
    assert_eq!(
        read("WTS White Dragonscale Cloak +1 6 left"),
        ["sell White Dragonscale Cloak +1"]
    );
    assert_eq!(
        read("WTS Rain Caller +2 1 bajillion plat obo"),
        ["sell Rain Caller +2"]
    );
    assert_eq!(
        read("WTS Bone Chips 580, 10p each"),
        ["sell Bone Chips 10pp"]
    );
    assert_eq!(
        read("Wts White Dragonscale Cloak asking 6k and 2 diamonds and 2 black saphires"),
        ["sell White Dragonscale Cloak 6000pp", "sell Diamond x2"]
    );
}

/// Owner report, 2026-10-13: a count and a price side by side before `each` are not one spaced number
/// (`40 100 each` is forty at a hundred, not 40,100), and an `x` count right before a name counts
/// that item, not the one priced before it.
#[test]
fn a_count_before_each_and_a_count_before_a_name() {
    assert_eq!(
        read("wts Deepwater Ink 40 100 each"),
        ["sell Deepwater Ink x40 100pp"]
    );
    assert_eq!(
        read("wts Bow of the Underfoot +4 6k 100x Deepwater Ink 6k"),
        [
            "sell Bow of the Underfoot +4 6000pp",
            "sell Deepwater Ink x100 60pp"
        ]
    );
    // A spaced thousands with its unit, or with no `each` after it, is still one number; without a
    // unit it is listed but not counted (a_guess_is_listed_but_not_counted).
    assert_eq!(
        read("wts Deepwater Ink 10 000pp"),
        ["sell Deepwater Ink 10000pp"]
    );
    assert_eq!(
        read("wtb Bow of the Underfoot 10 000"),
        ["buy Bow of the Underfoot 10000pp"]
    );
}

/// Owner ruling, 2026-10-13: an offer read through a guess is listed but never counted.
#[test]
fn a_guess_is_listed_but_not_counted() {
    let ix = ItemIndex::new(NAMES.iter().map(|s| s.to_string()));
    let sure = |msg: &str| {
        parse_trade(msg, &ix)
            .iter()
            .map(|o| o.sure)
            .collect::<Vec<_>>()
    };
    // Clear: a price with a unit, `each` with a count, or no count.
    assert_eq!(sure("wts Bow of the Underfoot +4 6k"), [true]);
    assert_eq!(sure("WTB Deepwater ink. Paying 30p each."), [true]);
    // A price with no unit: 40 pp or 40k?
    assert_eq!(sure("wts Deepwater Ink 40 100 each"), [false]);
    // A count and a price with no `each`: the lot, or each?
    assert_eq!(
        sure("wts Bow of the Underfoot +4 6k 100x Deepwater Ink 6k"),
        [true, false]
    );
    // A stated total, or one item, is no guess.
    assert_eq!(sure("WTS Bone Chips 1000 for 10k pst"), [true]);
    // Alternatives: an `or` before another price or count; not "or best offer", not "A or B".
    assert!(
        sure("WTS or trade Fleeting Quiver for 20k plat or 2x Bones")
            .iter()
            .all(|s| !s)
    );
    assert_eq!(sure("WTB Stonemelders Band 10k or best offer"), [true]);
    // A spaced number with no unit is a price with no unit (review, 2026-10-13).
    assert_eq!(sure("wtb Bow of the Underfoot 10 000"), [false]);
    assert_eq!(sure("wts Deepwater Ink 10 000pp"), [true]);
    // A `for` total is the offer's it follows, not every offer's on the line (review, 2026-10-13).
    assert_eq!(
        sure("WTS 800x Phosphorous Powder 6k, Bone Chips 1000 for 10k"),
        [false, true]
    );
    assert_eq!(
        sure("WTS Bone Chips 1000 for 10k, 800x Phosphorous Powder 6k"),
        [true, false]
    );
}
