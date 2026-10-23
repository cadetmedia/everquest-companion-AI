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
use std::collections::{HashMap, HashSet};
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
    spell_keys().contains(&key) || spell_keys_loose().contains(&loose_key(&key)) || spell_redirects().contains_key(&loose_key(&key))
}

/// Every committed spell under [`spell_gap_key`], and whole (`yaulp ii`) — see the header. Its
/// redirect names are apart ([`spell_redirects`]).
/// Built once per process off the one effective catalog.
pub fn spell_keys() -> &'static HashSet<String> {
    static KEYS: OnceLock<HashSet<String>> = OnceLock::new();
    KEYS.get_or_init(|| {
        let whole = |n: &str| fold_quotes(&js_trim(n).to_lowercase());
        let db = eqlog::spelldb::shared();
        db.spells.iter().flat_map(|s| [spell_gap_key(&s.name), whole(&s.name)]).collect()
    })
}

/// Each spell's redirect names under [`loose_key`] of [`spell_gap_key`] → the spell's own name.
fn spell_redirects() -> &'static HashMap<String, String> {
    static KEYS: OnceLock<HashMap<String, String>> = OnceLock::new();
    KEYS.get_or_init(|| {
        let pairs = other_names_of(SPELLS_JSON);
        pairs.into_iter().map(|(other, spell)| (loose_key(&spell_gap_key(&other)), spell)).collect()
    })
}

/// The spell a cast name stands for when only a wiki redirect names it (`Enchant: Gold` for
/// `Enchant Gold`), and the redirect is more than a respelling: the cast is a row to check, since a
/// redirect can be wrong (owner, 2026-10-22). None for a name the catalog has as its own.
pub fn spell_via_redirect(name: &str) -> Option<String> {
    let key = spell_gap_key(name);
    if spell_keys().contains(&key) || spell_keys_loose().contains(&loose_key(&key)) {
        return None;
    }
    let spell = spell_redirects().get(&loose_key(&key))?;
    (!same_name(name, spell)).then(|| spell.clone())
}

/// Two names that differ only in case, a leading article, quotes, spaces, hyphens or other
/// punctuation (`a lizardman warrior`, `A lizard man warrior`): the same name, so a redirect between
/// them is a respelling, not a claim that one thing is another.
pub fn same_name(a: &str, b: &str) -> bool {
    let squeeze = |s: &str| {
        let lower = fold_quotes(&s.trim().to_lowercase());
        let bare = ["a ", "an ", "the ", "some "].iter().find_map(|p| lower.strip_prefix(p)).unwrap_or(&lower).to_string();
        bare.chars().filter(|c| c.is_alphanumeric()).collect::<String>()
    };
    squeeze(a) == squeeze(b)
}

/// The committed spell catalog, read here only for its rows' `otherNames`: the spell parser keeps
/// no field its output does not depend on.
const SPELLS_JSON: &str = include_str!("../../../../../src/main/data/spells.json");

