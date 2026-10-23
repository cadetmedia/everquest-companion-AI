//! The Quests domain (owner, 2026-10-22: "quest pages worked out from the log"): one row per task the
//! log names (`You have been assigned the task 'Q'.`, `Your task 'Q' has been updated.`; 12 and 38
//! lines on the owner's log), with what a quest page's draft needs, all by fixed rules:
//!
//!   * STEPS. Each task line is a step: who it was with, what was said before it, what was handed
//!     over and what came of it. Two lines of one task in the same second are one step (a turn-in
//!     of two items prints two). A task assigned again after its steps were logged is a re-run:
//!     counted, not logged twice.
//!   * THE STEP'S NPC. The NPC the player handed an item to in the open trade, else the NPC
//!     that spoke in the SPOKE_MS before, else the first NPC that speaks in the AFTER_MS after (the
//!     answer prints after the task line: `You have been assigned the task 'Something Fishy'.` then
//!     `Nikko Canti says, 'That's so kind of you! ...'`). A catch or a kill names none.
//!   * THE HAND-IN. The offers of the open trade: since the last `You complete the trade with X.`
//!     or cancel, OFFER_MS at most. The task lines print before the trade's own end line.
//!   * THE TALK. The player's `You say` lines and the step NPC's lines since the player's last hail of
//!     that NPC, else in the TALK_MS before (and since the task's step before), and that NPC's answer
//!     after, newest TALK_CAP. Other players' lines never count; an NPC's answer to them may (the log
//!     cannot tell whom an NPC answers). An emote with a quote from the NPC just hailed or handed an
//!     item is its line too. The player's own name is written `Soandso`, as the wiki's quest pages
//!     write a player (27 NPC lines on 8 pages; `<name>` 9).
//!   * WHAT CAME OF IT. Items given in the GIVE_MS before, faction lines and `You gain experience!`
//!     within AFTER_MS, an achievement within ACHIEVE_MS, and a new task assigned within AFTER_MS
//!     (the next quest of a chain).
//!   * THE GIVER AND THE START ZONE. The assigning step's NPC and zone; none when the log never
//!     showed the assignment.
//!
//! A child of `gaps.rs`, apart so that file keeps its size.

use super::{Domain, GapsModule};
use crate::event::Event;
use crate::message_overlay::message_text_of;
use crate::modules::consider::mob_key;
use crate::modules::gaps_details::stamp_of;
use crate::modules::gaps_players::{hail_of, speaker_of};
use crate::modules::gaps_trade::faction_of;
use crate::modules::resist::world::is_player_shaped_name;
use regex::Regex;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashSet, VecDeque};

use super::quests::{refused_here, task_of, REFUSAL, REFUSE_MS};

/// The exchange that leads to a step, when no hail of its NPC starts it: a minute.
const TALK_MS: i64 = 60_000;
/// The NPC's answer, a faction line, experience or the next task: the same second or the next.
const AFTER_MS: i64 = 2_000;
/// The cap on an open trade: Unfortunate news's three letters went in 57-61 s before its task line.
const OFFER_MS: i64 = 300_000;
/// An achievement a step earned (Race Unlock - Half Dark Elves, 11 s after the step that earned it).
const ACHIEVE_MS: i64 = 15_000;
/// How quest pages write the player's name: 9 of the 20 cached pages with a placeholder.
const PLAYER_NAME: &str = "Soandso";
/// The NPC that spoke just before the step.
const SPOKE_MS: i64 = 10_000;
/// An item given before the step (0-6 s measured).
const GIVE_MS: i64 = 10_000;
/// Steps logged per quest, and lines of talk per step.
const STEP_CAP: usize = 40;
const TALK_CAP: usize = 12;

