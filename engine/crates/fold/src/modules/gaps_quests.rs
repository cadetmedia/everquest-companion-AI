//! Quest facts an item's page can state (owner, 2026-10-22: "the code should also pick up information
//! about who the item is supposed to be turned into by things like this"). The log says, of a quest
//! item:
//!
//! ```text
//! Ty`Klerr says, 'Take this back to Dorian, and implore him to exercise caution ...'
//! You have been given: Encoded Missive
//! Your task 'Alchemical Solution' has been updated.
//! You offered 1 Encoded Missive to Dorian G`Wyn.
//! Your task 'Alchemical Solution' has been updated.
//! ```
//!
//! So: who handed it over (the NPC that spoke last, within GIVE_MS before the give), what the player
//! said to that NPC to get it (the player's own short `You say` lines in the KEYWORDS_MS before), who
//! it was turned in to (an `offer` to an NPC), and the tasks a give or a turn-in moved (a task line
//! within TASK_MS after; measured 0-6 s on the owner's log). An NPC is a speaker whose name is not
//! player-shaped, or one that spoke a `[keyword]` line (`Ty`Klerr` is shaped like a player name).
//!
//! A child of `gaps.rs`, apart so that file keeps its size.

use super::{Domain, GapsModule};
use crate::event::Event;
use crate::message_overlay::message_text_of;
use crate::modules::consider::mob_key;
use crate::modules::gaps_keys::item_gap_key;
use crate::modules::gaps_players::speaker_of;
use crate::modules::resist::world::is_player_shaped_name;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet, VecDeque};

/// The NPC's last line before a give: the give follows its hand-over line in the same second or two.
const GIVE_MS: i64 = 10_000;
/// The player's words that got the item: the exchange runs a minute at most.
const KEYWORDS_MS: i64 = 60_000;
/// A task line after a give or a turn-in (0-6 s on the owner's log).
const TASK_MS: i64 = 10_000;
/// A keyword is a short phrase, not a sentence of chat.
const KEYWORD_WORDS: usize = 5;
/// An NPC hands a refused item back at once: `Sir Mollin says, 'I have no need for this, Drywrought.
/// You can have it back.'` a second after `You offered 1 A Curt Dismissal to Sir Mollin.`
pub const REFUSE_MS: i64 = 10_000;
/// The NPC's words when it hands an offered item back: no turn-in.
pub const REFUSAL: &str = "I have no need for this";
/// A trade stays open this long at most: its offers end at `You complete the trade with X.` or a cancel.
pub const TRADE_MS: i64 = 300_000;

/// `You have cancelled the trade.` or `<Someone> has cancelled the trade.`: its offers are no turn-in
/// (owner, 2026-10-23: "if i cancel the trade ... it shouldn't [count]").
pub fn trade_cancelled(text: &str) -> bool {
    text == "You have cancelled the trade." || text.ends_with(" has cancelled the trade.")
}

/// A refusal is the player's when it names the player, or names no one, or the player is unknown:
/// `I have no need for this, Bacon. You can have it back.` hands another player's item back.
pub fn refused_here(said: &str, player: Option<&str>) -> bool {
    let Some((_, rest)) = said.split_once(REFUSAL) else {
        return false;
    };
    let to = rest
        .strip_prefix(", ")
        .and_then(|r| r.split('.').next())
        .map(str::trim);
    match (to, player) {
        (Some(to), Some(p)) => to.eq_ignore_ascii_case(p),
        _ => true,
    }
}

/// Who handed an item over, where, and what the player said to get it.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct GivenBy {
    npc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    zone: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    keywords: Vec<String>,
}

/// One NPC an item was turned in to, and how often.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct TurnedIn {
    npc: String,
    n: u32,
}

/// What a row's item page can say of its quest (served as `questFacts`).
#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ItemQuestFacts {
    #[serde(skip_serializing_if = "Option::is_none")]
    given_by: Option<GivenBy>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    turned_in_to: Vec<TurnedIn>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    quests: Vec<String>,
}

