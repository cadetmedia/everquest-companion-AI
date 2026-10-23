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
    /// The offers of the last REFUSE_MS (item key, NPC, when): a refusal takes its own back.
    offers: Vec<(String, String, i64)>,
    /// Each NPC's quests, by its mob key: a task line within TASK_MS after it spoke or took an item
    /// (owner, 2026-10-22: Nikko Canti's page left `related_quests` empty; `You have been assigned
    /// the task 'Something Fishy'.` came a second after his [help] line).
    by_npc: HashMap<String, BTreeSet<String>>,
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
            if text.contains(REFUSAL) {
                return self.refused(name, ts);
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
        self.offers.retain(|(_, _, at)| ts - at <= REFUSE_MS);
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
        let (key, _, at) = self.offers.remove(i);
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
        self.quest_log.offered(item, npc, ev.ts());
        // Handed over, taken or handed back: the item exists either way.
        self.item_named(item, "offered", ev);
        true
    }

    /// What a row serves beyond its own fields: an item's or an NPC's quest facts, a quest's steps,
    /// an NPC's role from its target line, the zones an item was fished in.
    pub(super) fn serve_extras(&self, domain: Domain, key: &str, v: &mut Value) {
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
        // A merchant's stock goes on its Mobs row and its Merchants row alike (gaps_stock.rs).
        if let (Domain::Mob | Domain::Merchant, Some(sold)) = (domain, self.stock.serve(key, &self.items)) {
            v["itemsSold"] = sold;
        }
        if let (Domain::Item, Some(zones)) = (domain, self.fish.of(key)) {
            v["fishedIn"] = json!(zones);
        }
        if let (Domain::Mob, Some(fight)) = (domain, self.specials.fights.of(key)) {
            v["fight"] = fight;
        }
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
            q.task("Alchemical Solution", t(206)),
            "the task line after the turn-in ties the quest to Dorian"
        );
        assert!(
            !q.task("Alchemical Solution", t(207)),
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
        // Dorian took the missive just before the task line: his quest.
        assert_eq!(
            q.served(super::Domain::Mob, "dorian g'wyn"),
            Some(json!({ "quests": ["Alchemical Solution"] }))
        );
    }

    /// Owner's log, 2026-10-22: `Nikko Canti says, '... [help] me restock my catch ...'` then a second
    /// later `You have been assigned the task 'Something Fishy'.`: Nikko's page lists the quest.
    #[test]
    fn an_npc_that_spoke_just_before_a_task_line_gives_that_quest() {
        let mut q = QuestFacts::default();
        let t = |s: i64| 1_787_000_000_000 + s * 1000;
        q.last_npc = Some(("Nikko Canti".into(), t(0)));
        assert!(q.task("Something Fishy", t(1)));
        assert_eq!(
            q.served(super::Domain::Mob, "nikko canti"),
            Some(json!({ "quests": ["Something Fishy"] }))
        );
        // A task line long after says nothing of him.
        q.last_npc = Some(("Guard Shilster".into(), t(100)));
        assert!(!q.task("Something Fishy", t(200)));
        assert_eq!(q.served(super::Domain::Mob, "guard shilster"), None);
    }
}
