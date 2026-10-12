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

use super::gaps_details::Details;
use super::gaps_keys::{item_gap_key, spell_gap_key, spell_keys};
use crate::event::Event;
use crate::jsfn::item_base_name;
use crate::knowledge::Knowledge;
use crate::modules::consider::mob_key;
use crate::modules::resist::world::is_player_shaped_name;
use crate::EqModule;
use eqlog::names::strip_rank_tail;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

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
    /// Where, from whom, and the lines themselves — see [`super::gaps_details`].
    details: Details,
}

#[derive(Default)]
pub struct GapsModule {
    knowledge: Option<Arc<dyn Knowledge>>,
    /// Every committed item title under [`item_gap_key`] — `items.json`'s own key, quotes folded.
    items: HashSet<String>,
    rows: HashMap<(Domain, String), GapRow>,
    /// Every distinct key checked per domain, known or not: the denominator the tab prints.
    seen: HashMap<Domain, HashSet<String>>,
    /// Mob keys the log showed dying to a mob: players and pets, never rows again.
    players: HashSet<String>,
    /// The last `zone` event: the label a mention is filed under.
    zone: Option<String>,
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
            "zone" => {
                self.zone = ev.str("zone").map(str::to_string);
                false
            }
            "loot" | "itemReceived" | "purchase" | "itemMerge" => self.item_event(ev),
            "death" => self.death(ev),
            "consider" => match ev.str("mob") {
                Some(mob) if !is_player_shaped_name(mob) => self.mob(Some(mob), "considered", ev),
                _ => false,
            },
            "castBegin" | "otherCastBegin" => self.spell(ev),
            _ => false,
        }
    }

    /// The four events that name an item; a loot line names its corpse too.
    fn item_event(&mut self, ev: &Event) -> bool {
        match ev.kind() {
            // A destroy line is the parser's one loot shape that is a later disposal rather than
            // the loot itself: it says what became of the item, not where it came from.
            "loot" if ev.str("disposition") == Some("destroyed") => self.disposal(ev),
            "loot" => self.item(ev, "looted") | self.mob(ev.str("source"), "dropped-by", ev),
            "itemReceived" => {
                let how = if ev.str("via") == Some("fashioned") {
                    "crafted"
                } else {
                    "received"
                };
                self.item(ev, how)
            }
            "purchase" => self.item(ev, "bought"),
            _ => self.merge(ev),
        }
    }

    /// An item merge names what the merge made — and a spell-rank merge (`Odium IX`) makes a
    /// spell, not an item, so a name the spell catalog knows is no gap and is not even a name
    /// checked. Only a merge that is neither a known item nor a known spell is filed.
    fn merge(&mut self, ev: &Event) -> bool {
        let is_spell = ev
            .str("item")
            .is_some_and(|n| spell_keys().contains(&spell_gap_key(n)));
        !is_spell && self.item(ev, "crafted")
    }

    fn item(&mut self, ev: &Event, kind: &'static str) -> bool {
        let Some(name) = ev.str("item") else {
            return false;
        };
        let key = item_gap_key(name);
        let known = self.items.contains(&key);
        self.note(Domain::Item, key, &item_base_name(name), known, kind, ev)
    }

    /// A later disposal of an item already filed: its disposition and its line go on the row,
    /// and nothing else — not the zone (the item is not from here), not the count, not a kind.
    /// A name the log only ever destroyed has no row to carry it and is not filed.
    fn disposal(&mut self, ev: &Event) -> bool {
        let Some(name) = ev.str("item") else {
            return false;
        };
        let Some(row) = self.rows.get_mut(&(Domain::Item, item_gap_key(name))) else {
            return false;
        };
        row.details.disposal(ev);
        true
    }

    fn mob(&mut self, name: Option<&str>, kind: &'static str, ev: &Event) -> bool {
        let Some(name) = name else {
            return false;
        };
        let key = mob_key(name);
        if self.players.contains(&key) {
            return false;
        }
        let known = self.knowledge.as_ref().is_some_and(|k| k.known_mob(name));
        self.note(Domain::Mob, key, name, known, kind, ev)
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
        self.mob(Some(name), "killed", ev)
    }

    fn spell(&mut self, ev: &Event) -> bool {
        let Some(name) = ev.str("spell") else {
            return false;
        };
        let key = spell_gap_key(name);
        let known = spell_keys().contains(&key);
        let display = strip_rank_tail(name);
        self.note(Domain::Spell, key, display.trim(), known, "cast", ev)
    }

    /// One mention. Counted as seen either way; a row only when nothing committed knows the name.
    fn note(
        &mut self,
        domain: Domain,
        key: String,
        name: &str,
        known: bool,
        kind: &'static str,
        ev: &Event,
    ) -> bool {
        self.seen.entry(domain).or_default().insert(key.clone());
        if known {
            return false;
        }
        let at = stamp_of(ev.raw()).unwrap_or_default();
        let row = self.rows.entry((domain, key)).or_insert_with(|| GapRow {
            domain: domain.as_str(),
            name: name.to_string(),
            kinds: Vec::new(),
            count: 0,
            first: at.clone(),
            last: String::new(),
            details: Details::default(),
        });
        row.details.record(domain.as_str(), ev, self.zone.as_deref());
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
        self.items = k.item_names().iter().map(|n| item_gap_key(n)).collect();
        self.knowledge = Some(Arc::clone(k));
    }
}

#[cfg(test)]
#[path = "gaps_tests.rs"]
mod tests;