#[derive(Default)]
struct Facts {
    given_by: Option<GivenBy>,
    turned_in: BTreeMap<String, u32>,
    quests: BTreeSet<String>,
}

#[derive(Default)]
pub struct QuestFacts {
    /// The last speaker taken for an NPC, and when.
    last_npc: Option<(String, i64)>,
    /// Speakers that spoke a `[keyword]` line: NPCs, whatever their names look like.
    keyword_speakers: HashSet<String>,
    /// The player's own short `You say` lines, with when, the newest last.
    said: VecDeque<(i64, String)>,
    /// Items given or turned in within TASK_MS, waiting for a task line.
    pending: Vec<(String, i64)>,
    by_item: HashMap<String, Facts>,
    /// The last NPC an item was turned in to, and when.
    last_offer: Option<(String, i64)>,
    /// The open trades' offers (item key, NPC, when): a refusal takes its own back, a cancel all.
    offers: Vec<(String, String, i64)>,
    /// Each NPC's quests, by its mob key: a task line within TASK_MS after it spoke or took an item
    /// (owner, 2026-10-22: Nikko Canti's page left `related_quests` empty; `You have been assigned
    /// the task 'Something Fishy'.` came a second after his [help] line).
    by_npc: HashMap<String, BTreeSet<String>>,
    /// The log's character, kept across a clear: whose refusals are its own.
    player: Option<String>,
}

/// `Your task 'Q' has been updated.` / `You have been assigned the task 'Q'.` → `Q`.
pub(super) fn task_of(text: &str) -> Option<&str> {
    let q = text
        .strip_prefix("Your task '")
        .and_then(|r| r.split_once("' has been "))
        .map(|(q, _)| q)
        .or_else(|| {
            text.strip_prefix("You have been assigned the task '")?
                .strip_suffix("'.")
        })?;
    (!q.is_empty()).then_some(q)
}

/// `You say, 'ready'` → `ready`; a hail or a long line is no keyword.
fn said_of(text: &str) -> Option<&str> {
    let s = text.strip_prefix("You say, '")?.strip_suffix('\'')?.trim();
    let keyword =
        !s.is_empty() && !s.starts_with("Hail, ") && s.split_whitespace().count() <= KEYWORD_WORDS;
    keyword.then_some(s)
}

impl QuestFacts {
    pub fn clear(&mut self) {
        *self = Self {
            player: self.player.take(),
            ..Self::default()
        };
    }

    /// The log's character, off its file name.
    pub fn set_player(&mut self, name: Option<&str>) {
        self.player = name.map(str::to_string);
    }

    /// An unparsed line: a speaker, the player's words, or a task line. True when an item's facts changed.
    pub fn line(&mut self, ev: &Event) -> bool {
        let text = message_text_of(ev.raw());
        let ts = ev.ts();
        if let Some(q) = task_of(text) {
            return self.task(q, ts);
        }
        if let Some(s) = said_of(text) {
            self.said.push_back((ts, s.to_string()));
            while self
                .said
                .front()
                .is_some_and(|(at, _)| ts - at > KEYWORDS_MS)
            {
                self.said.pop_front();
            }
            return false;
        }
        if trade_cancelled(text) {
            return self.cancelled();
        }
        if let Some(name) = speaker_of(text) {
            if text.contains(REFUSAL) {
                return refused_here(text, self.player.as_deref()) && self.refused(name, ts);
            }
            if text.contains('[') {
                self.keyword_speakers.insert(name.to_string());
            }
            if !is_player_shaped_name(name) || self.keyword_speakers.contains(name) {
                self.last_npc = Some((name.to_string(), ts));
            }
        }
        false
    }

