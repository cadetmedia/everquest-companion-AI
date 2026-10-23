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
//! A child of `gaps.rs`, apart so that file keeps its size.

use crate::modules::gaps_details::coin_of;
use crate::modules::gaps_keys::ItemIndex;
use super::GapsModule;
use crate::event::Event;
use crate::message_overlay::message_text_of;
use crate::modules::consider::mob_key;
use serde_json::{json, Value};
use std::collections::HashMap;

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

/// Mob key of the merchant → what it sold, in the order first seen.
#[derive(Default)]
pub struct Stock(HashMap<String, Vec<Sold>>);

impl Stock {
    pub fn clear(&mut self) {
        self.0.clear();
    }

    /// The merchant sold or quoted `item`, at `ally_copper` when the player stood at ally. True when
    /// the stock changed.
    fn sold(&mut self, merchant: &str, item: &str, ally_copper: Option<i64>) -> bool {
        let items = self.0.entry(mob_key(merchant)).or_default();
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

    /// `[{item, copper?}]` A to Z, each under its page title where the data has one; None for a name
    /// that sold nothing.
    pub fn serve(&self, key: &str, items: &ItemIndex) -> Option<Value> {
        let sold = self.0.get(key)?;
        let mut rows: Vec<(String, Option<i64>)> = sold.iter().map(|s| (items.page(&s.item).unwrap_or(&s.item).to_string(), s.ally_copper)).collect();
        rows.sort_by_key(|(item, _)| item.to_lowercase());
        rows.dedup_by(|a, b| a.0.eq_ignore_ascii_case(&b.0));
        let rows: Vec<Value> = rows.iter().map(|(item, copper)| copper.map_or_else(|| json!({ "item": item }), |c| json!({ "item": item, "copper": c }))).collect();
        Some(Value::Array(rows))
    }
}

impl GapsModule {
    /// A quote or a purchase: the item goes on its merchant's stock. True when the stock changed.
    pub(super) fn stocked(&mut self, ev: &Event) -> bool {
        match ev.kind() {
            "purchase" => match (ev.str("npc"), ev.str("item")) {
                (Some(npc), Some(item)) => self.stock.sold(npc, item, None),
                _ => false,
            },
            "unknown" => {
                let Some((merchant, item, copper)) = quote_of(message_text_of(ev.raw())) else {
                    return false;
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
            s.serve("mindiinya n'zar", &items),
            Some(json!([{ "item": "Cat's Eye Agate", "copper": 210 }, { "item": "Malachite" }])),
            "A to Z, under the catalog's title"
        );
        assert_eq!(s.serve("kaelin k'toz", &items), None);
    }
}
