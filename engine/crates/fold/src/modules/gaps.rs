//! The gaps: names the log mentions that the committed wiki data has no record of (owner ask,
//! 2026-10-11) — items looted, received, bought or crafted; mobs looted, killed or considered;
//! spells cast — one row per name, so the scrape or the wiki can be fixed.
//!
//! NOTHING HERE ASKS THE APP TO FETCH. Every check reads a committed table — the item titles the
//! knowledge hands over at install, `known_mob`, the spell catalog — and none of those notes a
//! miss. Nothing is checked until the knowledge is installed, so the parity construction, which
//! installs none, publishes empty rows and the goldens cannot see this module.
//!
//! WHO IS A PLAYER. The log spells players and pets exactly like named mobs: one capitalized word.
//! The rule, measured on the owner's log (2026-10-11; 3194 deaths, 279 cons, 3419 loots):
//!
//!   * a loot source is a corpse the player looted, so it is a mob whatever its shape — the eleven
//!     single-word sources were all named mobs (Terror, Gorgalosk, Bazzzazzt…);
//!   * a death's name is a mob when it is mob-shaped (an article, or more than one word), and a
//!     player-shaped name counts only when its killer is absent or player-shaped too (you, a
//!     player, a pet). Of the 26 single-word names that died, the 15 that pass were named mobs bar
//!     one pet; the 11 that died to a mob were the group's own characters and their pets. A name
//!     that dies to a mob is filed as a player for the rest of the fold and its row withdrawn;
//!   * a /con's name is a mob only when mob-shaped: of 21 single-word names conned, 18 were the
//!     group's characters and pets (the same name at a dozen rising levels), and a named mob that
//!     is only ever conned is the gap this leaves.

use crate::event::Event;
use crate::jsfn::{item_base_name, item_tier_key};
use crate::knowledge::Knowledge;
use crate::modules::consider::mob_key;
use crate::modules::resist::world::is_player_shaped_name;
use crate::EqModule;
use eqlog::names::{spell_canon_key, strip_rank_tail};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, OnceLock};

/// Rows served per domain; the rest are counted in `totals` and nowhere else.
const CAP_PER_DOMAIN: usize = 500;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Domain {
    Item,
    Mob,
    Spell,
}

impl Domain {
    const ALL: [Domain; 3] = [Domain::Item, Domain::Mob, Domain::Spell];

    fn as_str(self) -> &'static str {
        match self {
            Domain::Item => "item",
            Domain::Mob => "mob",
            Domain::Spell => "spell",
        }
    }
}

/// One name nothing committed knows, with every way the log named it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GapRow {
    domain: &'static str,
    /// As the log spelled it; for a spell, with the rank stripped.
    name: String,
    /// `looted`, `dropped-by`, `received`, `bought`, `crafted`, `killed`, `considered`, `cast` — in
    /// the order first seen.
    kinds: Vec<&'static str>,
    count: u32,
    /// The log's own stamp, `2026-09-23 17:54:48`.
    first: String,
    last: String,
}

#[derive(Default)]
pub struct GapsModule {
    knowledge: Option<Arc<dyn Knowledge>>,
    /// Every committed item title, as `item_tier_key` spells it — the same fold as `items.json`'s keys.
    items: HashSet<String>,
    rows: HashMap<(Domain, String), GapRow>,
    /// Every distinct key checked per domain, known or not: the denominator the tab prints.
    seen: HashMap<Domain, HashSet<String>>,
    /// Mob keys the log showed dying to a mob: players and pets, never rows again.
    players: HashSet<String>,
    seq: i64,
    announce: crate::announce::Announce,
}

impl GapsModule {
    pub fn new() -> Self {
        Self::default()
    }

    fn clear(&mut self) {
        self.rows.clear();
        self.seen.clear();
        self.players.clear();
    }

    fn fold(&mut self, ev: &Event) -> bool {
        match ev.kind() {
            "loot" => self.item(ev, "looted") | self.mob(ev.str("source"), "dropped-by", ev.raw()),
            "itemReceived" => {
                let how = if ev.str("via") == Some("fashioned") {
                    "crafted"
                } else {
                    "received"
                };
                self.item(ev, how)
            }
            "purchase" => self.item(ev, "bought"),
            "itemMerge" => self.item(ev, "crafted"),
            "death" => self.death(ev),
            "consider" => match ev.str("mob") {
                Some(mob) if !is_player_shaped_name(mob) => self.mob(Some(mob), "considered", ev.raw()),
                _ => false,
            },
            "castBegin" | "otherCastBegin" => self.spell(ev),
            _ => false,
        }
    }

    fn item(&mut self, ev: &Event, kind: &'static str) -> bool {
        let Some(name) = ev.str("item") else {
            return false;
        };
        let key = item_tier_key(name);
        let known = self.items.contains(&key);
        self.note(Domain::Item, key, &item_base_name(name), known, kind, ev.raw())
    }

    fn mob(&mut self, name: Option<&str>, kind: &'static str, raw: &str) -> bool {
        let Some(name) = name else {
            return false;
        };
        let key = mob_key(name);
        if self.players.contains(&key) {
            return false;
        }
        let known = self.knowledge.as_ref().is_some_and(|k| k.known_mob(name));
        self.note(Domain::Mob, key, name, known, kind, raw)
    }

