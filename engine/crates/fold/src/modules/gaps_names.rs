//! Mobs the catalog knows under the wiki's spelling, and names that are no mob at all (owner ask,
//! 2026-10-17: a mob whose pages are split by disambiguation is not unknown).
//!
//!   * THE WIKI'S SPELLING. `known_mob` keys the catalog by its `|name` and page title as they
//!     stand, so a name the wiki writes with a disambiguation (`Cazic-Thule (God)`,
//!     `a kobold (Warrens)`, `Orc Legionnaire (Crushbone)`), without its article
//!     (`fire giant warrior`), with other punctuation (`Cazic Thule`, `Guard Kroon`) or as two
//!     spellings in one field (`a greater kobold / greater kobold`) misses. The loose fold here
//!     drops a trailing `(…)` and a leading article and reads punctuation as spaces, on both
//!     sides; the raid roster's stated aliases (`Innoruuk, the Prince of Hate`) are read too.
//!   * A MOB'S PET, `<mob> pet` (`a shadowknight pet`, `Lady Vox pet`): the wiki pages the mob,
//!     never its pet, so the name is known when the mob is, and an unknown mob's pet is filed
//!     under the mob ([`owner_of_pet`]).
//!   * NO MOB: the `Reward Chest` a raid's loot is taken from.
//!   * A PLAYER'S: a pet that spoke as a pet or named its leader (`Zonarer says, 'As you wish, oh
//!     great one.'`) is filed as a player by the module; a mount or familiar a single-word name
//!     owns (`Malkil`s Mount`, `Revilus`s familiar`) is no mob here.

use super::gaps_keys::{fold_quotes, loose_key, same_name};
use crate::knowledge::Knowledge;
use crate::modules::consider::mob_key;
use crate::modules::resist::world::is_player_shaped_name;
use std::collections::{HashMap, HashSet};

/// The catalog's names under [`mob_loose`].
#[derive(Default)]
pub struct MobNames {
    loose: HashSet<String>,
    /// The wiki redirects that land on mob pages, under [`mob_loose`] → the page.
    redirects: HashMap<String, String>,
    /// Those pages under [`mob_loose`]: a page's own title is its own name.
    pages: HashSet<String>,
}

impl MobNames {
    pub fn new(names: &[String]) -> Self {
        Self {
            loose: names
                .iter()
                .flat_map(|n| n.split(" / "))
                .map(mob_loose)
                .collect(),
            ..Self::default()
        }
    }

    /// The wiki redirects that land on mob pages too (`GapIndex::mob_redirects`): known names.
    #[must_use]
    pub fn with_redirects(mut self, redirects: &[(String, String)]) -> Self {
        self.redirects = redirects.iter().map(|(n, page)| (mob_loose(n), page.clone())).collect();
        self.pages = redirects.iter().map(|(_, page)| mob_loose(page)).collect();
        self
    }

    /// The page a mob name reaches only through a wiki redirect that is more than a respelling
    /// (`Hoptor Thaggelum` → `The Ghoul Lord`): a row to check, since a redirect can be wrong (owner,
    /// 2026-10-22). None for a name the catalog or the raid roster has as its own.
    pub fn via_redirect(&self, k: &dyn Knowledge, name: &str) -> Option<String> {
        let own = |n: &str| self.loose.contains(&mob_loose(n)) || self.pages.contains(&mob_loose(n));
        if own(name) || k.identity_keys(name).iter().any(|key| own(key)) {
            return None;
        }
        let page = self.redirects.get(&mob_loose(name))?;
        (!same_name(name, page)).then(|| page.clone())
    }

    /// Known as the catalog spells it, as the roster aliases it, loosely, or as a known mob's pet.
    pub fn known(&self, k: &dyn Knowledge, name: &str) -> bool {
        let redirected = |n: &str| self.redirects.contains_key(&mob_loose(n));
        self.spelled(k, name) || redirected(name) || (name.ends_with(" pet") && self.spelled(k, owner_of_pet(name)))
    }

    /// The event feed's two screenshot marks for a conned name: `(unknown, needs_image)`, the Gaps
    /// tab's Mobs and Images domains. Neither for a player's name or with no lookup installed, and
    /// never both: a mob the catalog lacks has no page to picture (owner, 2026-10-20).
    pub fn marks(&self, k: Option<&dyn Knowledge>, name: &str) -> (bool, bool) {
        // Nor is a player's mount, familiar, warder or summoned pet, the test gaps.rs asks before
        // filing (owner, 2026-10-22: "Malkil`s Mount ... missing · screenshot it", a group mate's).
        let Some(k) = k.filter(|_| !is_player_shaped_name(name) && !no_mob(name)) else {
            return (false, false);
        };
        let unknown = !self.known(k, name);
        (unknown, !unknown && k.imageless_mob(name))
    }

