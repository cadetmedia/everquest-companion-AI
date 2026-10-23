//! The Quests domain (owner, 2026-10-22: "quest pages worked out from the log"): one row per task the
//! log names (`You have been assigned the task 'Q'.`, `Your task 'Q' has been updated.`; 12 and 38
//! lines on the owner's log), with what a quest page's draft needs, all by fixed rules:
//!
//!   * STEPS. Each task line is a step: who it was with, what was said before it, what was handed
//!     over and what came of it. Two lines of one task in the same second are one step (a turn-in
//!     of two items prints two). A task assigned again after its steps were logged is a re-run:
//!     counted, not logged twice.
//!   * THE STEP'S NPC. The NPC the player handed an item to in the OFFER_MS before, else the NPC
//!     that spoke in the SPOKE_MS before, else the first NPC that speaks in the AFTER_MS after (the
//!     answer prints after the task line: `You have been assigned the task 'Something Fishy'.` then
//!     `Nikko Canti says, 'That's so kind of you! ...'`). A catch or a kill names none.
//!   * THE TALK. The player's `You say` lines and the step NPC's lines in the TALK_MS before (since
//!     the task's step before), and that NPC's answer after, newest TALK_CAP. Other players' lines
//!     never count; an NPC's answer to them may (the log cannot tell whom an NPC answers).
//!   * WHAT CAME OF IT. Items given in the GIVE_MS before, faction lines and `You gain experience!`
//!     within AFTER_MS, and a new task assigned within AFTER_MS (the next quest of a chain).
//!   * THE GIVER. The assigning step's NPC.
//!
//! A child of `gaps.rs`, apart so that file keeps its size.

use super::{Domain, GapsModule};
use crate::event::Event;
use crate::message_overlay::message_text_of;
use crate::modules::consider::mob_key;
use crate::modules::gaps_details::stamp_of;
use crate::modules::gaps_players::speaker_of;
use crate::modules::gaps_trade::faction_of;
use crate::modules::resist::world::is_player_shaped_name;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashSet, VecDeque};

use super::quests::{task_of, REFUSAL, REFUSE_MS};

/// The exchange that leads to a step: a minute at most.
const TALK_MS: i64 = 60_000;
/// The NPC's answer, a faction line, experience or the next task: the same second or the next.
const AFTER_MS: i64 = 2_000;
/// An item handed over before the step (21:29:29 offer, 21:29:44 task line on the owner's log).
const OFFER_MS: i64 = 20_000;
/// The NPC that spoke just before the step.
const SPOKE_MS: i64 = 10_000;
/// An item given before the step (0-6 s measured).
const GIVE_MS: i64 = 10_000;
/// Steps logged per quest, and lines of talk per step.
const STEP_CAP: usize = 40;
const TALK_CAP: usize = 12;

/// One line of the talk: `You` or the NPC, and what was said.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Talk {
    who: String,
    text: String,
}

/// One faction line: the faction, and the line as the log printed it.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct FactionMoved {
    faction: String,
    line: String,
}

/// One task line of a quest, and what surrounded it.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Step {
    /// The log's own stamp.
    at: String,
    #[serde(skip)]
    ts: i64,
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    npc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    zone: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    talk: Vec<Talk>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    offered: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    given: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    factions: Vec<FactionMoved>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    experience: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    next: Option<String>,
    /// The NPC came from its answer after the line, so its earlier lines join the talk at serve time.
    #[serde(skip)]
    heard: Vec<(i64, Option<String>, String)>,
}

/// One quest as the log saw it.
#[derive(Debug, Default)]
struct Quest {
    steps: Vec<Step>,
    /// Times assigned after the first run was logged.
    reruns: u32,
}

#[derive(Default)]
pub struct QuestLogs {
    quests: BTreeMap<String, Quest>,
    /// The last TALK_MS of `You say` lines (None) and NPC lines (Some), oldest first.
    heard: VecDeque<(i64, Option<String>, String)>,
    /// Speakers that spoke a `[keyword]` line: NPCs whatever their names look like.
    keyword_speakers: HashSet<String>,
    offers: VecDeque<(i64, String, String)>,
    gives: VecDeque<(i64, String)>,
    /// The quest key and step index of the newest step, for what prints after it.
    last: Option<(String, usize)>,
}