    /// The death rule from the module header: a player-shaped name that dies to a mob is a player
    /// (or a pet), filed as one, and its row — if a kill or a /con filed one earlier — withdrawn.
    fn death(&mut self, ev: &Event) -> bool {
        let Some(name) = ev.str("name") else {
            return false;
        };
        let killer_is_mob = ev.str("killer").is_some_and(|k| !is_player_shaped_name(k));
        if is_player_shaped_name(name) && killer_is_mob {
            let key = mob_key(name);
            self.players.insert(key.clone());
            return self.rows.remove(&(Domain::Mob, key)).is_some();
        }
        self.mob(Some(name), "killed", ev.raw())
    }

    fn spell(&mut self, ev: &Event) -> bool {
        let Some(name) = ev.str("spell") else {
            return false;
        };
        let key = spell_canon_key(name);
        let known = spell_keys().contains(&key);
        let display = strip_rank_tail(name);
        self.note(Domain::Spell, key, display.trim(), known, "cast", ev.raw())
    }

    /// One mention. Counted as seen either way; a row only when nothing committed knows the name.
    fn note(
        &mut self,
        domain: Domain,
        key: String,
        name: &str,
        known: bool,
        kind: &'static str,
        raw: &str,
    ) -> bool {
        self.seen.entry(domain).or_default().insert(key.clone());
        if known {
            return false;
        }
        let at = stamp_of(raw).unwrap_or_default();
        let row = self.rows.entry((domain, key)).or_insert_with(|| GapRow {
            domain: domain.as_str(),
            name: name.to_string(),
            kinds: Vec::new(),
            count: 0,
            first: at.clone(),
            last: String::new(),
        });
        row.count += 1;
        row.last = at;
        if !row.kinds.contains(&kind) {
            row.kinds.push(kind);
        }
        // A consider line sentence-cases the article ("A gorgon"); the loot line's lowercase
        // spelling is the mob's own, so it wins once seen.
        let lower_initial = |s: &str| s.starts_with(|c: char| c.is_ascii_lowercase());
        if domain == Domain::Mob && lower_initial(name) && !lower_initial(&row.name) {
            row.name = name.to_string();
        }
        true
    }

    /// The domain's rows, most mentioned first, then by name; the first CAP_PER_DOMAIN of them.
    fn served(&self, domain: Domain) -> Vec<&GapRow> {
        let mut rows: Vec<&GapRow> = self
            .rows
            .iter()
            .filter(|((d, _), _)| *d == domain)
            .map(|(_, r)| r)
            .collect();
        rows.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.name.cmp(&b.name)));
        rows.truncate(CAP_PER_DOMAIN);
        rows
    }
}

/// Every committed spell, keyed as the buffs module keys a cast: rank stripped, lowercased. Built
/// once per process off the one effective catalog.
fn spell_keys() -> &'static HashSet<String> {
    static KEYS: OnceLock<HashSet<String>> = OnceLock::new();
    KEYS.get_or_init(|| {
        eqlog::spelldb::shared()
            .spells
            .iter()
            .map(|s| spell_canon_key(&s.name))
            .collect()
    })
}

/// `[Wed Sep 23 17:54:48 2026] …` → `2026-09-23 17:54:48`: the log's own clock, as the bazaar
/// module prints it.
fn stamp_of(raw: &str) -> Option<String> {
    const MONTHS: [&str; 12] = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    let stamp = raw.strip_prefix('[')?.split(']').next()?;
    let parts: Vec<&str> = stamp.split_whitespace().collect();
    let [_, month, day, time, year] = parts.as_slice() else {
        return None;
    };
    let m = MONTHS.iter().position(|x| x == month)? + 1;
    let d: u32 = day.parse().ok()?;
    Some(format!("{year}-{m:02}-{d:02} {time}"))
}

impl EqModule for GapsModule {
    fn id(&self) -> &'static str {
        "gaps"
    }

    fn reset(&mut self) {
        self.clear();
        self.seq = 0;
        self.announce.reset();
    }

    fn on_event(&mut self, ev: &Event, _live: bool) {
        self.seq = ev.seq();
        if ev.kind() == "epoch" {
            self.clear();
            self.announce.changed(self.seq);
            return;
        }
        if self.knowledge.is_some() && self.fold(ev) {
            self.announce.changed(self.seq);
        }
    }

    /// Moves when a row is filed, grows or is withdrawn. See [`crate::announce`].
    fn published_seq(&self) -> Option<i64> {
        Some(self.announce.cursor())
    }

    fn snapshot(&self) -> Value {
        let mut rows: Vec<&GapRow> = Vec::new();
        let mut totals = serde_json::Map::new();
        let mut seen = serde_json::Map::new();
        for d in Domain::ALL {
            rows.extend(self.served(d));
            let gaps = self.rows.keys().filter(|(k, _)| *k == d).count();
            totals.insert(d.as_str().to_string(), json!(gaps));
            let checked = self.seen.get(&d).map_or(0, HashSet::len);
            seen.insert(d.as_str().to_string(), json!(checked));
        }
        json!({ "seq": self.seq, "state": { "rows": rows, "totals": totals, "seen": seen } })
    }

    fn install_knowledge(&mut self, k: &Arc<dyn Knowledge>) {
        self.items = k.item_names().iter().map(|n| item_tier_key(n)).collect();
        self.knowledge = Some(Arc::clone(k));
    }
}

#[cfg(test)]
#[path = "gaps_tests.rs"]
mod tests;
