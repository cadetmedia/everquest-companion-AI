//! Merchant offers (owner ask, 2026-10-20): what a merchant says it will pay the moment the player
//! puts an item in its sell slot, kept on the item's gap row so the tab can show the real vendor
//! price, and read by the Event log so a gap item is kept rather than sold.
//!
//! The two shapes, from the owner's log (332 lines, seven merchants):
//!   `Klok Koglin told you, 'I'll give you 1 platinum 1 gold 4 silver 3 copper for the Fungus Spores.'`
//!   `Klok Koglin told you, 'I'll give you 5 silver 7 copper per Pristine Lizard Scale'`
//! Any subset of the four coins, or `absolutely nothing` (60 lines). `per X` is a stackable item and
//! the price of one, even for a stack of one (`3 copper per Tuft of Black Bear Fur`, sold for 3
//! copper); `for the X.` is one unstackable item (145 of 145 sales after one paid the offer exactly).
//!
//! An offer carries the player's standing with that merchant, so each keeps the merchant's last
//! /con before it, when there was one (the line itself states none).

use super::gaps_details::coin_of;
use crate::modules::consider::mob_key;
use serde_json::{json, Value};
use std::collections::HashMap;

/// Distinct offers kept per row, newest last.
const OFFERS_KEPT: usize = 8;

/// One offer line, read off its text.
#[derive(Debug, PartialEq, Eq)]
pub struct Offer<'a> {
    pub merchant: &'a str,
    /// As the line spells it, tier and all (`Noble's Robes +4`).
    pub item: &'a str,
    /// The coin as printed (`5 silver 7 copper`), `nothing` for `absolutely nothing`.
    pub coin: String,
    pub copper: i64,
    /// `per X`: the price of one of a stack.
    pub per: bool,
}

/// `X told you, 'I'll give you <coin> for the <item>.'` / `… <coin> per <item>'` → the offer.
pub fn offer_of(text: &str) -> Option<Offer<'_>> {
    let (merchant, rest) = text.split_once(" told you, 'I'll give you ")?;
    // The coin never holds ` for the ` or ` per `, so the first one ends it; an item may hold either.
    let whole = rest.strip_suffix(".'").and_then(|r| r.split_once(" for the "));
    let (coin, item, per) = match whole {
        Some((coin, item)) => (coin, item, false),
        None => {
            let (coin, item) = rest.strip_suffix('\'')?.split_once(" per ")?;
            (coin, item, true)
        }
    };
    let (coin, copper) = match coin {
        "absolutely nothing" => ("nothing".to_string(), 0),
        // The whole clause must be coin: an item name never leaks into the price.
        _ => coin_of(coin).filter(|(c, _)| c == coin)?,
    };
    (!merchant.is_empty() && !item.is_empty()).then_some(Offer { merchant, item, coin, copper, per })
}

/// The last /con rung of every name conned (`ally`, `indifferent`…): an offer's standing.
#[derive(Default)]
pub struct Standings(HashMap<String, String>);

impl Standings {
    pub fn clear(&mut self) {
        self.0.clear();
    }

    pub fn con(&mut self, mob: &str, rung: Option<&str>) {
        if let Some(r) = rung.filter(|r| !r.is_empty()) {
            self.0.insert(mob_key(mob), r.to_string());
        }
    }

    pub fn of(&self, merchant: &str) -> Option<&str> {
        self.0.get(&mob_key(merchant)).map(String::as_str)
    }
}

/// One distinct offer on a row: who, how much, at what standing, how often, and when and where last.
#[derive(Debug, Clone)]
struct OfferSeen {
    merchant: String,
    coin: String,
    copper: i64,
    per: bool,
    standing: Option<String>,
    n: u32,
    last: String,
    zone: Option<String>,
}

/// A row's offers, distinct by merchant, price, form and standing; the OFFERS_KEPT newest.
#[derive(Debug, Clone, Default)]
pub struct Offers(Vec<OfferSeen>);

impl Offers {
    pub fn add(&mut self, o: &Offer, standing: Option<&str>, zone: Option<&str>, last: &str) {
        let same = |s: &OfferSeen| s.merchant == o.merchant && s.copper == o.copper && s.per == o.per && s.standing.as_deref() == standing;
        let mut seen = match self.0.iter().position(same) {
            Some(at) => self.0.remove(at),
            None => OfferSeen { merchant: o.merchant.to_string(), coin: o.coin.clone(), copper: o.copper, per: o.per, standing: standing.map(str::to_string), n: 0, last: String::new(), zone: None },
        };
        seen.n += 1;
        seen.last = last.to_string();
        seen.zone = zone.map(str::to_string);
        self.0.push(seen);
        let over = self.0.len().saturating_sub(OFFERS_KEPT);
        self.0.drain(..over);
    }