    /// `You have been given: <item>`: the NPC that spoke last hands it over.
    pub fn given(&mut self, item: &str, ts: i64, zone: Option<&str>) -> bool {
        self.pending_item(item, ts);
        let Some((npc, at)) = self.last_npc.clone().filter(|(_, at)| ts - at <= GIVE_MS) else {
            return false;
        };
        let mut keywords: Vec<String> = Vec::new();
        for (when, s) in &self.said {
            let fresh = ts - when <= KEYWORDS_MS && *when <= ts.max(at);
            if fresh && !keywords.iter().any(|k| k.eq_ignore_ascii_case(s)) {
                keywords.push(s.clone());
            }
        }
        let given = GivenBy {
            npc,
            zone: zone.map(str::to_string),
            keywords,
        };
        let facts = self.by_item.entry(item_gap_key(item)).or_default();
        let changed = facts.given_by.as_ref() != Some(&given);
        facts.given_by = Some(given);
        changed
    }

    /// `You offered 1 <item> to <NPC>.`: a turn-in, when the receiver is an NPC.
    pub fn offered(&mut self, item: &str, npc: &str, ts: i64) -> bool {
        if is_player_shaped_name(npc) && !self.keyword_speakers.contains(npc) {
            return false;
        }
        self.pending_item(item, ts);
        self.last_offer = Some((npc.to_string(), ts));
        self.offers.retain(|(_, _, at)| ts - at <= TRADE_MS);
        self.offers.push((item_gap_key(item), npc.to_string(), ts));
        *self
            .by_item
            .entry(item_gap_key(item))
            .or_default()
            .turned_in
            .entry(npc.to_string())
            .or_default() += 1;
        true
    }

    /// `<NPC> says, 'I have no need for this, ...'`: the NPC handed the last item offered to it back,
    /// so it was no turn-in (owner's log, 2026-10-22: A Curt Dismissal to Sir Mollin). True when a
    /// turn-in was taken back.
    fn refused(&mut self, npc: &str, ts: i64) -> bool {
        let Some(i) = self.offers.iter().rposition(|(_, n, at)| n == npc && ts - at <= REFUSE_MS) else {
            return false;
        };
        self.take_back(i)
    }

    /// A cancelled trade: every open offer goes back (8 trades on the owner's log, 2026-10-23).
    fn cancelled(&mut self) -> bool {
        let mut any = false;
        while !self.offers.is_empty() {
            any |= self.take_back(self.offers.len() - 1);
        }
        any
    }

    /// `You complete the trade with <NPC>.`: the offers to it stand, and its trade is closed.
    pub fn trade_done(&mut self, npc: &str) {
        self.offers.retain(|(_, n, _)| n != npc);
    }

    /// Offer `i` was no turn-in: off its item's count, its pending task match and the last offer.
    fn take_back(&mut self, i: usize) -> bool {
        let (key, npc, at) = self.offers.remove(i);
        let npc = npc.as_str();
        self.pending.retain(|(k, t)| !(*k == key && *t == at));
        if self.last_offer.as_ref().is_some_and(|(n, t)| n == npc && *t == at) {
            self.last_offer = None;
        }
        let Some(facts) = self.by_item.get_mut(&key) else {
            return false;
        };
        if let Some(n) = facts.turned_in.get_mut(npc) {
            *n -= 1;
            if *n == 0 {
                facts.turned_in.remove(npc);
            }
        }
        true
    }

    fn pending_item(&mut self, item: &str, ts: i64) {
        self.pending.retain(|(_, at)| ts - at <= TASK_MS);
        self.pending.push((item_gap_key(item), ts));
    }

    /// A task line: every item given or turned in just before belongs to that quest, and so does the
    /// NPC that spoke or took an item just before.
    fn task(&mut self, quest: &str, ts: i64) -> bool {
        self.pending.retain(|(_, at)| ts - at <= TASK_MS);
        let mut changed = false;
        for (npc, at) in [self.last_npc.clone(), self.last_offer.clone()]
            .into_iter()
            .flatten()
        {
            if ts - at <= TASK_MS {
                changed |= self
                    .by_npc
                    .entry(mob_key(&npc))
                    .or_default()
                    .insert(quest.to_string());
            }
        }
        for (key, _) in &self.pending {
            changed |= self
                .by_item
                .entry(key.clone())
                .or_default()
                .quests
                .insert(quest.to_string());
        }
        changed
    }

