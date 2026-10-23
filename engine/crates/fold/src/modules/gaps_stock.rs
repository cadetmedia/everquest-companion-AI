//! What each merchant sells, for a new merchant page's `items_sold` (owner, 2026-10-23: "why doesn't
//! our merchant page show items sold? I just clicked on a bunch from one vendor and the code doesn't
//! show any items (it doesn't have to list price)"). This reverses the 2026-10-18 decision to leave
//! the list open: a merchant's stock mixes player resells the log cannot tell apart, so a resell may
//! appear for the player to prune before saving the page.
//!
//! What the merchant SOLD the player, or offered to: a price quote (`Kaelin K`Toz told you, 'That'll
//! be 104 platinum 9 gold 9 silver 9 copper per Platinum Bar.'`, `... for the Jeweler's Kit.'`) and a
//! purchase from it. Never what the player sold TO it (a vendor's coin, an `I'll give you` offer).
//!
//! THE PRICE. A quote depends on the player's faction standing with the merchant and on Charisma,
//! which the log never shows, so no formula turns one standing's price into another's. An item keeps
//! the price of its latest quote heard while the player's latest /con of that merchant, before the
//! quote, said ally (owner, 2026-10-23: "don't show the price since we can't guarantee it"); the
//! page writes prices only when every item has one (`shared/wikiPage.ts`).
//!
//! Served on the merchant's Mobs and Merchants rows as `itemsSold`, A to Z, each item under its
//! catalog page title when the data has one. At most STOCK_CAP items per merchant.
//!
//! THE HAIL ANSWER (owner, 2026-10-23: "why don't the vendors have descriptions ... 3. any text they
//! say when hailed"). The NPC's first `says` within ANSWER_MS of the player's hail, served as
//! `greeting`, for the page's description: 12 of the 725 cached merchant pages with a description
//! quote the hail and its answer. The shop window's own greetings (`Welcome to my shop, X. You would
//! probably find a Y handy.`) are no answer: they follow an open window, and 18 of 166 answers in the
//! owner's log were one, the window opened within the ten seconds. A faction's stock reply
//! (`Is that your BREATH, or did something die in here?`, four merchants in the owner's logs) is the
//! player's standing, not the NPC's words, and is no answer either.
//!
//! THE CONS (owner, 2026-10-23: every Merchants row said "needs: level (/con)" after a /con). A con
//! files on the Mobs row, or on no row for a mob the wiki has; a merchant's own row is its trades.
//! Each name's con labels (`L50 ally`, as the Mobs row tallies them) are kept here and served on a
//! Merchants row that has none, so its page takes the level as a mob page does.
//!
//! A child of `gaps.rs`, apart so that file keeps its size.

use crate::modules::gaps_details::coin_of;
use crate::modules::gaps_players::{hail_of, ANSWER_MS};
use crate::modules::gaps_keys::ItemIndex;
use super::{Domain, GapsModule};
use crate::event::Event;
use crate::message_overlay::message_text_of;
use crate::modules::consider::mob_key;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};

/// Items kept per merchant: a big vendor lists a few dozen; the cap bounds a long log's resells.
const STOCK_CAP: usize = 200;

/// The /con rung a quote's price stands at on the page (`eqlog` parse/data.rs: `regards you as an ally`).
const ALLY: &str = "ally";

/// `X told you, 'That'll be <coin> per <item>.'` / `... for the <item>.'` → (X, item, copper).
pub fn quote_of(text: &str) -> Option<(&str, &str, i64)> {
    let (merchant, rest) = text.split_once(" told you, 'That'll be ")?;
    let rest = rest.strip_suffix('\'')?;
    let rest = rest.strip_suffix('.').unwrap_or(rest);
    // The coin never holds ` for the ` or ` per `, so the first one ends it; an item may hold either.
    let (coin, item) = rest.split_once(" for the ").or_else(|| rest.split_once(" per "))?;
    let (_, copper) = coin_of(coin).filter(|(w, _)| w == coin)?;
    (!merchant.is_empty() && !item.is_empty()).then_some((merchant, item, copper))
}

/// One item a merchant sold or quoted: as printed, and its latest price heard at ally.
struct Sold {
    item: String,
    ally_copper: Option<i64>,
}

/// The shop window's greetings, an opening and a phrase within it: never a hail's answer.
const SHOP_GREETINGS: [(&str, &str); 4] = [
    ("Welcome to my shop, ", " handy."),
    ("Hello there, ", "How about a nice "),
    ("Greetings, ", "You look like you could use a"),
    ("Hi there, ", "Just browsing?"),
];

/// A faction's stock replies, said by any NPC to a player it dislikes: never the NPC's own words.
const FACTION_REPLIES: [&str; 4] = [
    "Is that your BREATH, or did something die in here?",
    "Oh look, a talking lump of refuse.",
    "Creatures like you make me sick...",
    "I didn't know Slime could speak.",
];

