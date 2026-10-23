//! NPC roles from the client's target line (owner, 2026-10-22): `Targeted (Merchant): Klok Koglin`,
//! `Targeted (Banker): Neuven F`Lok`, `Targeted (Warrior GM): Horgus`, `Targeted (Player): Malkil`.
//! Measured on the owner's log (2026-10-22): Player 309, Corpse 159, Merchant 118, Banker 18,
//! `<Class> GM` 12. A banker's greeting, `Neuven F`Lok told you, 'Welcome to my bank!'`, names one
//! too.
//!
//! A Player target is a player for good: never a mob row, and any row it had is withdrawn. A
//! merchant, banker or guildmaster is an NPC for good (never "may be a player"); its Mobs row serves
//! the role, which Copy wiki page writes as the page's class (`| class = [[Banker]]`, the merchant
//! layout for a merchant). A target alone files no row: the role waits for the row a hail, a con or
//! a kill files. A corpse target says nothing.
//!
//! A child of `gaps.rs`, apart so that file keeps its size.

use super::{Domain, GapsModule};
use crate::modules::consider::mob_key;
use std::collections::HashMap;

/// What a target line or a bank greeting says of a name.
#[derive(Debug, PartialEq)]
pub enum Target<'a> {
    Player(&'a str),
    Npc { role: &'a str, name: &'a str },
}

/// The roles a target line names an NPC by: the merchant, the banker, a class's guildmaster.
fn npc_role(role: &str) -> bool {
    role == "Merchant" || role == "Banker" || role.ends_with(" GM")
}

/// `Targeted (Banker): Neuven F`Lok` → the banker; `... told you, 'Welcome to my bank!'` → a banker.
pub fn target_of(text: &str) -> Option<Target<'_>> {
    if let Some(name) = text.strip_suffix(" told you, 'Welcome to my bank!'") {
        return (!name.is_empty()).then_some(Target::Npc { role: "Banker", name });
    }
    let (role, name) = text.strip_prefix("Targeted (")?.split_once("): ")?;
    let name = name.trim();
    if name.is_empty() {
        return None;
    }
    match role {
        "Player" => Some(Target::Player(name)),
        r if npc_role(r) => Some(Target::Npc { role: r, name }),
        _ => None,
    }
}

/// Each NPC's role by its mob key, the last a line named.
#[derive(Default)]
pub struct Roles {
    by_key: HashMap<String, String>,
}

impl Roles {
    pub fn clear(&mut self) {
        self.by_key.clear();
    }

    /// True when the name's role changed.
    fn set(&mut self, name: &str, role: &str) -> bool {
        let old = self.by_key.insert(mob_key(name), role.to_string());
        old.as_deref() != Some(role)
    }

    pub fn of(&self, key: &str) -> Option<&str> {
        self.by_key.get(key).map(String::as_str)
    }
}

impl GapsModule {
    /// A target line or a bank greeting: a player withdrawn, or an NPC's role noted. True: rows moved.
    pub(super) fn targeted(&mut self, t: &Target<'_>) -> bool {
        match *t {
            Target::Player(name) => {
                let key = mob_key(name);
                self.who.player(name);
                self.players.insert(key.clone());
                let mob = self.rows.remove(&(Domain::Mob, key.clone())).is_some();
                self.rows.remove(&(Domain::Merchant, key)).is_some() | mob
            }
            Target::Npc { role, name } => {
                self.who.npc(name);
                self.players.remove(&mob_key(name));
                self.roles.set(name, role)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{target_of, Roles, Target};

    /// The owner's lines, 2026-10-22.
    #[test]
    fn a_target_line_names_a_player_or_an_npc_role_and_a_corpse_nothing() {
        assert_eq!(target_of("Targeted (Player): Malkil"), Some(Target::Player("Malkil")));
        assert_eq!(
            target_of("Targeted (Banker): Neuven F`Lok"),
            Some(Target::Npc { role: "Banker", name: "Neuven F`Lok" })
        );
        assert_eq!(
            target_of("Targeted (Merchant): The Great Zultor"),
            Some(Target::Npc { role: "Merchant", name: "The Great Zultor" })
        );
        assert_eq!(
            target_of("Targeted (Warrior GM): Horgus"),
            Some(Target::Npc { role: "Warrior GM", name: "Horgus" })
        );
        assert_eq!(
            target_of("Neuven F`Lok told you, 'Welcome to my bank!'"),
            Some(Target::Npc { role: "Banker", name: "Neuven F`Lok" })
        );
        assert_eq!(target_of("Targeted (Corpse): Cazic-Thule's corpse"), None);
        assert_eq!(target_of("Neuven F`Lok told you, 'Come back soon!'"), None);
        let mut r = Roles::default();
        assert!(r.set("Neuven F`Lok", "Banker"));
        assert!(!r.set("Neuven F`Lok", "Banker"), "the same role again changes nothing");
        assert_eq!(r.of("neuven f'lok"), Some("Banker"));
    }
}
