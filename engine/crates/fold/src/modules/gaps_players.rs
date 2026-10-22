//! Who is a player, and which one-word names the player hailed or conned are NPCs (owner, 2026-10-19).
//!
//! The log spells a player, a pet and a named NPC alike (`Grapok`), so a one-word name hailed or
//! conned was never filed. Now it is, by two lists:
//!
//!   * KNOWN PLAYERS: a name that chats (tells, group, guild, a channel, out of character, shout,
//!     auction), joins the group, or shows in a `/who` row. A `says` is no evidence: NPCs say too.
//!   * CANDIDATES: a one-word name hailed or conned. It is filed unless it is a known player, and
//!     marked "may be a player" until the log shows an NPC: it answered the hail by `says` within
//!     ANSWER_MS, or it was hailed or conned again in the same zone at least REVISIT_MS later
//!     (players move; an NPC stands where it was). A name that later turns out to be a player
//!     withdraws its row.
//!   * BEYOND THE CAP: a con stating a level above any player's (`(Lvl: 70)` in a level-50 era) is
//!     an NPC at once, and stays one: no later line makes it a player (owner, 2026-10-19).

use std::collections::{HashMap, HashSet};

/// The hail and its answer are a few seconds apart.
const ANSWER_MS: i64 = 10_000;
/// Seen again in the same zone this much later: it stands there, so it is an NPC.
const REVISIT_MS: i64 = 10 * 60_000;
/// The highest level a player can reach in the era the server is in. Raised as expansions open
/// levels (Kunark 60, Velious 60, Luclin 60, ...); a con above it can only be an NPC.
pub const PLAYER_LEVEL_CAP: i64 = 50;

/// The clauses only a player's line opens with: `X tells you, '`, `X tells the guild, '`,
/// `X tells General:1, '`, `X says out of character, '`, `X shouts, '`, `X auctions, '`.
const CHAT_VERBS: [&str; 4] = [
    " says out of character, '",
    " shouts, '",
    " auctions, '",
    " tells ",
];

/// `X tells …` / `X shouts, '…` → X, for a one-word X; `You told X, '…` → X.
fn chatter(text: &str) -> Option<&str> {
    if let Some(rest) = text.strip_prefix("You told ") {
        return rest.split_once(", '").map(|(n, _)| n);
    }
    let at = CHAT_VERBS.iter().filter_map(|v| text.find(v)).min()?;
    let name = &text[..at];
    let one_word = !name.is_empty() && !name.contains(' ');
    (one_word && text.contains('\'')).then_some(name)
}

/// `X has joined the group.` and a `/who` row, `[50 Warrior] X (Ogre)` / `[ANONYMOUS] X`, which may
/// open `AFK ` or `* RIP * ` (eqlog who.rs).
fn joined_or_listed(text: &str) -> Option<&str> {
    if let Some(name) = text.strip_suffix(" has joined the group.") {
        return (!name.contains(' ')).then_some(name);
    }
    let row = text.trim_start();
    let row = row.strip_prefix("* RIP *").map_or(row, str::trim_start);
    let row = row.strip_prefix("AFK ").map_or(row, str::trim_start);
    let rest = row.strip_prefix('[')?.split_once("] ")?.1;
    let name = rest.split([' ', '<']).next()?;
    (!name.is_empty() && name.chars().all(char::is_alphabetic)).then_some(name)
}

/// `A fallen froglok says, 'I have no need for this...'` → `A fallen froglok`; never `You`. A
/// corpse's last words (`Basher Dreg's corpse says, 'Curse you!...'`) are the mob's own, so they name
/// `Basher Dreg` (owner, 2026-10-20: "corpses are now mobs?"); any other `X's ...` speaker (a pet, a
/// warder) is not a mob met.
pub fn speaker_of(text: &str) -> Option<&str> {
    let (name, _) = text.split_once(" says, '")?;
    let name = name.strip_suffix("'s corpse").unwrap_or(name);
    (name != "You" && !name.is_empty() && !name.contains("'s ")).then_some(name)
}

/// `You say, 'Hail, Grapok'` → `Grapok`.
pub fn hail_of(text: &str) -> Option<&str> {
    text.strip_prefix("You say, 'Hail, ")?.strip_suffix('\'')
}

/// `You have scrounged up a Tuft of Black Bear Fur.` → the item: a forage, which no parser family reads.
pub fn forage_of(text: &str) -> Option<&str> {
    let item = text.strip_prefix("You have scrounged up ")?.strip_suffix('.')?;
    let item = ["a ", "an "].iter().find_map(|a| item.strip_prefix(a)).unwrap_or(item);
    (!item.is_empty()).then_some(item)
}

#[derive(Default)]
pub struct Players {
    /// Lower-cased names a line showed to be players.
    known: HashSet<String>,
    /// A one-word name hailed, waiting for its answer.
    hailed: Option<(String, i64)>,
    /// Lower-cased candidate → where and when it was hailed or conned.
    sightings: HashMap<String, Vec<(String, i64)>>,
    /// Lower-cased candidates the log has shown to be NPCs.
    npcs: HashSet<String>,
    /// Lower-cased names conned above `PLAYER_LEVEL_CAP`: NPCs no chat line can undo.
    beyond_cap: HashSet<String>,
}

impl Players {
    pub fn clear(&mut self) {
        *self = Self::default();
    }

    pub fn is_player(&self, name: &str) -> bool {
        self.known.contains(&name.to_lowercase())
    }

