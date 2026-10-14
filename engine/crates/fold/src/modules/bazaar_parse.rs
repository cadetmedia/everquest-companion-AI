//! One trade-chat message → the offers in it. The parser behind [`super::bazaar`], kept apart so
//! it is tested without a fold.
//!
//! Measured on the owner's log (2026-10-06): 1,644 messages that open with WTS, WTB, WTT,
//! selling, buying or trading; an item is found in 86% of them. Re-measured on the archived log
//! (2026-08-12 to 2026-10-07, 1,687 such messages): 88% with the acronyms, spellings and glued
//! links of [`super::bazaar_words`]; most of the rest are not offers ("selling tomatoes would be a
//! lucrative business") or name an item no page spells that way. What it reads:
//!
//! * the direction word opens the message, or follows a separator ("WTS a 5k / WTB b 3k"); the
//!   acronyms switch direction anywhere. "anyone selling X?" opens with no direction, so it is not
//!   an offer.
//! * item names are the item database's, matched longest first, and only where a name can start:
//!   after the direction word, a separator, a price, a tier, a quantity or another item. A name
//!   found after unmatched words is the tail of something else ("Mithril Champ arrows" is not
//!   "Arrow"). Case and apostrophes never matter.
//! * prices: `5k`, `2.5k`, `500pp`, `10 000pp`, `4 pp`, `150g`, `20 copper`, `5kpp`, and a price
//!   glued to the name (`Cloak6k`). `3k each: A | B` prices both; so does `A, B 150g each`.
//! * a bare number (no `k`, `pp` or coin) is a price only right after the item, its tier or its
//!   count, or before `each`: "only have 1" and "- buying 100 10lb meatpies" are counts.
//! * "paying 4k" or "offering 4k" after several items prices each of them, as `each` does; as the
//!   message's first word it is a buy, and a price before "for" prices what follows
//!   ("paying 15k for fleeting quiver").
//! * an item right after "for" is what the offer is for ("Book of Scale for Fiery Avenger"), unless
//!   a price stands before the "for" or the offer is a barter.
//! * a bare number before a word that is no item and no price word counts ("6 left"), and one
//!   before a comma and a price with a unit is not the price ("Bone Chips 580, 10p each").
//! * a tier after a priced tier starts that item's next offer ("+7 20k, +6 11k").
//! * `+4` and `4+` are the upgrade tier; `x2`, `2x` and a bare count before the name are the
//!   quantity, as is a count before "for" (`Bone Chips 1000 for 10k`).
//! * a trade (WTT) is a barter: its numbers count the other thing, so it never carries a price.

use super::bazaar_words::{
    bare_at, loose, mark_guesses, price_at, re, tokens, unglued, Tok, AFTER_BARE_PRICE,
};
use regex::Regex;
use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Dir {
    Sell,
    Buy,
    Trade,
}