    fn spelled(&self, k: &dyn Knowledge, name: &str) -> bool {
        k.known_mob(name)
            || k.identity_keys(name).iter().any(|key| k.known_mob(key))
            || self.loose.contains(&mob_loose(name))
    }
}

/// `Cazic-Thule (God)` → `cazic thule`, `a fire giant warrior` → `fire giant warrior`.
fn mob_loose(name: &str) -> String {
    // The game stars some guards (`*Guard Willia`); no wiki title carries the star.
    let key = mob_key(name.trim_start_matches('*'));
    let bare = match key.rfind(" (") {
        Some(i) if key.ends_with(')') => &key[..i],
        _ => key.as_str(),
    };
    let loose = loose_key(bare);
    ["a ", "an ", "the "]
        .iter()
        .find_map(|a| loose.strip_prefix(a))
        .unwrap_or(&loose)
        .to_string()
}

/// `a necro initiate pet` → `a necro initiate`: the name an unknown mob's pet is filed under.
pub fn owner_of_pet(name: &str) -> &str {
    name.strip_suffix(" pet").unwrap_or(name)
}

/// The game's ability switch (`<player> begins casting Disable Ability.`): no spell, no page.
pub fn no_spell(name: &str) -> bool {
    matches!(name.trim(), "Use Ability" | "Enable Ability" | "Disable Ability")
}

/// The `Reward Chest` a Dungeon Crawl pays out of: no mob, and what it pays is no mob's drop, since
/// it pays any item of any mob the crawl killed (owner, 2026-10-21).
pub fn is_reward_chest(name: &str) -> bool {
    name.trim().eq_ignore_ascii_case("Reward Chest")
}

/// The `Reward Chest`, a player's mount or familiar (`Malkil`s Mount`, `Revilus`s familiar`), and
/// a summoned pet by its generated name (`Genekn`, `Zobektik`: see [`is_pet_name`]).
pub fn no_mob(name: &str) -> bool {
    let n = fold_quotes(name);
    if is_reward_chest(&n) || is_pet_name(&n) {
        return true;
    }
    let Some((owner, what)) = n.split_once("'s ") else {
        return false;
    };
    matches!(
        what.to_lowercase().as_str(),
        "mount" | "familiar" | "warder"
    ) && is_player_shaped_name(owner)
}

/// A summoned pet's generated name (owner, 2026-10-20: the Plane of Sky gaps "are mostly all
/// pets"). EverQuest builds one from four parts: a first letter (G J K L V X Z), up to two middle
/// syllables, and an ending (`er`, `ab`, `n`, `tik`): `Genekn` is G+en+ek+n, `Zobektik` Z+ob+ek+tik,
/// `Kaser` K+as+er. At least one middle syllable, so a bare `Gn` or `Ker` is not taken for one.
/// A pet has no wiki page, so a name of this shape is never a gap.
pub fn is_pet_name(name: &str) -> bool {
    const FIRST: [char; 7] = ['G', 'J', 'K', 'L', 'V', 'X', 'Z'];
    const SECOND: [&str; 9] = ["", "ab", "ar", "as", "eb", "en", "ib", "ob", "on"];
    const THIRD: [&str; 5] = ["", "an", "ar", "ek", "ob"];
    const LAST: [&str; 4] = ["er", "ab", "n", "tik"];
    let mut chars = name.chars();
    let Some(first) = chars.next().filter(|c| FIRST.contains(c)) else {
        return false;
    };
    let rest = &name[first.len_utf8()..];
    SECOND.iter().any(|b| {
        rest.strip_prefix(b).is_some_and(|r| {
            THIRD.iter().any(|c| {
                (!b.is_empty() || !c.is_empty())
                    && r.strip_prefix(c).is_some_and(|r| LAST.contains(&r))
            })
        })
    })
}

#[cfg(test)]
mod pet_tests {
    use super::{is_pet_name, no_mob};

    #[test]
    fn generated_pet_names_are_not_mobs() {
        for pet in ["Genekn", "Xasarn", "Genab", "Kaser", "Vabekn", "Zasann", "Zobektik", "Jonobtik"] {
            assert!(is_pet_name(pet), "{pet} is a pet name");
            assert!(no_mob(pet), "{pet} is never a gap");
        }
    }

    #[test]
    fn other_names_are_left_alone() {
        for other in ["Lowejak", "Toejam", "Gn", "Ker", "Gabber", "a gnoll", "Genekns", "genekn", "Hoptor", "Lord Nagafen"] {
            assert!(!is_pet_name(other), "{other} is not a pet name");
        }
    }
}