/// `Konro Strongfoot says, 'Aye, ...'` from `Konro Strongfoot` → `Aye, ...`; None for another speaker.
fn said_by<'a>(text: &'a str, name: &str) -> Option<&'a str> {
    let head = text.get(..name.len()).filter(|h| h.eq_ignore_ascii_case(name))?;
    let said = text[head.len()..].strip_prefix(" says, '")?.strip_suffix('\'')?;
    let shop = SHOP_GREETINGS.iter().any(|(open, within)| said.starts_with(open) && said.contains(within));
    let faction = FACTION_REPLIES.iter().any(|r| said.starts_with(r));
    (!shop && !faction && !said.is_empty()).then_some(said)
}

/// Mob key of the merchant → what it sold, in the order first seen; and each NPC's hail answer.
#[derive(Default)]
pub struct Stock {
    sold: HashMap<String, Vec<Sold>>,
    /// The name last hailed and when, waiting for its answer.
    hailed: Option<(String, i64)>,
    /// Mob key → its latest answer to a hail.
    greetings: HashMap<String, String>,
    /// Mob key → each con label seen (`L50 ally`) and how often, for its Merchants row.
    cons: HashMap<String, BTreeMap<String, u32>>,
}

impl Stock {
    pub fn clear(&mut self) {
        self.sold.clear();
        self.hailed = None;
        self.greetings.clear();
        self.cons.clear();
    }

    /// A /con of `mob`: its label as the Mobs row tallies it (gaps_details.rs).
    pub fn conned(&mut self, mob: &str, level: Option<i64>, faction: Option<&str>) {
        let label = format!("L{} {}", level.unwrap_or_default(), faction.unwrap_or_default());
        *self.cons.entry(mob_key(mob)).or_default().entry(label).or_default() += 1;
    }

    /// The cons as a row's `details.cons` serves them: most seen first.
    fn cons_of(&self, key: &str) -> Option<Value> {
        let mut all: Vec<(&String, &u32)> = self.cons.get(key)?.iter().collect();
        all.sort_by(|a, b| b.1.cmp(a.1).then_with(|| a.0.cmp(b.0)));
        let entries: Vec<Value> = all.iter().map(|(name, n)| json!({ "name": name, "n": n })).collect();
        Some(json!({ "entries": entries, "distinct": all.len() }))
    }

    /// A hail notes its name; that NPC's first `says` within ANSWER_MS is its answer. True when an
    /// answer changed.
    fn heard(&mut self, text: &str, ts: i64) -> bool {
        if let Some(name) = hail_of(text) {
            self.hailed = Some((name.to_string(), ts));
            return false;
        }
        let Some((name, at)) = self.hailed.take() else {
            return false;
        };
        if ts - at > ANSWER_MS {
            return false;
        }
        let Some(said) = said_by(text, &name) else {
            // Still waiting: another line between the hail and its answer.
            self.hailed = Some((name, at));
            return false;
        };
        self.greetings.insert(mob_key(&name), said.to_string()).as_deref() != Some(said)
    }

    /// The merchant sold or quoted `item`, at `ally_copper` when the player stood at ally. True when
    /// the stock changed.
    fn sold(&mut self, merchant: &str, item: &str, ally_copper: Option<i64>) -> bool {
        let items = self.sold.entry(mob_key(merchant)).or_default();
        if let Some(s) = items.iter_mut().find(|s| s.item.eq_ignore_ascii_case(item)) {
            let was = s.ally_copper;
            s.ally_copper = ally_copper.or(was);
            return s.ally_copper != was;
        }
        if items.len() >= STOCK_CAP {
            return false;
        }
        items.push(Sold { item: item.to_string(), ally_copper });
        true
    }

    /// `itemsSold` and `greeting` on the row, each where the log had one.
    pub fn serve(&self, key: &str, items: &ItemIndex, v: &mut Value) {
        if let Some(sold) = self.sold_of(key, items) {
            v["itemsSold"] = sold;
        }
        if let Some(said) = self.greetings.get(key) {
            v["greeting"] = json!(said);
        }
    }

    /// `[{item, copper?}]` A to Z, each under its page title where the data has one; None for a name
    /// that sold nothing.
    fn sold_of(&self, key: &str, items: &ItemIndex) -> Option<Value> {
        let sold = self.sold.get(key)?;
        let mut rows: Vec<(String, Option<i64>)> = sold.iter().map(|s| (items.page(&s.item).unwrap_or(&s.item).to_string(), s.ally_copper)).collect();
        rows.sort_by_key(|(item, _)| item.to_lowercase());
        rows.dedup_by(|a, b| a.0.eq_ignore_ascii_case(&b.0));
        let rows: Vec<Value> = rows.iter().map(|(item, copper)| copper.map_or_else(|| json!({ "item": item }), |c| json!({ "item": item, "copper": c }))).collect();
        Some(Value::Array(rows))
    }
}

