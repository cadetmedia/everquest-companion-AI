//! Talk with an NPC that no task line claimed (owner, 2026-10-23: "i need to be able to force a quest
//! association"). The EverQuest Legends Tutorial's Doug hands out errands with no task line at all:
//! `You say, 'Hail, Doug'`, his `[let's talk]` reply, `You say, 'let's talk'`, "Go talk to my old man in
//! the cave to the south." The Quests rows come from task lines only, so such a quest needs the player
//! to name it; these are what they pick from.
//!
//!   * AN EXCHANGE is one NPC, one visit: a hail of it opens one, so does a `[keyword]` line or an answer
//!     to the player's hail of that name; its lines, the player's says between, the items offered to it
//!     and given; it ends on a zone change or QUIET_MS without a line.
//!   * CLAIMED: an exchange whose NPC has a task step inside it belongs to that quest already and is not
//!     served (`QuestLogs::served_talks`).
//!   * Only the newest EXCHANGE_CAP are kept, LINE_CAP lines each, so a whole log's hails stay small.
//!
//! A child of `gaps_quest_log.rs`, which reads the lines and hands them here.

use super::{is_player_shaped_name, Step, Talk, AFTER_MS, HAIL_ANSWER_MS, REFUSAL};
use serde::Serialize;
use std::collections::VecDeque;

/// A visit ends after this long without a line from either side.
const QUIET_MS: i64 = 600_000;
/// A player's say joins the exchange last spoken in within this long.
const SAY_MS: i64 = 60_000;
const EXCHANGE_CAP: usize = 200;
const LINE_CAP: usize = 40;

/// One NPC, one visit.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Exchange {
    /// `<npc>@<start ms>`: what an association stores.
    id: String,
    npc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    zone: Option<String>,
    /// The log's stamp of its first line.
    at: String,
    start_ms: i64,
    end_ms: i64,
    talk: Vec<Talk>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    offered: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    given: Vec<String>,
    #[serde(skip)]
    open: bool,
}

impl Exchange {
    /// Whether a step with `npc` at `ts` falls inside this visit (`slack` either side).
    pub fn covers(&self, npc: Option<&str>, ts: i64, slack: i64) -> bool {
        npc == Some(self.npc.as_str()) && ts >= self.start_ms - slack && ts <= self.end_ms + slack
    }

    fn push(&mut self, who: &str, text: &str, ts: i64) {
        self.end_ms = ts;
        if self.talk.len() < LINE_CAP && !self.talk.iter().any(|t| t.who == who && t.text == text) {
            self.talk.push(Talk { who: who.to_string(), text: text.to_string(), ms: ts });
        }
    }
}

#[derive(Default)]
pub struct Exchanges {
    list: VecDeque<Exchange>,
}

impl Exchanges {
    /// The open visit with `npc`, while it is still going.
    fn open_for(&mut self, npc: &str, ts: i64) -> Option<&mut Exchange> {
        self.list.iter_mut().rev().find(|e| e.open && e.npc == npc && ts - e.end_ms <= QUIET_MS)
    }

    /// The open visit spoken in last, within `ms`.
    fn latest(&mut self, ts: i64, ms: i64) -> Option<&mut Exchange> {
        self.list.iter_mut().filter(|e| e.open && ts - e.end_ms <= ms).max_by_key(|e| e.end_ms)
    }

    fn open(&mut self, npc: &str, ts: i64, zone: Option<&str>, at: &str) -> &mut Exchange {
        if self.list.len() >= EXCHANGE_CAP {
            self.list.pop_front();
        }
        let id = format!("{npc}@{ts}");
        let e = Exchange { id, npc: npc.to_string(), zone: zone.map(str::to_string), at: at.to_string(), start_ms: ts, end_ms: ts, talk: Vec::new(), offered: Vec::new(), given: Vec::new(), open: true };
        self.list.push_back(e);
        self.list.back_mut().expect("just pushed")
    }

    /// `You say, 'Hail, <npc>'`: the visit, opened if none is going.
    pub fn hail(&mut self, npc: &str, said: &str, ts: i64, zone: Option<&str>, at: &str) {
        if self.open_for(npc, ts).is_none() {
            self.open(npc, ts, zone, at);
        }
        if let Some(e) = self.open_for(npc, ts) {
            e.push("You", said, ts);
        }
    }

    /// An NPC's line. `opens`: a `[keyword]` line or an answer to the player's hail, which starts a
    /// visit; any other line only joins one already going.
    pub fn npc_line(&mut self, npc: &str, said: &str, ts: i64, at: (Option<&str>, &str), opens: bool) {
        if self.open_for(npc, ts).is_none() && opens {
            self.open(npc, ts, at.0, at.1);
        }
        if let Some(e) = self.open_for(npc, ts) {
            e.push(npc, said, ts);
        }
    }

    /// A `You say` line that is no hail: the visit spoken in last.
    pub fn say(&mut self, said: &str, ts: i64) {
        if let Some(e) = self.latest(ts, SAY_MS) {
            e.push("You", said, ts);
        }
    }

    /// `You offered 1 <item> to <npc>.`
    pub fn offer(&mut self, npc: &str, item: &str, ts: i64) {
        if let Some(e) = self.open_for(npc, ts) {
            e.offered.push(item.to_string());
            e.end_ms = ts;
        }
    }

    /// `You have been given: <item>`: the visit spoken in last.
    pub fn given(&mut self, item: &str, ts: i64) {
        if let Some(e) = self.latest(ts, SAY_MS) {
            e.given.push(item.to_string());
        }
    }

    /// A zone change ends every visit.
    pub fn close_all(&mut self) {
        for e in self.list.iter_mut() {
            e.open = false;
        }
    }

    /// The visits `claimed` does not take, oldest first.
    pub fn served<'a>(&'a self, claimed: impl Fn(&Exchange) -> bool + 'a) -> Vec<&'a Exchange> {
        self.list.iter().filter(|e| !claimed(e)).collect()
    }
}

impl super::QuestLogs {
    /// An NPC's line for the visits (`gaps_exchanges.rs`): an NPC is a name that spoke a `[keyword]`,
    /// or is no player's shape, or answered the player's hail of it within HAIL_ANSWER_MS.
    pub(super) fn npc_talk(&mut self, name: &str, said: &str, ts: i64, at: (Option<&str>, &str)) {
        if said.contains(REFUSAL) {
            return;
        }
        let keyword = said.contains('[') || self.keyword_speakers.contains(name);
        let answered = self.addressed.as_ref().is_some_and(|(n, t)| n == name && ts - t <= HAIL_ANSWER_MS);
        if is_player_shaped_name(name) && !keyword && !answered {
            return;
        }
        let said = self.scrub(said);
        self.threads.npc(name, &said, ts);
        self.talks.npc_line(name, &said, ts, at, said.contains('[') || answered);
    }

    /// The visits no task step falls in, oldest first: what a quest the player names is made of.
    pub fn served_talks(&self) -> Vec<&Exchange> {
        let steps: Vec<&Step> = self.quests.values().flat_map(|q| q.steps.iter()).collect();
        self.talks.served(move |e| steps.iter().any(|s| e.covers(s.npc.as_deref(), s.ts, AFTER_MS)))
    }
}