/// One line of the talk: `You` or the NPC, what was said, and when (epoch ms, for log order).
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Talk {
    who: String,
    text: String,
    ms: i64,
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
    /// The NPC's answers after the line; served inside the talk (`StepOut`).
    #[serde(skip)]
    answers: Vec<Talk>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    offered: Vec<String>,
    /// Epoch ms of each `offered` item, in step.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    offered_ms: Vec<i64>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    given: Vec<String>,
    /// Epoch ms of each `given` item, in step.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    given_ms: Vec<i64>,
    /// Task lines of one second folded into this step, when more than one (three items, three lines).
    #[serde(skip_serializing_if = "one_or_less")]
    lines: u32,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    factions: Vec<FactionMoved>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    experience: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    next: Option<String>,
    /// `You have completed achievement: X` in the ACHIEVE_MS after.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    achievements: Vec<String>,
    /// The NPC came from its answer after the line, so its earlier lines join the talk at serve time.
    #[serde(skip)]
    heard: Vec<(i64, Option<String>, String)>,
    /// An assignment printed in the second of another quest's step: that step (quest key, index),
    /// which keeps the talk, the hand-in and what came after (Call for Aid's last hand-in assigns
    /// Unfortunate news).
    #[serde(skip)]
    from: Option<(String, usize)>,
}

fn one_or_less(n: &u32) -> bool {
    *n <= 1
}

/// A step as served: its fields and its whole talk, borrowed rather than cloned.
#[derive(Serialize)]
struct StepOut<'a> {
    #[serde(flatten)]
    step: &'a Step,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    talk: Vec<Talk>,
}

/// One quest as the log saw it.
#[derive(Debug, Default)]
struct Quest {
    /// The task's name as the log first spelled it.
    name: String,
    /// The quest whose step assigned this one in the same second (`Step::from`).
    chained_from: Option<String>,
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
    /// The open trade's offers (when, item, NPC).
    offers: VecDeque<(i64, String, String)>,
    gives: VecDeque<(i64, String)>,
    /// The quest key and step index of the newest step, for what prints after it.
    last: Option<(String, usize)>,
    /// The NPC last hailed or handed an item, and when: whose emote lines are talk.
    addressed: Option<(String, i64)>,
    /// The zone of the last unparsed line: a change ends any trade and hail (`zoned`).
    zone: Option<String>,
    /// The character the log belongs to, kept across a clear, and its name as a word.
    player: Option<String>,
    player_word: Option<Regex>,
}

/// A task's key: case folded, a backtick spelled as the wiki's apostrophe.
pub fn quest_key(name: &str) -> String {
    mob_key(name)
}

impl QuestLogs {
    pub fn clear(&mut self) {
        let (player, player_word) = (self.player.take(), self.player_word.take());
        *self = Self { player, player_word, ..Self::default() };
    }

    /// The log's character, off its file name (`ClusterDeps.character`).
    pub fn set_player(&mut self, name: Option<&str>) {
        let name = name.map(str::trim).filter(|n| !n.is_empty());
        self.player = name.map(str::to_string);
        self.player_word = name.and_then(|n| Regex::new(&format!(r"\b{}\b", regex::escape(n))).ok());
    }

    /// The player's name as quest pages write it.
    fn scrub(&self, text: &str) -> String {
        match &self.player_word {
            Some(re) => re.replace_all(text, PLAYER_NAME).into_owned(),
            None => text.to_string(),
        }
    }

    /// `You complete the trade with <NPC>.`: its offers are spent.
    pub fn trade_done(&mut self, npc: &str) {
        self.offers.retain(|(_, _, n)| n != npc);
    }

    /// A zone change: no trade or hail carries across it.
    fn zoned(&mut self, zone: Option<&str>) {
        self.zone = zone.map(str::to_string);
        self.offers.clear();
        self.addressed = None;
    }

    /// `You gain experience!` (kind `expGain`, never an unparsed line): the step it came of.
    pub fn experience(&mut self, ts: i64) {
        if let Some(s) = self.answer_step(ts, AFTER_MS) {
            s.experience = true;
        }
    }

