//! The keys the gaps module checks a name by, and the one fold they share: ` ’ ´ read as '.
//!
//! The game prints a backtick where the wiki's own item keys are split — on the shipped
//! `items.json`, 236 keys carry a backtick and 1,004 an apostrophe, ten names both — so a quote
//! is not a difference. `consider::mob_key` already folds it for mobs; this folds it for items and
//! spells, on BOTH sides of each check, while the row keeps the name as the log spelled it.

use crate::jsfn::item_tier_key;
use eqlog::names::spell_canon_key;
use std::collections::HashSet;
use std::sync::OnceLock;

/// ` ’ ´ → ', the same three `consider::mob_key` folds.
pub fn fold_quotes(s: &str) -> String {
    s.replace(['`', '\u{2019}', '\u{00b4}'], "'")
}

/// An item: ` +N` stripped, lowercased (`items.json`'s own key), quotes folded.
pub fn item_gap_key(name: &str) -> String {
    fold_quotes(&item_tier_key(name))
}

/// A spell: rank stripped, lowercased (as the buffs module keys a cast), quotes folded.
pub fn spell_gap_key(name: &str) -> String {
    fold_quotes(&spell_canon_key(name))
}

/// Every committed spell under [`spell_gap_key`]. Built once per process off the one effective
/// catalog.
pub fn spell_keys() -> &'static HashSet<String> {
    static KEYS: OnceLock<HashSet<String>> = OnceLock::new();
    KEYS.get_or_init(|| {
        eqlog::spelldb::shared()
            .spells
            .iter()
            .map(|s| spell_gap_key(&s.name))
            .collect()
    })
}
