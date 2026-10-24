//! Quest chains rebuilt from the log for quests no task line names (owner, 2026-10-23: "would be nice if
//! the thing could tie the steps together automatically? like i hail someone, then i say the keyword,
//! then i go kill something or do something, and get an item, turn it in, etc"). The EverQuest Legends
//! Tutorial's errands print no task line at all; what ties their steps is in the lines themselves.
//!
//!   * RECORDED here: the talk side (hails, says, NPC lines, offers, trade ends, cancels and refusals,
//!     purchases, items given, experience, faction and achievement lines, task lines) in one ring, and
//!     kills and loots in another; both capped, so a whole log stays small.
//!   * BUILT at serve time (`gaps_threads_graph.rs`): nodes, the edges the log gives evidence for, one
//!     graph per errand, and a topological order (owner: "when it is [in order] it should be VERY EASY
//!     to identify A comes before B to C etc, a graph of nodes").
//!
//! A child of `gaps_quest_log.rs`, which reads the lines and hands them here.

use super::super::quests::{task_of, trade_cancelled};
use crate::event::Event;
use crate::modules::gaps_details::stamp_of;
use crate::modules::gaps_players::hail_of;
use crate::modules::gaps_trade::faction_of;
use serde_json::Value;
use std::collections::VecDeque;
use std::sync::Mutex;

/// The talk-side events kept: the tutorial is ~300, a busy evening a few thousand.
const TALK_CAP: usize = 4000;
/// Kills and loots kept: a hunt prints far more of them than of talk.
const FIGHT_CAP: usize = 8000;

/// One talk-side event, as the graph reads it. `at` is the log's own stamp.
#[derive(Debug, Clone)]
pub enum Raw {
    Hail { npc: String, ts: i64, at: String, zone: Option<String> },
    Say { text: String, ts: i64, at: String },
    Npc { npc: String, text: String, ts: i64, at: String },
    Offer { npc: String, item: String },
    Refused { npc: String },
    Cancel,
    TradeDone { npc: String, ts: i64, at: String, zone: Option<String> },
    Buy { npc: String, item: String, ts: i64, at: String },
    Given { item: String, ts: i64 },
    Xp { ts: i64 },
    Faction { faction: String, line: String, ts: i64 },
    Achieve { name: String, ts: i64 },
    Task { ts: i64 },
}

/// A kill or a loot, for the item flow (a skull looted, then handed in).
#[derive(Debug, Clone)]
pub enum Fight {
    Kill { mob: String, ts: i64, at: String, zone: Option<String> },
    Loot { item: String, mob: String, ts: i64, at: String },
}

#[derive(Default)]
pub struct Threads {
    talk: VecDeque<Raw>,
    fight: VecDeque<Fight>,
    /// The newest line's stamp, for the typed events that carry none of their own.
    last_at: String,
    zone: Option<String>,
    /// Bumped on every change: the served chains are rebuilt only when it moved.
    version: u64,
    cache: Mutex<Option<(u64, Value)>>,
}

impl Threads {
    /// The stamp and zone of the line being read.
    pub fn at(&mut self, at: &str, zone: Option<&str>) {
        at.clone_into(&mut self.last_at);
        self.zone = zone.map(str::to_string);
    }

    fn push(&mut self, r: Raw) {
        if self.talk.len() >= TALK_CAP {
            self.talk.pop_front();
        }
        self.talk.push_back(r);
        self.version += 1;
    }

    fn push_fight(&mut self, f: Fight) {
        if self.fight.len() >= FIGHT_CAP {
            self.fight.pop_front();
        }
        self.fight.push_back(f);
        self.version += 1;
    }

    /// An unparsed line the chains read on their own: a task line, the player's hail or say, a trade
    /// called off, a faction or achievement line. NPC lines come through `npc`, after the quest log's
    /// test of who is an NPC.
    pub fn line(&mut self, text: &str, ts: i64, at: &str, zone: Option<&str>) {
        self.at(at, zone);
        if task_of(text).is_some() {
            self.task(ts);
        } else if let Some(s) = text.strip_prefix("You say, '").and_then(|r| r.strip_suffix('\'')) {
            match hail_of(text) {
                Some(npc) => self.hail(npc, ts),
                None => self.say(s, ts),
            }
        } else if trade_cancelled(text) {
            self.cancel();
        } else if let Some((faction, _, _)) = faction_of(text) {
            self.faction(faction, text, ts);
        } else if let Some(a) = text.strip_prefix("You have completed achievement: ") {
            self.achievement(a, ts);
        }
    }