    /// `<NPC> bows as a courtesy. ... 'Greetings ...'` from the NPC just addressed: its name and quote.
    fn emote_of(&self, text: &str, ts: i64) -> Option<(String, String)> {
        let (npc, _) = self.addressed.as_ref().filter(|(_, at)| ts - at <= TALK_MS)?;
        let (_, quote) = text.strip_prefix(npc.as_str())?.strip_prefix(' ')?.split_once(" '")?;
        Some((npc.clone(), quote.strip_suffix('\'')?.to_string()))
    }

    fn trim(&mut self, ts: i64) {
        // OFFER_MS, not TALK_MS: a step's talk may start at a hail that long before (`talk_of`).
        while self.heard.front().is_some_and(|(at, _, _)| ts - at > OFFER_MS) {
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

    /// `You offered 1 <item> to <NPC>.`, an NPC already (gaps_quests.rs `offered` said so), in `zone`.
    pub fn offered(&mut self, item: &str, npc: &str, ts: i64, zone: Option<&str>) {
        self.trim(ts);
        if self.zone.as_deref() != zone {
            self.zoned(zone);
        }
        self.offers.push_back((ts, item.to_string(), npc.to_string()));
        self.addressed = Some((npc.to_string(), ts));
    }

    /// An unparsed line. A task line returns its quest and kind, for the row.
    pub fn line(&mut self, text: &str, ts: i64, zone: Option<&str>, at: &str) -> Option<(String, &'static str)> {
        self.trim(ts);
        if self.zone.as_deref() != zone {
            self.zoned(zone);
        }
        if let Some(q) = task_of(text) {
            let kind = if text.starts_with("You have been assigned") { "assigned" } else { "updated" };
            self.step(q, kind, ts, zone, at);
            return Some((q.to_string(), kind));
        }
        if let Some(s) = text.strip_prefix("You say, '").and_then(|r| r.strip_suffix('\'')) {
            if let Some(npc) = hail_of(text) {
                self.addressed = Some((npc.to_string(), ts));
            }
            let s = self.scrub(s);
            self.heard.push_back((ts, None, s));
        } else if let Some(name) = speaker_of(text) {
            let said = text.split_once(" says, '").map_or(text, |(_, s)| s.strip_suffix('\'').unwrap_or(s));
            self.speaker(name, said, ts);
        } else if let Some((name, said)) = self.emote_of(text, ts) {
            self.speaker(&name, &said, ts);
        } else {
            self.outcome(text, ts);
        }
        None
    }

    /// What follows a step: a faction line or an achievement; or a trade called off.
    fn outcome(&mut self, text: &str, ts: i64) {
        if text == "You have cancelled the trade." || text.ends_with(" has cancelled the trade.") {
            self.offers.clear();
        } else if let Some((faction, _, _)) = faction_of(text) {
            let moved = FactionMoved { faction: faction.to_string(), line: text.to_string() };
            if let Some(s) = self.answer_step(ts, AFTER_MS) {
                s.factions.push(moved);
            }
        } else if let Some(a) = text.strip_prefix("You have completed achievement: ") {
            if let Some(s) = self.answer_step(ts, ACHIEVE_MS) {
                s.achievements.push(a.to_string());
            }
        }
    }

    /// One line an NPC said (`said` without its quote marks).
    fn speaker(&mut self, name: &str, said: &str, ts: i64) {
        // The NPC handed the last item offered to it back: no hand-in to log (gaps_quests.rs REFUSAL).
        // Said to another player, it is their item (`..., Bacon. You can have it back.`).
        if said.contains(REFUSAL) {
            if !refused_here(said, self.player.as_deref()) {
                return;
            }
            if let Some(i) = self.offers.iter().rposition(|(at, _, n)| n == name && ts - at <= REFUSE_MS) {
                self.offers.remove(i);
            }
            return;
        }
        if said.contains('[') {
            self.keyword_speakers.insert(name.to_string());
        }
        if is_player_shaped_name(name) && !self.keyword_speakers.contains(name) {
            return;
        }
        let said = self.scrub(said);
        self.heard.push_back((ts, Some(name.to_string()), said.clone()));
        let Some(s) = self.answer_step(ts, AFTER_MS) else {
            return;
        };
        if s.npc.is_none() {
            s.npc = Some(name.to_string());
        }
        if s.npc.as_deref() == Some(name) && !s.answers.iter().any(|t| t.text == said) {
            s.answers.push(Talk { who: name.to_string(), text: said, ms: ts });
        }
    }

    /// The step a line after the newest one belongs to: the newest, or the step that chained it.
    fn answer_step(&mut self, ts: i64, ms: i64) -> Option<&mut Step> {
        let (key, i) = self.last.clone()?;
        let s = self.quests.get(&key)?.steps.get(i).filter(|s| ts - s.ts <= ms)?;
        let (key, i) = s.from.clone().unwrap_or((key, i));
        self.quests.get_mut(&key)?.steps.get_mut(i)
    }

    /// The newest step, when it is within `ms` of `ts`.
    fn last_step(&mut self, ts: i64, ms: i64) -> Option<&mut Step> {
        let (key, i) = self.last.clone()?;
        let s = self.quests.get_mut(&key)?.steps.get_mut(i)?;
        (ts - s.ts <= ms).then_some(s)
    }

    /// A task assigned in the second after another quest's step is that quest's next, given by that
    /// step (Something Fishy's hand-in to Nikko Canti assigns Alchemical Solution): that step.
    fn chain_of(&mut self, name: &str, key: &str, ts: i64) -> Option<(String, usize)> {
        let from = self.last.clone().filter(|(k, _)| k != key)?;
        self.last_step(ts, AFTER_MS)?.next = Some(name.to_string());
        Some(from)
    }

    fn step(&mut self, name: &str, kind: &'static str, ts: i64, zone: Option<&str>, at: &str) {
        let key = quest_key(name);
        let chained = if kind == "assigned" { self.chain_of(name, &key, ts) } else { None };
        let from_name = chained.as_ref().and_then(|(k, _)| self.quests.get(k)).map(|q| q.name.clone());
        let quest = self.quests.entry(key.clone()).or_insert_with(|| Quest { name: name.to_string(), ..Quest::default() });
        if kind == "assigned" && !quest.steps.is_empty() {
            quest.reruns += 1;
        }
        let same_second = quest.steps.last().is_some_and(|s| s.ts / 1000 == ts / 1000);
        if same_second && quest.reruns == 0 {
            if let Some(s) = quest.steps.last_mut() {
                s.lines += 1;
            }
        }
        if quest.reruns > 0 || same_second || quest.steps.len() >= STEP_CAP {
            return;
        }
        let since = quest.steps.last().map_or(i64::MIN, |s| s.ts);
        let base = Step { at: at.to_string(), ts, kind, zone: zone.map(str::to_string), lines: 1, ..Step::default() };
        let step = match chained {
            // The talk, the hand-in and the reward are the chaining step's (`answer_step`).
            Some(from) => {
                quest.chained_from = from_name;
                Step { from: Some(from), ..base }
            }
            None => self.gathered(since, base),
        };
        let Some(quest) = self.quests.get_mut(&key) else {
            return;
        };
        quest.steps.push(step);
        self.last = Some((key, quest.steps.len() - 1));
        self.offers.clear();
        self.gives.clear();
    }

    /// What the buffers hold for a step after `since`: the open trade's offers to one NPC, the items
    /// given, the NPC (the trade's, else the one that just spoke) and the lines heard.
    fn gathered(&self, since: i64, base: Step) -> Step {
        let offers: Vec<&(i64, String, String)> = self.offers.iter().filter(|(t, _, _)| *t > since).collect();
        let took = offers.last().map(|(_, _, n)| n.clone());
        let (offered_ms, offered) =
            offers.iter().filter(|(_, _, n)| Some(n) == took.as_ref()).map(|(t, item, _)| (*t, item.clone())).unzip();
        let (given_ms, given) = self.gives.iter().filter(|(t, _)| *t > since).cloned().unzip();
        let npc = took.or_else(|| {
            let spoke = self.heard.iter().rev().find(|(t, who, _)| who.is_some() && base.ts - t <= SPOKE_MS);
            spoke.and_then(|(_, who, _)| who.clone())
        });
        let heard = self.heard.iter().filter(|(t, _, _)| *t > since).cloned().collect();
        Step { npc, offered, offered_ms, given, given_ms, heard, ..base }
    }

    /// A Quest row's `quest`: the giver, the zone, the steps with their talk, the NPCs met, re-runs.
    pub fn served(&self, key: &str) -> Option<Value> {
        let q = self.quests.get(key)?;
        let steps: Vec<StepOut> = q.steps.iter().map(|s| StepOut { step: s, talk: talk_of(s) }).collect();
        let assigned = q.steps.first().filter(|s| s.kind == "assigned" && s.from.is_none());
        let giver = assigned.and_then(|s| s.npc.as_deref());
        let mut npcs: Vec<&str> = Vec::new();
        for n in q.steps.iter().filter_map(|s| s.npc.as_deref()) {
            if !npcs.contains(&n) {
                npcs.push(n);
            }
        }
        // Where the task was assigned: a quest first seen mid-way, or chained, has no start of its own.
        let zone = assigned.and_then(|s| s.zone.as_deref());
        let mut v = json!({ "giver": giver, "zone": zone, "npcs": npcs, "steps": steps, "reruns": q.reruns });
        if let Some(from) = &q.chained_from {
            v["chainedFrom"] = json!(from);
        }
        Some(v)
    }
}

/// The step's talk: the player's lines and its NPC's before it, then the NPC's answer. The talk
/// starts at the player's last hail of that NPC, else TALK_MS before the step (Lord Lyfyx was
/// hailed 108 s before the hand-in that answered with the next quest).
fn talk_of(s: &Step) -> Vec<Talk> {
    let hail = s.npc.as_ref().map(|n| format!("Hail, {n}"));
    let hailed = s.heard.iter().rev().find(|(_, who, text)| who.is_none() && Some(text) == hail.as_ref());
    let start = hailed.map_or(s.ts - TALK_MS, |(at, _, _)| *at);
    let mut talk: Vec<Talk> = Vec::new();
    for (at, who, text) in s.heard.iter().filter(|(at, _, _)| *at >= start) {
        let who = match who {
            None => "You".to_string(),
            Some(n) if s.npc.as_deref() == Some(n.as_str()) => n.clone(),
            Some(_) => continue,
        };
        if !talk.iter().any(|t| t.who == who && t.text == *text) {
            talk.push(Talk { who, text: text.clone(), ms: *at });
        }
    }
    for t in &s.answers {
        if !talk.iter().any(|x| x.who == t.who && x.text == t.text) {
            talk.push(t.clone());
        }
    }
    let skip = talk.len().saturating_sub(TALK_CAP);
    talk.split_off(skip)
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

    /// The typed lines the quest log reads, no row changes: `You complete the trade with <NPC>.`
    /// (kind `trade`) spends the trade's offers; `You gain experience!` (kind `expGain`) is a step's.
    pub(super) fn quest_event(&mut self, ev: &Event) -> bool {
        match (ev.kind(), ev.str("npc")) {
            ("trade", Some(npc)) => self.quest_log.trade_done(npc),
            ("expGain", _) => self.quest_log.experience(ev.ts()),
            _ => {}
        }
        false
    }

    /// `sharing`, for the log's character (`ClusterDeps.character`): its name is no NPC's line to
    /// copy, and a refusal said to it is its own.
    pub fn for_log(con_marks: super::marks::ConMarks, character: &Option<Value>) -> Self {
        let mut m = Self::sharing(con_marks);
        let name = character.as_ref().and_then(|c| c.get("name")?.as_str());
        m.quest_log.set_player(name);
        m.quests.set_player(name);
        m
    }
}

#[cfg(test)]
#[path = "gaps_quest_log_tests.rs"]
mod tests;
