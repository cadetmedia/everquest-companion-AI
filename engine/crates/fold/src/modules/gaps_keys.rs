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
//!
//! AND A LOOSE FOLD, tried only when the exact key misses (owner ask, 2026-10-11): apostrophes
//! dropped, `-` `,` `.` read as spaces, spaces collapsed, ` vs ` / ` vs. ` read as ` versus `.
//! Measured on the owner's tab: `Torn, Frost-Covered Book` → `torn, frost covered book`,
//! `Angstlichs Appalling Screech` → `Angstlich's …`, `Illusion: Half Elf` → `Illusion: Half-Elf`,
//! `Invisibility vs. Undead` → `Invisibility versus Undead`. The row keeps the log's spelling.
//!
//! A SPELL'S OWN NUMERAL (owner ask, 2026-10-17): the game ranks a spell whose name already ends in
//! one, `Yaulp II V`, so the cast strips to `Yaulp II` while the catalog's key had stripped its own
//! `II`. The catalog is keyed whole as well. And an AA cast (`Heroic Leap I`) is known by the
//! Alternate Advancement page's rows in `classes.json`, under the cast its description names
//! (`Companion's Fury` casts `Frenzied Burnout`).

use crate::jsfn::item_tier_key;
use eqlog::jsstr::js_trim;
use eqlog::names::spell_canon_key;
use serde_json::Value;
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
    scroll_spell(name).is_some_and(spell_known)
}

/// [`spell_keys`] under [`loose_key`], the fallback index.
pub fn spell_keys_loose() -> &'static HashSet<String> {
    static KEYS: OnceLock<HashSet<String>> = OnceLock::new();
    KEYS.get_or_init(|| spell_keys().iter().map(|k| loose_key(k)).collect())
}

/// A spell: rank stripped, lowercased (as the buffs module keys a cast), quotes folded.
pub fn spell_gap_key(name: &str) -> String {
    fold_quotes(&spell_canon_key(name))
}

/// The loose fold of an exact key — see the module header. Applied on both sides.
pub fn loose_key(key: &str) -> String {
    let spaced = key.replace('\'', "").replace(['-', ',', '.'], " ");
    let collapsed = spaced.split_whitespace().collect::<Vec<_>>().join(" ");
    format!(" {collapsed} ")
        .replace(" vs ", " versus ")
        .trim()
        .to_string()
}

/// Is the name's spell in the catalog, exactly or loosely?
pub fn spell_known(name: &str) -> bool {
    let key = spell_gap_key(name);
    spell_keys().contains(&key) || spell_keys_loose().contains(&loose_key(&key))
}

/// Every committed spell under [`spell_gap_key`], and whole (`yaulp ii`) — see the header.
/// Built once per process off the one effective catalog.
pub fn spell_keys() -> &'static HashSet<String> {
    static KEYS: OnceLock<HashSet<String>> = OnceLock::new();
    KEYS.get_or_init(|| {
        let whole = |n: &str| fold_quotes(&js_trim(n).to_lowercase());
        eqlog::spelldb::shared()
            .spells
            .iter()
            .flat_map(|s| [spell_gap_key(&s.name), whole(&s.name)])
            .collect()
    })
}

/// The class tables: `aas`, every row of the Alternate Advancement page, and `abilities`, the
/// castable names that are no spell page. A classes.json older than `aas` answers from
/// `abilities` alone.
const CLASSES_JSON: &str = include_str!("../../../../../src/main/data/classes.json");

/// Is the cast an AA's — its name, or the cast its description names? Loose on both sides.
pub fn aa_known(name: &str) -> bool {
    static KEYS: OnceLock<HashSet<String>> = OnceLock::new();
    let keys = KEYS.get_or_init(|| {
        let file: Value = serde_json::from_str(CLASSES_JSON).unwrap_or(Value::Null);
        let aas = file["aas"].as_object().into_iter().flatten();
        let named = aas.flat_map(|(n, row)| [Some(n.as_str()), row["cast"].as_str()]);
        let abilities = file["abilities"].as_object().into_iter().flatten();
        named
            .flatten()
            .chain(abilities.map(|(n, _)| n.as_str()))
            .map(|n| loose_key(&spell_gap_key(n)))
            .collect()
    });
    keys.contains(&loose_key(&spell_gap_key(name)))
}
