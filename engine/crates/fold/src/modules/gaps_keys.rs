//! The keys the gaps module checks a name by, and the one fold they share: ` ’ ´ read as '.
//!
//! The game prints a backtick where the wiki's own item keys are split — on the shipped
//! `items.json`, 236 keys carry a backtick and 1,004 an apostrophe, ten names both — so a quote
//! is not a difference. `consider::mob_key` already folds it for mobs; this folds it for items and
//! spells, on BOTH sides of each check, while the row keeps the name as the log spelled it.
//!
//! Three more shapes of an item name are read here before the check (owner ask, 2026-10-11):
//!
//!   * A SCROLL, `Spell: X` / `Song: X`, has no wiki item page — the spell's own page stands for
//!     it — so it is known when X is in the spell catalog, and a scroll whose spell is not is
//!     still a gap, filed under the whole name so the row reads as a scroll. No `Tome:` on the
//!     owner's logs (456 `Spell:` and 23 `Song:` names, 2026-10-11).
//!   * ` from Reward Chest`: the eqlog loot parser leaves the chest in the item name on a
//!     `--You have looted X from Reward Chest.--` line, because its source capture wants a
//!     corpse. The honest fix is in that parser (creator code); this strip is the gaps module's
//!     own guard, keyed by the base and displayed whole only when the base is unknown.
//!   * ` (Exaltation)`: the socket suffix, keyed away like ` +N` is.

use crate::jsfn::item_tier_key;
use eqlog::jsstr::js_trim;
use eqlog::names::spell_canon_key;
use std::collections::HashSet;
use std::sync::OnceLock;

/// ` ’ ´ → ', the same three `consider::mob_key` folds.
pub fn fold_quotes(s: &str) -> String {
    s.replace(['`', '\u{2019}', '\u{00b4}'], "'")
}

/// An item: the two suffixes above and ` +N` stripped, lowercased (`items.json`'s own key),
/// quotes folded.
pub fn item_gap_key(name: &str) -> String {
    fold_quotes(&item_tier_key(item_base(name)))
}

/// The name without ` (Exaltation)` and without ` from Reward Chest` — see the module header.
fn item_base(name: &str) -> &str {
    let n = js_trim(name);
    let n = n.strip_suffix(" (Exaltation)").unwrap_or(n);
    n.strip_suffix(" from Reward Chest").unwrap_or(n)
}

/// The spell a scroll's item name carries: `Spell: X` / `Song: X` → `X`.
pub fn scroll_spell(name: &str) -> Option<&str> {
    const PREFIXES: [&str; 2] = ["Spell: ", "Song: "];
    let n = js_trim(name);
    PREFIXES
        .iter()
        .find_map(|p| n.strip_prefix(p))
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

/// A scroll whose spell the catalog knows: the spell's page stands for the item's.
pub fn scroll_known(name: &str) -> bool {
    scroll_spell(name).is_some_and(|s| spell_keys().contains(&spell_gap_key(s)))
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
