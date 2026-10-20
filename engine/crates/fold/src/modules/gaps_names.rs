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

use super::gaps_keys::{fold_quotes, loose_key};
use crate::knowledge::Knowledge;
use crate::modules::consider::mob_key;
use crate::modules::resist::world::is_player_shaped_name;
use std::collections::HashSet;

/// The catalog's names under [`mob_loose`].
#[derive(Default)]
pub struct MobNames {
    loose: HashSet<String>,
}

impl MobNames {
    pub fn new(names: &[String]) -> Self {
        Self {
            loose: names
                .iter()
                .flat_map(|n| n.split(" / "))
                .map(mob_loose)
                .collect(),
        }
    }

    /// Known as the catalog spells it, as the roster aliases it, loosely, or as a known mob's pet.
    pub fn known(&self, k: &dyn Knowledge, name: &str) -> bool {
        self.spelled(k, name) || (name.ends_with(" pet") && self.spelled(k, owner_of_pet(name)))
    }

    /// The event feed's two screenshot marks for a conned name: `(unknown, needs_image)`, the Gaps
    /// tab's Mobs and Images domains. Neither for a player's name or with no lookup installed, and
    /// never both: a mob the catalog lacks has no page to picture (owner, 2026-10-20).
    pub fn marks(&self, k: Option<&dyn Knowledge>, name: &str) -> (bool, bool) {
        let Some(k) = k.filter(|_| !is_player_shaped_name(name)) else {
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

/// The `Reward Chest`, and a player's mount or familiar (`Malkil`s Mount`, `Revilus`s familiar`).
pub fn no_mob(name: &str) -> bool {
    let n = fold_quotes(name);
    if n == "Reward Chest" {
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