    pub fn hail(&mut self, npc: &str, ts: i64) {
        let (at, zone) = (self.last_at.clone(), self.zone.clone());
        self.push(Raw::Hail { npc: npc.to_string(), ts, at, zone });
    }

    pub fn say(&mut self, text: &str, ts: i64) {
        let at = self.last_at.clone();
        self.push(Raw::Say { text: text.to_string(), ts, at });
    }

    pub fn npc(&mut self, npc: &str, text: &str, ts: i64) {
        let at = self.last_at.clone();
        self.push(Raw::Npc { npc: npc.to_string(), text: text.to_string(), ts, at });
    }

    pub fn offer(&mut self, npc: &str, item: &str) {
        self.push(Raw::Offer { npc: npc.to_string(), item: item.to_string() });
    }

    pub fn refused(&mut self, npc: &str) {
        self.push(Raw::Refused { npc: npc.to_string() });
    }

    pub fn cancel(&mut self) {
        self.push(Raw::Cancel);
    }

    pub fn trade_done(&mut self, npc: &str, ts: i64) {
        let (at, zone) = (self.last_at.clone(), self.zone.clone());
        self.push(Raw::TradeDone { npc: npc.to_string(), ts, at, zone });
    }

    pub fn buy(&mut self, npc: &str, item: &str, ts: i64, at: &str) {
        self.push(Raw::Buy { npc: npc.to_string(), item: item.to_string(), ts, at: at.to_string() });
    }

    pub fn given(&mut self, item: &str, ts: i64) {
        self.push(Raw::Given { item: item.to_string(), ts });
    }

    pub fn xp(&mut self, ts: i64) {
        self.push(Raw::Xp { ts });
    }

    pub fn faction(&mut self, faction: &str, line: &str, ts: i64) {
        self.push(Raw::Faction { faction: faction.to_string(), line: line.to_string(), ts });
    }

    pub fn achievement(&mut self, name: &str, ts: i64) {
        self.push(Raw::Achieve { name: name.to_string(), ts });
    }

    pub fn task(&mut self, ts: i64) {
        self.push(Raw::Task { ts });
    }

    pub fn kill(&mut self, mob: &str, ts: i64, at: &str, zone: Option<&str>) {
        let f = Fight::Kill { mob: mob.to_string(), ts, at: at.to_string(), zone: zone.map(str::to_string) };
        self.push_fight(f);
    }

    pub fn loot(&mut self, item: &str, mob: &str, ts: i64, at: &str) {
        self.push_fight(Fight::Loot { item: item.to_string(), mob: mob.to_string(), ts, at: at.to_string() });
    }

    /// The chains, rebuilt only when something new was recorded.
    pub fn served(&self) -> Value {
        let mut cache = match self.cache.lock() {
            Ok(c) => c,
            Err(p) => p.into_inner(),
        };
        if let Some((v, value)) = cache.as_ref() {
            if *v == self.version {
                return value.clone();
            }
        }
        let built = graph::build(&self.talk, &self.fight);
        let value = serde_json::to_value(built).unwrap_or(Value::Null);
        *cache = Some((self.version, value.clone()));
        value
    }
}

impl super::super::GapsModule {
    /// A kill, loot or purchase for the chains (`QuestLogs::fight`); no row of its own.
    pub(in super::super) fn fought(&mut self, ev: &Event) -> bool {
        let zone = self.zone.clone();
        self.quest_log.fight(ev, zone.as_deref());
        false
    }
}

impl super::QuestLogs {
    /// The chains no task line names, rebuilt from the log (`gaps_threads.rs`).
    pub fn served_threads(&self) -> Value {
        self.threads.served()
    }

    /// A kill by the player, a loot or a purchase: the item flow the chains follow.
    pub fn fight(&mut self, ev: &Event, zone: Option<&str>) {
        let at = stamp_of(ev.raw()).unwrap_or_default();
        match (ev.kind(), ev.str("name"), ev.str("item")) {
            ("death", Some(mob), _) if ev.bool("bySelf") => self.threads.kill(mob, ev.ts(), &at, zone),
            ("loot", _, Some(item)) if ev.str("disposition") != Some("destroyed") => self.threads.loot(item, ev.str("source").unwrap_or_default(), ev.ts(), &at),
            ("purchase", _, Some(item)) => self.threads.buy(ev.str("npc").unwrap_or_default(), item, ev.ts(), &at),
            _ => {}
        }
    }
}

#[path = "gaps_threads_graph.rs"]
mod graph;

#[cfg(test)]
#[path = "gaps_threads_tests.rs"]
mod tests;