/// Every `spells[].otherNames` entry of a spells.json text with its spell's name: the wiki redirects
/// that land on the spell's page (`Enchant: Gold` on `Enchant Gold`; owner, 2026-10-22: "no one told
/// you to restrict it to mobs only").
pub(crate) fn other_names_of(json: &str) -> Vec<(String, String)> {
    let Ok(Value::Object(mut file)) = serde_json::from_str::<Value>(json) else {
        return Vec::new();
    };
    let Some(Value::Array(rows)) = file.remove("spells") else {
        return Vec::new();
    };
    let pairs = rows.into_iter().filter_map(|mut s| {
        let name = s["name"].as_str()?.to_string();
        match s.get_mut("otherNames").map(Value::take) {
            Some(Value::Array(names)) => Some(names.into_iter().filter_map(move |n| n.as_str().map(|n| (n.to_string(), name.clone())))),
            _ => None,
        }
    });
    pairs.flatten().collect()
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

/// The item test the Gaps tab and the Event log share, so a KEEP mark agrees with the Items row:
/// the committed DB's keys under [`item_gap_key`], the same under [`loose_key`] (tried only when the
/// exact key misses), the loose keys of pages titled with an article without it (the loot line
/// strips its own: the game's `Skeletal Finger` is `A skeletal finger`), and a known scroll.
#[derive(Default)]
pub struct ItemIndex {
    exact: HashSet<String>,
    loose: HashSet<String>,
    bare: HashSet<String>,
    /// The wiki redirects that land on item pages, under [`loose_key`] → the page.
    redirects: HashMap<String, String>,
    /// Every key under [`loose_key`] → its page title: what a merchant page links (`{{:Cat's Eye Agate}}`).
    pages: HashMap<String, String>,
}

impl ItemIndex {
    pub fn new(item_pages: &[(String, String)]) -> Self {
        let exact: HashSet<String> = item_pages.iter().map(|(key, _)| item_gap_key(key)).collect();
        let loose: HashSet<String> = exact.iter().map(|k| loose_key(k)).collect();
        let bare = |k: &String| ["a ", "an ", "the "].iter().find_map(|a| k.strip_prefix(a)).map(str::to_string);
        let bare = loose.iter().filter_map(bare).collect();
        let pages = item_pages.iter().map(|(key, page)| (loose_key(&item_gap_key(key)), page.clone())).collect();
        Self { exact, loose, bare, redirects: HashMap::new(), pages }
    }

    /// The wiki redirects that land on item pages too (`GapIndex::item_redirects`): known names.
    #[must_use]
    pub fn with_redirects(mut self, redirects: &[(String, String)]) -> Self {
        self.redirects = redirects.iter().map(|(key, page)| (loose_key(&item_gap_key(key)), page.clone())).collect();
        self
    }

    /// The page title the data files the item under, its own or a redirect's; None for an unknown item.
    pub fn page(&self, name: &str) -> Option<&str> {
        let loose = loose_key(&item_gap_key(name));
        self.pages.get(&loose).or_else(|| self.redirects.get(&loose)).map(String::as_str)
    }

    /// Does the committed data know the item, under any of the keys above or a redirect's name?
    pub fn known(&self, name: &str) -> bool {
        self.own(name) || self.redirects.contains_key(&loose_key(&item_gap_key(name)))
    }

    fn own(&self, name: &str) -> bool {
        let key = item_gap_key(name);
        let loose = loose_key(&key);
        self.exact.contains(&key) || self.loose.contains(&loose) || self.bare.contains(&loose) || scroll_known(name)
    }

    /// The page a name reaches only through a wiki redirect that is more than a respelling: a row to
    /// check, since a redirect can be wrong (owner, 2026-10-22: Halfling Blood was sent to Vial of
    /// Halfling Blood, a different item). None for a name with a record of its own.
    pub fn via_redirect(&self, name: &str) -> Option<String> {
        if self.own(name) {
            return None;
        }
        let page = self.redirects.get(&loose_key(&item_gap_key(name)))?;
        (!same_name(&item_gap_key(name), page)).then(|| page.clone())
    }
}

#[cfg(test)]
mod redirect_tests {
    use super::{other_names_of, same_name, ItemIndex};

    #[test]
    fn a_spell_rows_other_names_are_read_and_a_row_without_them_adds_none() {
        let json = r#"{"spells":[{"name":"Enchant Gold","otherNames":["Enchant: Gold"]},{"name":"Clarity"},{"name":"Clarity II","otherNames":["Clarity 2","C2"]}]}"#;
        let owned = other_names_of(json);
        let pairs: Vec<(&str, &str)> = owned.iter().map(|(o, s)| (o.as_str(), s.as_str())).collect();
        assert_eq!(pairs, [("Enchant: Gold", "Enchant Gold"), ("Clarity 2", "Clarity II"), ("C2", "Clarity II")]);
        assert!(other_names_of("not json").is_empty());
    }

    #[test]
    fn a_name_known_only_through_a_redirect_says_where_the_redirect_sends_it() {
        // Owner, 2026-10-22: Halfling Blood was sent to Vial of Halfling Blood, a different item.
        let own = [("vial of halfling blood".to_string(), "Vial of Halfling Blood".to_string())];
        let redirects = [
            ("halfling blood".to_string(), "Vial of Halfling Blood".to_string()),
            ("vial of halfling blood".to_string(), "Rusty Mace".to_string()),
            ("a wooden heart".to_string(), "Wooden Heart".to_string()),
        ];
        let index = ItemIndex::new(&own).with_redirects(&redirects);
        assert!(index.known("Halfling Blood"));
        assert_eq!(index.via_redirect("Halfling Blood").as_deref(), Some("Vial of Halfling Blood"));
        // A name with a record of its own is never a check, whatever redirects it too.
        assert_eq!(index.via_redirect("Vial of Halfling Blood"), None);
        // A redirect that only drops an article is a respelling.
        assert!(index.known("A Wooden Heart"));
        assert_eq!(index.via_redirect("A Wooden Heart"), None);
        assert!(!index.known("Rat Ears"));
    }

    #[test]
    fn a_respelling_is_the_same_name() {
        assert!(same_name("a lizardman warrior", "A lizard man warrior"));
        assert!(same_name("A Sarnak berserker", "a sarnak Berserker"));
        assert!(same_name("Guard E`tru", "Guard E'tru"));
        assert!(!same_name("An ice giant magus", "An ice giant magi"));
        assert!(!same_name("Halfling Blood", "Vial of Halfling Blood"));
    }
}