/// A task's key: case folded, a backtick spelled as the wiki's apostrophe.
pub fn quest_key(name: &str) -> String {
    mob_key(name)
}

impl QuestLogs {
    pub fn clear(&mut self) {
        *self = Self::default();
    }

    fn trim(&mut self, ts: i64) {
        while self.heard.front().is_some_and(|(at, _, _)| ts - at > TALK_MS) {
            self.heard.pop_front();
        }
        while self.offers.front().is_some_and(|(at, _, _)| ts - at > OFFER_MS) {
            self.offers.pop_front();
        }
        while self.gives.front().is_some_and(|(at, _)| ts - at > GIVE_MS) {
            self.gives.pop_front();
        }
    }

    /// `You have been given: <item>`.
    pub fn given(&mut self, item: &str, ts: i64) {
        self.trim(ts);
        self.gives.push_back((ts, item.to_string()));
    }

    /// `You offered 1 <item> to <NPC>.`, an NPC already (gaps_quests.rs `offered` said so).
    pub fn offered(&mut self, item: &str, npc: &str, ts: i64) {
        self.trim(ts);
        self.offers.push_back((ts, item.to_string(), npc.to_string()));
    }

    /// An unparsed line. A task line returns its quest and kind, for the row.
    pub fn line(&mut self, text: &str, ts: i64, zone: Option<&str>, at: &str) -> Option<(String, &'static str)> {
        self.trim(ts);
        if let Some(q) = task_of(text) {
            let kind = if text.starts_with("You have been assigned") { "assigned" } else { "updated" };
            self.step(q, kind, ts, zone, at);
            return Some((q.to_string(), kind));
        }
        if let Some(s) = text.strip_prefix("You say, '").and_then(|r| r.strip_suffix('\'')) {
            self.heard.push_back((ts, None, s.to_string()));
        } else if let Some(name) = speaker_of(text) {
            self.speaker(name, text, ts);
        } else if let Some((faction, _, _)) = faction_of(text) {
            let moved = FactionMoved { faction: faction.to_string(), line: text.to_string() };
            if let Some(s) = self.last_step(ts) {
                s.factions.push(moved);
            }
        } else if text == "You gain experience!" || text == "You gain party experience!" {
            if let Some(s) = self.last_step(ts) {
                s.experience = true;
            }
        }
        None
    }

    fn speaker(&mut self, name: &str, text: &str, ts: i64) {
        // The NPC handed the last item offered to it back: no hand-in to log (gaps_quests.rs REFUSAL).
        if text.contains(REFUSAL) {
            if let Some(i) = self.offers.iter().rposition(|(at, _, n)| n == name && ts - at <= REFUSE_MS) {
                self.offers.remove(i);
            }
            return;
        }
        if text.contains('[') {
            self.keyword_speakers.insert(name.to_string());
        }
        if is_player_shaped_name(name) && !self.keyword_speakers.contains(name) {
            return;
        }
        let said = text.split_once(" says, '").map_or(text, |(_, s)| s.strip_suffix('\'').unwrap_or(s)).to_string();
        self.heard.push_back((ts, Some(name.to_string()), said.clone()));
        let Some(s) = self.last_step(ts) else {
            return;
        };
        if s.npc.is_none() {
            s.npc = Some(name.to_string());
        }
        if s.npc.as_deref() == Some(name) && !s.talk.iter().any(|t| t.text == said) {
            s.talk.push(Talk { who: name.to_string(), text: said });
        }
    }

    /// The newest step, when it is within AFTER_MS of `ts`.
    fn last_step(&mut self, ts: i64) -> Option<&mut Step> {
        let (key, i) = self.last.clone()?;
        let s = self.quests.get_mut(&key)?.steps.get_mut(i)?;
        (ts - s.ts <= AFTER_MS).then_some(s)
    }