    /// An unparsed line: a player's evidence (returns the name, so its row can be withdrawn), or
    /// an NPC answering the hail just before it (returns nothing; the name is marked an NPC).
    pub fn line(&mut self, text: &str, ts: i64) -> Option<String> {
        if let Some(name) = chatter(text).or_else(|| joined_or_listed(text)) {
            let key = name.to_lowercase();
            if self.beyond_cap.contains(&key) {
                return None;
            }
            self.npcs.remove(&key);
            return self.known.insert(key).then(|| name.to_string());
        }
        if let Some((name, at)) = self.hailed.take() {
            let answered = text
                .strip_prefix(name.as_str())
                .is_some_and(|r| r.starts_with(" says, '"));
            if answered && ts - at <= ANSWER_MS {
                self.npcs.insert(name.to_lowercase());
            } else if ts - at <= ANSWER_MS {
                self.hailed = Some((name, at));
            }
        }
        None
    }

    /// A one-word name hailed (`hail`) or conned: noted where and when. True when it may still be
    /// a player; false once the log has shown it to be an NPC.
    pub fn candidate(&mut self, name: &str, zone: Option<&str>, ts: i64, hail: bool) -> bool {
        let key = name.to_lowercase();
        if hail {
            self.hailed = Some((name.to_string(), ts));
        }
        let zone = zone.unwrap_or_default().to_string();
        let seen = self.sightings.entry(key.clone()).or_default();
        if seen
            .iter()
            .any(|(z, at)| *z == zone && ts - at >= REVISIT_MS)
        {
            self.npcs.insert(key.clone());
        }
        seen.push((zone, ts));
        !self.npcs.contains(&key)
    }

    /// A con's level: above the cap, the name is an NPC for good (true when it is).
    pub fn conned_at(&mut self, name: &str, level: Option<i64>) -> bool {
        if !level.is_some_and(|l| l > PLAYER_LEVEL_CAP) {
            return false;
        }
        let key = name.to_lowercase();
        self.known.remove(&key);
        self.npcs.insert(key.clone());
        self.beyond_cap.insert(key);
        true
    }

    /// Whether the log has shown this candidate to be an NPC.
    pub fn is_npc(&self, name: &str) -> bool {
        self.npcs.contains(&name.to_lowercase())
    }
}

#[cfg(test)]
mod tests {
    use super::{chatter, hail_of, joined_or_listed, Players};

    #[test]
    fn chat_joins_and_who_rows_name_players_and_a_say_does_not() {
        assert_eq!(chatter("Kamas tells you, 'hi'"), Some("Kamas"));
        assert_eq!(chatter("Foobar tells General:1, 'pets'"), Some("Foobar"));
        assert_eq!(chatter("Malkil tells the guild, 'hey'"), Some("Malkil"));
        assert_eq!(chatter("You told Kamas, 'yo'"), Some("Kamas"));
        assert_eq!(chatter("Grapok says, 'Hi Drywrought.'"), None);
        assert_eq!(chatter("A guard tells you, 'move along'"), None);
        assert_eq!(
            joined_or_listed("Xober has joined the group."),
            Some("Xober")
        );
        assert_eq!(
            joined_or_listed("[50 Warrior] Kasobn (Ogre) <Guild>"),
            Some("Kasobn")
        );
        assert_eq!(joined_or_listed("[ANONYMOUS] Squiz"), Some("Squiz"));
        assert_eq!(joined_or_listed("AFK [50 WAR/MNK/SHM] Drywrought (Iksar)  ZONE: Oggok (oggok)"), Some("Drywrought"));
        assert_eq!(joined_or_listed(" * RIP * [12 CLR] Kamas (Ogre)  ZONE: Oggok (oggok)"), Some("Kamas"));
        assert_eq!(hail_of("You say, 'Hail, Grapok'"), Some("Grapok"));
    }

    #[test]
    fn an_answer_or_a_second_visit_makes_an_npc_and_chat_makes_a_player() {
        let mut p = Players::default();
        assert!(
            p.candidate("Grapok", Some("Oggok"), 0, true),
            "a first hail may be a player"
        );
        p.line(
            "Grapok says, 'Hi Drywrought. Did [Bordag send you]?'",
            1_000,
        );
        assert!(p.is_npc("Grapok"));
        assert!(p.candidate("Rognok", Some("Oggok"), 0, false));
        assert!(
            !p.candidate("Rognok", Some("Oggok"), 11 * 60_000, false),
            "conned again where it stood"
        );
        assert!(p.candidate("Kamas", Some("Oggok"), 0, false));
        assert_eq!(
            p.line("Kamas tells you, 'that was me'", 5_000),
            Some("Kamas".to_string())
        );
        assert!(p.is_player("kamas"));
    }

    #[test]
    fn a_con_above_the_player_cap_is_an_npc_at_once_and_for_good() {
        let mut p = Players::default();
        // `Bordag regards you indifferently -- ... (Lvl: 70)`, the owner's line of 2026-10-18.
        assert!(p.conned_at("Bordag", Some(70)));
        assert!(!p.candidate("Bordag", Some("Oggok"), 0, false), "never may be a player");
        assert_eq!(p.line("Bordag tells you, 'hi'", 1_000), None, "no chat line undoes it");
        assert!(p.is_npc("Bordag") && !p.is_player("Bordag"));
        // At the cap or below, or with no level stated, a con proves nothing.
        assert!(!p.conned_at("Rognok", Some(50)));
        assert!(!p.conned_at("Rognok", None));
        assert!(p.candidate("Rognok", Some("Oggok"), 0, false));
    }
}