impl Dir {
    pub fn as_str(self) -> &'static str {
        match self {
            Dir::Sell => "sell",
            Dir::Buy => "buy",
            Dir::Trade => "trade",
        }
    }

    fn of(word: &str) -> Option<Dir> {
        match word {
            "wts" | "selling" => Some(Dir::Sell),
            "wtb" | "buying" => Some(Dir::Buy),
            "wtt" | "trading" => Some(Dir::Trade),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Offer {
    pub dir: Dir,
    /// The item page's own spelling.
    pub item: String,
    pub tier: u32,
    pub qty: Option<u32>,
    /// As stated, in platinum: per unit when `each`, else for the whole `qty`.
    pub price_pp: Option<f64>,
    pub each: bool,
    /// False when reading it took a guess: the line offers another price or count after `or`, the
    /// price has no unit, or a count over one and a price come with neither `each` nor `for` (the
    /// lot, or each?). Such an offer is listed but never counted (owner, 2026-10-13: a wrong count
    /// is worse than a missing one).
    pub sure: bool,
}

impl Offer {
    /// Platinum per unit: a stated total over a stated count is divided.
    pub fn unit_pp(&self) -> Option<f64> {
        match (self.price_pp, self.qty) {
            (Some(p), Some(q)) if !self.each && q > 0 => Some(p / f64::from(q)),
            (p, _) => p,
        }
    }
}

/// Item names keyed by [`loose`] spelling.
#[derive(Default)]
pub struct ItemIndex {
    names: HashMap<String, String>,
    max_words: usize,
}

impl ItemIndex {
    pub fn new(names: impl IntoIterator<Item = String>) -> Self {
        let mut ix = ItemIndex::default();
        for name in names {
            // Also as the chat's tokens spell it once a glued link is split (`Mc Vaxius`).
            for key in [loose(&name), loose(&unglued(&name))] {
                if key.len() < 3 {
                    continue;
                }
                ix.max_words = ix.max_words.max(key.split(' ').count());
                // Two pages one hyphen apart are one item; the game writes the hyphen
                // ("Slime Blood of Cazic-Thule"), and so do rows an archive already holds.
                let kept = ix.names.entry(key).or_insert_with(|| name.clone());
                if !kept.contains('-') && name.contains('-') {
                    kept.clone_from(&name);
                }
            }
        }
        ix
    }

    pub fn is_empty(&self) -> bool {
        self.names.is_empty()
    }

    /// The name a phrase spells, allowing a plural `s` and a leading article.
    fn get(&self, phrase: &str) -> Option<&String> {
        let unplural = phrase.strip_suffix('s').unwrap_or(phrase);
        let plural = format!("{phrase}s");
        let bare = ["a ", "an ", "the "]
            .iter()
            .find_map(|a| phrase.strip_prefix(a))
            .unwrap_or(phrase);
        self.names
            .get(phrase)
            .or_else(|| self.names.get(unplural))
            .or_else(|| self.names.get(&plural).filter(|_| phrase.contains(' ')))
            .or_else(|| self.names.get(bare))
    }
}

const SEPARATORS: &[&str] = &["|", "/", ",", ";", ":", "!", "-", "(", ")"];
const FILLERS: &[&str] = &[
    "a", "an", "the", "my", "some", "few", "any", "your", "of", "for", "and", "or", "&",
];

struct Parser<'a> {
    t: Vec<Tok>,
    ix: &'a ItemIndex,
    out: Vec<Offer>,
    dir: Option<Dir>,
    lead_price: Option<f64>,
    pending_qty: Option<u32>,
    /// Index into `out` of the offer the next tier, count or price belongs to.
    last: Option<usize>,
    /// May an item name start here.
    fresh: bool,
    /// The price on `last` was stated after it, so a tier that follows starts the next tier's offer.
    priced_here: bool,
}

impl<'a> Parser<'a> {
    fn item_at(&self, i: usize) -> Option<(String, usize)> {
        let max = self.ix.max_words.min(self.t.len().saturating_sub(i));
        (1..=max).rev().find_map(|w| {
            let words: Vec<&str> = self.t[i..i + w].iter().map(|x| x.n.as_str()).collect();
            let phrase = words.join(" ");
            let phrase = phrase.trim();
            if w == 1 && phrase.len() < 4 {
                return None;
            }
            self.ix.get(phrase).map(|name| (name.clone(), w))
        })
    }

    fn try_dir(&mut self, i: usize) -> Option<usize> {
        let opens = i == 0 || self.t[..i].iter().all(|x| x.n.is_empty());
        // "paying 15k for X" is a buy, but only as the opening word: after "WTB X." it is the price.
        let paying = opens && matches!(self.t[i].n.as_str(), "paying" | "offering");
        let d = if paying {
            Dir::Buy
        } else {
            Dir::of(&self.t[i].n)?
        };
        let acronym = self.t[i].n.starts_with("wt");
        let after_sep = i > 0 && [",", ".", "|", "/"].contains(&self.t[i - 1].raw.as_str());
        if !(opens || acronym || after_sep) {
            return None;
        }
        self.dir = Some(d);
        self.last = None;
        self.lead_price = None;
        self.fresh = true;
        Some(i + 1)
    }

    fn try_skip(&mut self, i: usize) -> Option<usize> {
        let tok = &self.t[i];
        if FILLERS.contains(&tok.n.as_str()) {
            return Some(i + 1);
        }
        if SEPARATORS.contains(&tok.raw.as_str()) || tok.n.is_empty() {
            self.fresh = true;
            return Some(i + 1);
        }
        None
    }

    fn try_item(&mut self, i: usize, dir: Dir) -> Option<usize> {
        if !self.fresh {
            return None;
        }
        let (item, used) = self.item_at(i)?;
        if self.is_purpose(i, dir) {
            return Some(i + used);
        }
        self.priced_here = false;
        self.out.push(Offer {
            dir,
            item,
            tier: 0,
            qty: self.pending_qty.take(),
            price_pp: self.lead_price,
            each: self.lead_price.is_some(),
            sure: true,
        });
        self.last = Some(self.out.len() - 1);
        Some(i + used)
    }

    /// "Book of Scale for Fiery Avenger 5k", "jewelry kit for White Dragonscale Cloak": an item after
    /// "for" names what the offer is for, not a second offer. Not in a barter, nor after a price
    /// ("paying 15k for X") or "trade for X".
    fn is_purpose(&self, i: usize, dir: Dir) -> bool {
        if dir == Dir::Trade || i < 2 || self.t[i - 1].n != "for" {
            return false;
        }
        // A price ends right before "for": `15k`, `400 plat`, `10 000 pp`.
        let priced = (1..=3).any(|span| {
            i > span && price_at(&self.t, i - 1 - span).is_some_and(|(_, used)| used == span)
        });
        let before = self.t[i - 2].n.as_str();
        !priced && !matches!(before, "trade" | "wtt" | "trading" | "swap")
    }

    fn next_tier_offer(&self, i: usize) -> bool {
        let after_sep = i > 0 && SEPARATORS.contains(&self.t[i - 1].raw.as_str());
        let after_price = (1..=3).any(|span| {
            i >= span && price_at(&self.t, i - span).is_some_and(|(_, used)| used == span)
        });
        (after_sep || after_price) && price_at(&self.t, i + 1).is_some()
    }

    /// `+4` or `4+` sets the tier; `x2` or `2x` the count; `each` marks the price per unit.
    fn try_modifier(&mut self, i: usize) -> Option<usize> {
        static TIER: OnceLock<Regex> = OnceLock::new();
        static QTY: OnceLock<Regex> = OnceLock::new();
        let raw = self.t[i].raw.as_str();
        if let Some(c) = re(&TIER, r"^(?:\+(\d{1,2})|(\d{1,2})\+)$").captures(raw) {
            let mut last = self.last?;
            let tier = c.get(1).or(c.get(2))?.as_str().parse().ok()?;
            // "+7 20k, +6 11k": a priced tier is done, so a tier after a separator or a price, with a
            // price of its own next, is the same item's next offer. Any other tier after the price
            // ("can make up to +5!", "2k if buying 3+") says nothing about this offer.
            if self.priced_here {
                if !self.next_tier_offer(i) {
                    return Some(i + 1);
                }
                let next = Offer {
                    tier,
                    qty: None,
                    price_pp: None,
                    each: false,
                    ..self.out[last].clone()
                };
                self.out.push(next);
                last = self.out.len() - 1;
                self.last = Some(last);
                self.priced_here = false;
            }
            self.out[last].tier = tier;
            self.fresh = true;
            return Some(i + 1);
        }
        if let Some(c) = re(&QTY, r"(?i)^(?:x(\d+)|(\d+)x)$").captures(raw) {
            let qty = c.get(1).or(c.get(2))?.as_str().parse().ok();
            // `6k 100x Deepwater Ink`: a count right before a name, once the item before it is
            // priced (or there is none), counts that next item. `Jacinthx16, Black Sapphire`
            // keeps the count on the unpriced item it follows.
            if self.item_at(i + 1).is_some() && (self.last.is_none() || self.priced_here) {
                self.pending_qty = qty;
            } else if let Some(last) = self.last {
                self.out[last].qty = qty;
            }
            self.fresh = true;
            return Some(i + 1);
        }
        if matches!(self.t[i].n.as_str(), "each" | "ea" | "per") {
            if let Some(last) = self.last {
                self.out[last].each = true;
            }
            return Some(i + 1);
        }
        None
    }

    fn try_price(&mut self, i: usize, dir: Dir) -> Option<usize> {
        let (pp, used) = price_at(&self.t, i)?;
        let bare = used == 1 && self.t[i].raw.bytes().all(|b| b.is_ascii_digit());
        if bare {
            if let Some(verdict) = self.bare_number(i) {
                return verdict;
            }
        }
        self.fresh = true;
        if dir != Dir::Trade {
            self.apply_price(pp, i, dir);
        }
        Some(i + used)
    }

    /// A number with no `k`, `pp` or coin: `Some` when it is no price here (the inner value is
    /// where to go on, `None` when it is an unread word), `None` when it is one.
    fn bare_number(&mut self, i: usize) -> Option<Option<usize>> {
        let each_next = self
            .t
            .get(i + 1)
            .is_some_and(|x| matches!(x.n.as_str(), "each" | "ea" | "per"));
        if !self.fresh && !each_next && self.item_at(i + 1).is_none() || self.words_follow(i) {
            return Some(None);
        }
        // "Bone Chips 580, 10p each", "ssoy 4, 1k": the price with a unit is the price.
        if self.unit_price_follows(i) {
            return Some(Some(i + 1));
        }
        // "Deepwater Ink 40 100 each": the first number counts, the second prices each.
        if self.count_before_each(i) {
            return Some(Some(i + 1));
        }
        self.fresh = true;
        self.try_count(i).then_some(Some(i + 1))
    }

    /// "6 left", "2 black saphires": a bare number before a word that is no item and no price word
    /// counts something, so it prices nothing.
    fn words_follow(&self, i: usize) -> bool {
        let Some(next) = self.t.get(i + 1) else {
            return false;
        };
        let word = next
            .n
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphabetic());
        word && !AFTER_BARE_PRICE.contains(&next.n.as_str()) && self.item_at(i + 1).is_none()
    }

    fn count_before_each(&mut self, i: usize) -> bool {
        let bare = |x: &Tok| !x.raw.is_empty() && x.raw.bytes().all(|b| b.is_ascii_digit());
        let shape = self.t.get(i + 1).is_some_and(bare)
            && self
                .t
                .get(i + 2)
                .is_some_and(|x| matches!(x.n.as_str(), "each" | "ea" | "per"));
        let Some(last) = self.last.filter(|_| shape) else {
            return false;
        };
        self.out[last].qty = self.t[i].raw.parse().ok();
        true
    }

    fn unit_price_follows(&self, i: usize) -> bool {
        self.t.get(i + 1).is_some_and(|x| x.raw == ",")
            && price_at(&self.t, i + 2).is_some_and(|(_, used)| {
                self.t[i + 2..i + 2 + used]
                    .iter()
                    .any(|x| x.raw.bytes().any(|b| b.is_ascii_alphabetic()))
            })
    }

    /// A bare number that counts rather than prices: before an item ("WTS 400 Fruit 30k"), or
    /// before "for" and a price ("Bone Chips 1000 for 10k"); "250 for diamonds" is a price.
    fn try_count(&mut self, i: usize) -> bool {
        if self.item_at(i + 1).is_some() {
            self.pending_qty = self.t[i].raw.parse().ok();
            return true;
        }
        let for_price =
            self.t.get(i + 1).is_some_and(|x| x.n == "for") && self.item_at(i + 2).is_none();
        match (for_price, self.last) {
            (true, Some(last)) => {
                self.out[last].qty = self.t[i].raw.parse().ok();
                true
            }
            _ => false,
        }
    }

    /// The price starting at `at`: for the item before it, or with `each` after it or `paying`
    /// before it, for every unpriced item before it ("A +5/B +5 paying 4k").
    fn apply_price(&mut self, pp: f64, at: usize, dir: Dir) {
        let (_, used) = price_at(&self.t, at).unwrap_or((pp, 1));
        let bare = bare_at(&self.t, at, used);
        let each = self
            .t
            .get(at + used)
            .is_some_and(|x| matches!(x.n.as_str(), "each" | "ea" | "per"))
            || (at > 0 && matches!(self.t[at - 1].n.as_str(), "paying" | "offering"));
        // A price before "for" and an item prices that item, wherever it stands: "paying 15k for
        // A", "400 plat for black sapphires and 250 for diamonds". "3k for both" stays with the
        // item before it.
        let for_item = self.t.get(at + used).is_some_and(|x| x.n == "for")
            && self.item_at(at + used + 1).is_some();
        if for_item {
            self.lead_price = Some(pp);
            return;
        }
        let Some(last) = self.last else {
            // A price before any item: "3k each: A | B".
            if each {
                self.lead_price = Some(pp);
            }
            return;
        };
        if self.out[last].price_pp.is_some() {
            return;
        }
        for (k, o) in self.out.iter_mut().enumerate() {
            let backfill = each && o.price_pp.is_none() && o.dir == dir;
            if k == last || backfill {
                self.priced_here |= k == last;
                o.price_pp = Some(pp);
                o.each |= each;
                o.sure &= !bare;
            }
        }
    }

    fn step(&mut self, i: usize) -> Option<usize> {
        if let Some(next) = self.try_dir(i) {
            return Some(next);
        }
        let Some(dir) = self.dir else {
            return self.t[i].n.is_empty().then_some(i + 1);
        };
        let next = self
            .try_skip(i)
            .or_else(|| self.try_item(i, dir))
            .or_else(|| self.try_modifier(i))
            .or_else(|| self.try_price(i, dir));
        Some(next.unwrap_or_else(|| {
            self.fresh = false;
            i + 1
        }))
    }
}

/// Every offer in one chat message. Empty when it does not open with a direction.
pub fn parse_trade(msg: &str, ix: &ItemIndex) -> Vec<Offer> {
    let whole = parse_tokens(tokens(msg, false), ix);
    // Two item links pasted back to back ("Stonemelder's BandFleeting Quiver") read apart, kept
    // only when that finds more; "StoneMelders Band" is one item either way.
    if !unglued(msg).eq(msg) {
        let apart = parse_tokens(tokens(msg, true), ix);
        if apart.len() > whole.len() {
            return apart;
        }
    }
    whole
}

fn parse_tokens(t: Vec<Tok>, ix: &ItemIndex) -> Vec<Offer> {
    let mut p = Parser {
        t,
        ix,
        out: Vec::new(),
        dir: None,
        lead_price: None,
        pending_qty: None,
        last: None,
        fresh: true,
        priced_here: false,
    };
    let mut i = 0;
    while i < p.t.len() {
        match p.step(i) {
            Some(next) => i = next,
            None => break,
        }
    }
    mark_guesses(&p.t, &mut p.out);
    p.out
}

#[cfg(test)]
#[path = "bazaar_rules_tests.rs"]
mod rules_tests;
