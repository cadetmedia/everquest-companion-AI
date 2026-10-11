//! The details beside a gap row (owner ask, 2026-10-11): where the log named it, from whom, and
//! the lines the game actually printed. Apart from `gaps.rs` so that file stays under the ceiling.
//!
//! Every list is a tally of distinct values with counts, kept whole and SERVED capped: the eight
//! most frequent, with the number of distinct values beside them so a capped list still says how
//! much it left out. The samples are the last SAMPLES raw lines, as the bazaar keeps its quotes.
//!
//! What the events carry decides what is tallied. A loot line is always the player's own (there is
//! no "Soandso has looted" line), so who looted is not a list. A cast-begin line names the caster
//! and the spell and never a target.

use crate::event::Event;
use serde::ser::{Serialize, Serializer};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, VecDeque};

/// Entries served per list.
const LIST_CAP: usize = 8;
/// Raw lines kept per row, newest last.
const SAMPLES: usize = 3;

/// Distinct values with how often each was seen.
#[derive(Debug, Clone, Default)]
struct Tally(HashMap<String, u32>);

impl Tally {
    fn add(&mut self, value: &str) {
        let v = value.trim();
        if v.is_empty() {
            return;
        }
        *self.0.entry(v.to_string()).or_default() += 1;
    }

    /// `{ entries: [{ name, n }…], distinct }` — the LIST_CAP most frequent, ties by name; `None`
    /// when nothing was tallied, so the snapshot carries no empty lists.
    fn serve(&self) -> Option<Value> {
        if self.0.is_empty() {
            return None;
        }
        let mut all: Vec<(&String, &u32)> = self.0.iter().collect();
        all.sort_by(|a, b| b.1.cmp(a.1).then_with(|| a.0.cmp(b.0)));
        let entries: Vec<Value> = all
            .iter()
            .take(LIST_CAP)
            .map(|(name, n)| json!({ "name": name, "n": n }))
            .collect();
        Some(json!({ "entries": entries, "distinct": self.0.len() }))
    }
}

#[derive(Debug, Clone, Default)]
pub struct Details {
    /// The zone the fold was in when the line was read.
    zones: Tally,
    /// An item: the corpse it was looted from, or the merchant it was bought from.
    sources: Tally,
    /// An item: how the loot line disposed of it (`depot`, `sold`, `hoard`, `combined`, `currency`).
    dispositions: Tally,
    /// A mob: the items it was seen to drop — the `sources` edge from the other side.
    drops: Tally,
    /// A mob: what the /con said, `L50 indifferent`.
    cons: Tally,
    /// A mob: what killed it; `you` when the line was "You have slain", `nobody` for "died.".
    killers: Tally,
    /// A spell: who cast it, player-shaped names kept as they are; `you` for the player's own.
    casters: Tally,
    samples: VecDeque<String>,
}

impl Details {
    /// One mention of the row's name on `ev`, read for the row's domain.
    pub fn record(&mut self, domain: &str, ev: &Event, zone: Option<&str>) {
        if let Some(z) = zone {
            self.zones.add(z);
        }
        match (domain, ev.kind()) {
            ("item", "loot") => {
                self.sources.add(ev.str("source").unwrap_or_default());
                self.dispositions.add(ev.str("disposition").unwrap_or_default());
            }
            ("item", "purchase") => self.sources.add(ev.str("npc").unwrap_or_default()),
            ("mob", "loot") => self.drops.add(ev.str("item").unwrap_or_default()),
            ("mob", "consider") => {
                let level = ev.int("level").unwrap_or_default();
                let faction = ev.str("faction").unwrap_or_default();
                self.cons.add(&format!("L{level} {faction}"));
            }
            ("mob", "death") => {
                let killer = if ev.bool("bySelf") {
                    "you"
                } else {
                    ev.str("killer").unwrap_or("nobody")
                };
                self.killers.add(killer);
            }
            ("spell", "castBegin") => self.casters.add("you"),
            ("spell", "otherCastBegin") => self.casters.add(ev.str("caster").unwrap_or_default()),
            _ => {}
        }
        if self.samples.len() == SAMPLES {
            self.samples.pop_front();
        }
        self.samples.push_back(ev.raw().to_string());
    }
}

/// Only the lists that have something in them, then the samples.
impl Serialize for Details {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let mut out = Map::new();
        let lists = [
            ("zones", &self.zones),
            ("sources", &self.sources),
            ("dispositions", &self.dispositions),
            ("drops", &self.drops),
            ("cons", &self.cons),
            ("killers", &self.killers),
            ("casters", &self.casters),
        ];
        for (name, tally) in lists {
            if let Some(v) = tally.serve() {
                out.insert(name.to_string(), v);
            }
        }
        out.insert("samples".to_string(), json!(self.samples));
        Value::Object(out).serialize(s)
    }
}