    /// A row's `questFacts`: an item's facts, or an NPC's quests (`{ "quests": [...] }`); none when the
    /// log tied the row to no quest step.
    pub fn served(&self, domain: Domain, key: &str) -> Option<Value> {
        match domain {
            Domain::Item => self.of(key).map(|f| json!(f)),
            Domain::Mob | Domain::Merchant => {
                let quests = self.by_npc.get(key).filter(|q| !q.is_empty())?;
                Some(json!({ "quests": quests }))
            }
            _ => None,
        }
    }

    /// The facts an item row serves, by its key; none when the log saw no quest step for it.
    pub fn of(&self, key: &str) -> Option<ItemQuestFacts> {
        let f = self.by_item.get(key)?;
        let out = ItemQuestFacts {
            given_by: f.given_by.clone(),
            turned_in_to: f
                .turned_in
                .iter()
                .map(|(npc, n)| TurnedIn {
                    npc: npc.clone(),
                    n: *n,
                })
                .collect(),
            quests: f.quests.iter().cloned().collect(),
        };
        (out != ItemQuestFacts::default()).then_some(out)
    }
}

impl GapsModule {
    /// `You have been given: <item>`: its giver, for the item's quest facts.
    pub(super) fn quest_give(&mut self, ev: &Event) -> bool {
        let zone = self.zone.clone();
        match (ev.str("via"), ev.str("item")) {
            (Some("given"), Some(item)) => {
                self.quest_log.given(item, ev.ts());
                self.quests.given(item, ev.ts(), zone.as_deref())
            }
            _ => false,
        }
    }

    /// `You offered 1 <item> to <NPC>.`: a turn-in, for the item's and the NPC's quest facts.
    /// An item handed to an NPC is proof the item exists, so it is filed like a looted one, kind
    /// `offered`, whether the NPC takes it or hands it back (owner,
    /// 2026-10-22: Plea to Freeport, only ever in the inventory export, vanished from the tab once
    /// turned in to Sir Mollin, while the wiki still had no page). A hand-over to a player is not.
    pub(super) fn turn_in(&mut self, ev: &Event) -> bool {
        let (Some(item), Some(npc)) = (ev.str("item"), ev.str("npc")) else {
            return false;
        };
        if !self.quests.offered(item, npc, ev.ts()) {
            return false;
        }
        self.quest_log.offered(item, npc, ev.ts(), self.zone.as_deref());
        // Handed over, taken or handed back: the item exists either way.
        self.item_named(item, "offered", ev);
        true
    }

    /// What a row serves beyond its own fields: an item's or an NPC's quest facts, a quest's steps,
    /// an NPC's role from its target line, the zones an item was fished in.
    pub(super) fn serve_extras(&self, domain: Domain, key: &str, v: &mut Value) {
        // The domain it is served under: a Mobs row served as a merchant's says so (gaps_roles.rs `served_under`).
        v["domain"] = json!(domain.as_str());
        if let Some(f) = self.quests.served(domain, key) {
            v["questFacts"] = f;
        }
        if domain == Domain::Quest {
            if let Some(q) = self.quest_log.served(key) {
                v["quest"] = q;
            }
        }
        if let (Domain::Mob | Domain::Merchant, Some(role)) = (domain, self.roles.of(key)) {
            v["role"] = json!(role);
        }
        // A merchant's stock, an NPC's hail answer and a Merchants row's cons (gaps_stock.rs).
        self.serve_stock(domain, key, v);
        if let (Domain::Item, Some(zones)) = (domain, self.fish.of(key)) {
            v["fishedIn"] = json!(zones);
        }
        if let (Domain::Mob, Some(fight)) = (domain, self.specials.fights.of(key)) {
            v["fight"] = fight;
        }
    }
}

#[cfg(test)]
#[path = "gaps_quests_tests.rs"]
mod tests;