    fn step(&mut self, name: &str, kind: &'static str, ts: i64, zone: Option<&str>, at: &str) {
        let key = quest_key(name);
        // A task assigned in the second after another quest's step is that quest's next, given by
        // that step's NPC (Something Fishy's hand-in to Nikko Canti assigns Alchemical Solution).
        let mut chained: Option<String> = None;
        if kind == "assigned" {
            let other = self.last.as_ref().is_some_and(|(k, _)| *k != key);
            if let (true, Some(s)) = (other, self.last_step(ts)) {
                s.next = Some(name.to_string());
                chained.clone_from(&s.npc);
            }
        }
        let quest = self.quests.entry(key.clone()).or_default();
        if kind == "assigned" && !quest.steps.is_empty() {
            quest.reruns += 1;
        }
        let same_second = quest.steps.last().is_some_and(|s| s.ts / 1000 == ts / 1000);
        if quest.reruns > 0 || same_second || quest.steps.len() >= STEP_CAP {
            return;
        }
        let since = quest.steps.last().map_or(i64::MIN, |s| s.ts);
        let offers: Vec<&(i64, String, String)> = self.offers.iter().filter(|(t, _, _)| *t > since).collect();
        let npc = offers.last().map(|(_, _, n)| n.clone()).or(chained).or_else(|| {
            let spoke = self.heard.iter().rev().find(|(t, who, _)| who.is_some() && ts - t <= SPOKE_MS);
            spoke.and_then(|(_, who, _)| who.clone())
        });
        let step = Step {
            at: at.to_string(),
            ts,
            kind,
            npc,
            zone: zone.map(str::to_string),
            offered: offers.iter().map(|(_, item, _)| item.clone()).collect(),
            given: self.gives.iter().filter(|(t, _)| *t > since).map(|(_, i)| i.clone()).collect(),
            heard: self.heard.iter().filter(|(t, _, _)| *t > since).cloned().collect(),
            ..Step::default()
        };
        quest.steps.push(step);
        self.last = Some((key, quest.steps.len() - 1));
        self.offers.clear();
        self.gives.clear();
    }

    /// A Quest row's `quest`: the giver, the zone, the steps with their talk, the NPCs met, re-runs.
    pub fn served(&self, key: &str) -> Option<Value> {
        let q = self.quests.get(key)?;
        let steps: Vec<Step> = q.steps.iter().map(with_talk).collect();
        let giver = steps.first().filter(|s| s.kind == "assigned").and_then(|s| s.npc.clone());
        let mut npcs: Vec<String> = Vec::new();
        for n in steps.iter().filter_map(|s| s.npc.clone()) {
            if !npcs.contains(&n) {
                npcs.push(n);
            }
        }
        let zone = steps.first().and_then(|s| s.zone.clone());
        Some(json!({ "giver": giver, "zone": zone, "npcs": npcs, "steps": steps, "reruns": q.reruns }))
    }
}

/// The step with its talk: the player's lines and its NPC's before it, then the NPC's answer.
fn with_talk(s: &Step) -> Step {
    let mut talk: Vec<Talk> = Vec::new();
    for (_, who, text) in &s.heard {
        let who = match who {
            None => "You".to_string(),
            Some(n) if s.npc.as_deref() == Some(n.as_str()) => n.clone(),
            Some(_) => continue,
        };
        if !talk.iter().any(|t| t.who == who && t.text == *text) {
            talk.push(Talk { who, text: text.clone() });
        }
    }
    for t in &s.talk {
        if !talk.contains(t) {
            talk.push(t.clone());
        }
    }
    let skip = talk.len().saturating_sub(TALK_CAP);
    Step { talk: talk.into_iter().skip(skip).collect(), heard: Vec::new(), ..s.clone() }
}

impl GapsModule {
    /// An unparsed line for the quest facts and the quest log; a task line files its Quests row.
    pub(super) fn quest_line(&mut self, ev: &Event) -> bool {
        let facts = self.quests.line(ev);
        let at = stamp_of(ev.raw()).unwrap_or_default();
        let text = message_text_of(ev.raw());
        let zone = self.zone.clone();
        match self.quest_log.line(text, ev.ts(), zone.as_deref(), &at) {
            Some((quest, kind)) => self.note(Domain::Quest, quest_key(&quest), &quest, false, kind, ev) | facts,
            None => facts,
        }
    }
}

#[cfg(test)]
#[path = "gaps_quest_log_tests.rs"]
mod tests;