    /// `[{merchant, coin, copper, per?, standing?, zone?, n, last}]`, newest last; `None` when empty.
    pub fn serve(&self) -> Option<Value> {
        let row = |s: &OfferSeen| {
            let mut v = json!({ "merchant": s.merchant, "coin": s.coin, "copper": s.copper, "n": s.n, "last": s.last });
            if s.per {
                v["per"] = json!(true);
            }
            if let Some(st) = &s.standing {
                v["standing"] = json!(st);
            }
            if let Some(z) = &s.zone {
                v["zone"] = json!(z);
            }
            v
        };
        (!self.0.is_empty()).then(|| Value::Array(self.0.iter().map(row).collect()))
    }
}

#[cfg(test)]
mod tests {
    use super::{offer_of, Offer, Offers, Standings};

    fn offer(text: &str) -> Option<(String, String, i64, bool)> {
        offer_of(text).map(|o| (o.merchant.to_string(), o.item.to_string(), o.copper, o.per))
    }

    #[test]
    fn both_shapes_and_every_coin_subset_read_off_the_real_lines() {
        let whole = "Klok Koglin told you, 'I'll give you 1 platinum 1 gold 4 silver 3 copper for the Fungus Spores.'";
        assert_eq!(offer(whole), Some(("Klok Koglin".into(), "Fungus Spores".into(), 1143, false)));
        let per = "Klok Koglin told you, 'I'll give you 5 silver 7 copper per Pristine Lizard Scale'";
        assert_eq!(offer(per), Some(("Klok Koglin".into(), "Pristine Lizard Scale".into(), 57, true)));
        let coins = [
            ("3 copper per Tuft of Black Bear Fur'", 3),
            ("1 gold 9 silver per Polar Bear Skin'", 190),
            ("6 platinum for the Gold Ring.'", 6000),
            ("2 platinum 3 gold 1 copper for the Bone Chips.'", 2301),
        ];
        for (tail, copper) in coins {
            let line = format!("Klok Nylsi told you, 'I'll give you {tail}");
            assert_eq!(offer_of(&line).map(|o| o.copper), Some(copper), "{line}");
        }
        let o = offer_of(whole).expect("an offer");
        assert_eq!(o.coin, "1 platinum 1 gold 4 silver 3 copper", "the coin as printed");
    }

    #[test]
    fn odd_names_nothing_and_lines_that_are_no_offer() {
        let nothing = "Klok Koglin told you, 'I'll give you absolutely nothing for the Kelin`s Seven Stringed Lute +4.'";
        let o = offer_of(nothing).expect("an offer of nothing");
        assert_eq!((o.item, o.copper, o.coin.as_str()), ("Kelin`s Seven Stringed Lute +4", 0, "nothing"));
        let apostrophe = "Elder Jantiz told you, 'I'll give you 4 platinum 5 gold 6 copper for the Noble's Robes +4.'";
        assert_eq!(offer_of(apostrophe).map(|o| o.item), Some("Noble's Robes +4"));
        let period = "Klok Koglin told you, 'I'll give you 2 silver per Mr. T's Snack'";
        assert_eq!(offer_of(period).map(|o| o.item), Some("Mr. T's Snack"));
        let dotted = "Klok Koglin told you, 'I'll give you 2 silver for the Wand of St..'";
        assert_eq!(offer_of(dotted).map(|o| o.item), Some("Wand of St."), "only the line's own full stop goes");
        for no in [
            "Murga told you, 'That'll be 5 silver 3 copper per Tunic Pattern.'",
            "Kamas tells you, 'I'll give you 5 platinum for the Gold Ring.'",
            "Klok Koglin told you, 'I'll give you a hint for the Gold Ring.'",
            "Gontik told you, 'Attacking a rat Master.'",
        ] {
            assert_eq!(offer_of(no), None, "{no}");
        }
    }

    #[test]
    fn a_row_keeps_distinct_offers_with_the_standing_newest_last() {
        let mut standings = Standings::default();
        standings.con("Klok Koglin", Some("ally"));
        assert_eq!(standings.of("klok koglin"), Some("ally"), "a merchant's key is its mob key");
        let o: Offer = offer_of("Klok Koglin told you, 'I'll give you 5 silver per Rat Ear'").expect("an offer");
        let mut offers = Offers::default();
        offers.add(&o, standings.of(o.merchant), Some("Oggok"), "2026-10-20 22:27:39");
        offers.add(&o, None, Some("Oggok"), "2026-10-20 22:28:00");
        offers.add(&o, standings.of(o.merchant), Some("Oggok"), "2026-10-20 22:29:00");
        let served = offers.serve().expect("offers");
        assert_eq!(served.as_array().map(Vec::len), Some(2), "same price and standing is one entry");
        assert_eq!(served[1]["standing"], "ally");
        assert_eq!(served[1]["n"], 2);
        assert_eq!(served[1]["last"], "2026-10-20 22:29:00");
        assert_eq!(served[1]["per"], true);
        assert!(served[0].get("standing").is_none(), "no con, no standing");
        assert_eq!(Offers::default().serve(), None);
    }
}
