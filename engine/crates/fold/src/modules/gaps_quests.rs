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

use crate::event::Event;
use crate::message_overlay::message_text_of;
use crate::modules::gaps_keys::item_gap_key;
use crate::modules::gaps_players::speaker_of;
use crate::modules::resist::world::is_player_shaped_name;
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet, VecDeque};

/// The NPC's last line before a give: the give follows its hand-over line in the same second or two.
const GIVE_MS: i64 = 10_000;
/// The player's words that got the item: the exchange runs a minute at most.
const KEYWORDS_MS: i64 = 60_000;
/// A task line after a give or a turn-in (0-6 s on the owner's log).
const TASK_MS: i64 = 10_000;
/// A keyword is a short phrase, not a sentence of chat.
const KEYWORD_WORDS: usize = 5;

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
}

/// `Your task 'Q' has been updated.` / `You have been assigned the task 'Q'.` → `Q`.
fn task_of(text: &str) -> Option<&str> {
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
        *self = Self::default();
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
        if let Some(name) = speaker_of(text) {
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
        *self
            .by_item
            .entry(item_gap_key(item))
            .or_default()
            .turned_in
            .entry(npc.to_string())
            .or_default() += 1;
        true
    }

    fn pending_item(&mut self, item: &str, ts: i64) {
        self.pending.retain(|(_, at)| ts - at <= TASK_MS);
        self.pending.push((item_gap_key(item), ts));
    }

    /// A task line: every item given or turned in just before belongs to that quest.
    fn task(&mut self, quest: &str, ts: i64) -> bool {
        self.pending.retain(|(_, at)| ts - at <= TASK_MS);
        let mut changed = false;
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

#[cfg(test)]
mod tests {
    use super::{said_of, task_of, QuestFacts};
    use serde_json::json;

    #[test]
    fn the_task_and_keyword_lines_read_as_the_log_prints_them() {
        assert_eq!(
            task_of("Your task 'Alchemical Solution' has been updated."),
            Some("Alchemical Solution")
        );
        assert_eq!(
            task_of("You have been assigned the task 'Hate, Betrayal, and Trust'."),
            Some("Hate, Betrayal, and Trust")
        );
        assert_eq!(said_of("You say, 'ready'"), Some("ready"));
        assert_eq!(said_of("You say, 'Hail, Ty`Klerr'"), None);
        assert_eq!(
            said_of("You say, 'this is a whole long sentence of chat to the group'"),
            None
        );
    }

    /// The owner's log, 2026-10-22: Encoded Missive from Ty`Klerr, turned in to Dorian G`Wyn.
    #[test]
    fn a_quest_item_knows_its_giver_its_keywords_its_turn_in_and_its_quest() {
        let mut q = QuestFacts::default();
        let t = |s: i64| 1_787_000_000_000 + s * 1000;
        q.said.push_back((t(0), "Dorian".into()));
        // Ty`Klerr is shaped like a player name: her [keyword] lines make her an NPC.
        q.keyword_speakers.insert("Ty`Klerr".into());
        q.last_npc = Some(("Ty`Klerr".into(), t(10)));
        q.said.push_back((t(5), "ready".into()));
        q.said.push_back((t(8), "report".into()));
        assert!(q.given("Encoded Missive", t(11), Some("Neriak - Foreign Quarter")));
        assert!(q.task("Alchemical Solution", t(11)));
        assert!(q.offered("Encoded Missive", "Dorian G`Wyn", t(200)));
        assert!(
            !q.offered("Ancient Signet Ring", "Malkil", t(201)),
            "a player is no turn-in"
        );
        assert!(
            !q.task("Alchemical Solution", t(206)),
            "the same quest again changes nothing"
        );
        assert_eq!(
            serde_json::to_value(q.of("encoded missive")).unwrap(),
            json!({
                "givenBy": { "npc": "Ty`Klerr", "zone": "Neriak - Foreign Quarter", "keywords": ["Dorian", "ready", "report"] },
                "turnedInTo": [{ "npc": "Dorian G`Wyn", "n": 1 }],
                "quests": ["Alchemical Solution"]
            })
        );
        assert!(q.of("ancient signet ring").is_none());
    }
}