impl GapsModule {
    /// A Mobs or Merchants row's stock and hail answer; a Merchants row without cons takes the name's.
    pub(super) fn serve_stock(&self, domain: Domain, key: &str, v: &mut Value) {
        if !matches!(domain, Domain::Mob | Domain::Merchant) {
            return;
        }
        self.stock.serve(key, &self.items, v);
        let lacks = v["details"].is_object() && v["details"].get("cons").is_none();
        if let Some(cons) = self.stock.cons_of(key).filter(|_| domain == Domain::Merchant && lacks) {
            v["details"]["cons"] = cons;
        }
    }

    /// A quote or a purchase: the item goes on its merchant's stock. True when the stock changed.
    pub(super) fn stocked(&mut self, ev: &Event) -> bool {
        match ev.kind() {
            "purchase" => match (ev.str("npc"), ev.str("item")) {
                (Some(npc), Some(item)) => self.stock.sold(npc, item, None),
                _ => false,
            },
            "unknown" => {
                let text = message_text_of(ev.raw());
                let Some((merchant, item, copper)) = quote_of(text) else {
                    return self.stock.heard(text, ev.ts());
                };
                let ally = self.standings.of(merchant) == Some(ALLY);
                self.stock.sold(merchant, item, ally.then_some(copper))
            }
            _ => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{quote_of, Stock};
    use crate::modules::gaps_keys::ItemIndex;
    use serde_json::json;

    /// The owner's lines, 2026-10-23.
    #[test]
    fn a_quote_names_the_merchant_the_item_and_the_price_per_one_or_for_the_whole() {
        assert_eq!(
            quote_of("Kaelin K`Toz told you, 'That'll be 104 platinum 9 gold 9 silver 9 copper per Platinum Bar.'"),
            Some(("Kaelin K`Toz", "Platinum Bar", 104_999))
        );
        assert_eq!(
            quote_of("Kaelin K`Toz told you, 'That'll be 1 platinum 4 silver 9 copper for the Jeweler's Kit.'"),
            Some(("Kaelin K`Toz", "Jeweler's Kit", 1_049))
        );
        assert_eq!(quote_of("Mindiinya N`Zar told you, 'That'll be 2 gold 9 copper per Cat's Eye Agate.'"), Some(("Mindiinya N`Zar", "Cat's Eye Agate", 209)));
        assert_eq!(quote_of("Klok Koglin told you, 'I'll give you 1 platinum for the Fungus Spores.'"), None, "a sale to it is no stock");
    }

    #[test]
    fn the_latest_ally_price_stays_and_a_later_quote_at_another_standing_does_not_clear_it() {
        let mut s = Stock::default();
        let items = ItemIndex::new(&[("cat's eye agate".to_string(), "Cat's Eye Agate".to_string())]);
        assert!(s.sold("Mindiinya N`Zar", "Malachite", None));
        assert!(s.sold("Mindiinya N`Zar", "cat's eye agate", Some(209)));
        assert!(!s.sold("Mindiinya N`Zar", "Cat's Eye Agate", None), "an unknown standing changes nothing");
        assert!(s.sold("Mindiinya N`Zar", "Cat's Eye Agate", Some(210)));
        assert_eq!(
            s.sold_of("mindiinya n'zar", &items),
            Some(json!([{ "item": "Cat's Eye Agate", "copper": 210 }, { "item": "Malachite" }])),
            "A to Z, under the catalog's title"
        );
        assert_eq!(s.sold_of("kaelin k'toz", &items), None);
    }

    /// The owner's log, 2026-10-23: a hail's answer is kept; a shop window's greeting, another
    /// speaker's line or a line after ANSWER_MS is not.
    #[test]
    fn a_hail_answer_is_the_npcs_first_says_after_it_and_a_shop_greeting_is_none() {
        let mut s = Stock::default();
        assert!(!s.heard("You say, 'Hail, Konro Strongfoot'", 0));
        assert!(!s.heard("Ukbog says, 'Grr.'", 500), "another speaker");
        assert!(s.heard("Konro Strongfoot says, 'Aye, you looking for materials or tools of the trade? I have it all!'", 1_000));
        assert!(!s.heard("You say, 'Hail, Mindiinya N`Zar'", 2_000));
        assert!(!s.heard("Mindiinya N`Zar says, 'Greetings, Drywrought. You look like you could use a Star Rose Quartz.'", 3_000));
        assert!(!s.heard("You say, 'Hail, Kaelin K`Toz'", 4_000));
        assert!(!s.heard("Kaelin K`Toz says, 'Hurry up and buy something.'", 20_000), "too late");
        assert!(!s.heard("You say, 'Hail, Drip Drop'", 21_000));
        assert!(!s.heard("Drip Drop says, 'Is that your BREATH, or did something die in here?  Now go away!'", 21_000), "a faction's reply");
        let mut v = json!({});
        s.serve("konro strongfoot", &ItemIndex::new(&[]), &mut v);
        assert_eq!(v, json!({ "greeting": "Aye, you looking for materials or tools of the trade? I have it all!" }));
        assert!(!s.greetings.contains_key("mindiinya n'zar") && !s.greetings.contains_key("kaelin k'toz") && !s.greetings.contains_key("drip drop"));
    }
}
