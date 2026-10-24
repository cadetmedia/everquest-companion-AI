//! The chains themselves (`gaps_threads.rs` records): the log's events become NODES (a greeting, an
//! asked keyword, a purchase, a hand-in, a loot, the kills behind it), `gaps_threads_edges.rs` ties them
//! with the EDGES the lines give evidence for, and each hand-in gathers what leads to it into one graph:
//!
//!   * AN ERRAND is a hand-in and every node that reaches it backwards along evidence (an item bought or
//!     looted and handed in, the NPC that named the merchant, the keyword that led there), never through
//!     another hand-in. Two errands done at once stay two graphs when nothing links them.
//!   * A TALK-ONLY CHAIN is two or more asked keywords no errand took, linked by their keywords (the
//!     tutorial's send-off: [finished], [ready to leave], [send]).
//!   * THE ORDER is topological over the edges; time only breaks ties, so a skull looted before the talk
//!     that asked for it still comes after that talk.
//!
//! A chain with a step a task line claims (within TASK_MS) is the task quest's, already a Quests row.

use super::{Fight, Raw};
use serde::Serialize;
use std::collections::{BTreeMap, HashSet, VecDeque};

/// An NPC line answers the player's hail or say within this long.
pub(super) const ANSWER_MS: i64 = 4_000;
/// A say goes to the NPC hailed or heard last within this long.
const SAY_MS: i64 = 60_000;
/// A hand-in's reply and rewards print within this long of its trade's end, either side.
const REWARD_MS: i64 = 2_000;
/// A step this close to a task line is that task's.
const TASK_MS: i64 = 3_000;
/// The kills that count toward a loot: from this long before its first loot.
const KILLS_BEFORE_MS: i64 = 1_800_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Kind {
    Greet,
    Ask,
    Buy,
    HandIn,
    Loot,
    Kill,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct Item {
    pub name: String,
    pub n: u32,
}

#[derive(Serialize, Clone, Debug)]
pub struct Line {
    pub who: String,
    pub text: String,
    pub ms: i64,
}

#[derive(Serialize, Clone, Debug)]
pub struct FactionLine {
    pub faction: String,
    pub line: String,
}

/// One node of the graph, before it is served as a step.
#[derive(Debug, Clone)]
pub(super) struct Node {
    pub id: String,
    pub kind: Kind,
    pub npc: Option<String>,
    pub mob: Option<String>,
    pub said: Option<String>,
    /// Every time it happened; the first is `times[0]`.
    pub times: Vec<i64>,
    pub at: String,
    pub zone: Option<String>,
    pub lines: Vec<Line>,
    pub items: BTreeMap<String, u32>,
    pub count: u32,
    pub experience: bool,
    pub factions: Vec<FactionLine>,
    pub achievements: Vec<String>,
    pub rewards: BTreeMap<String, u32>,
    pub claimed: bool,
}

impl Node {
    fn new(id: String, kind: Kind, ts: i64, at: &str, zone: Option<&String>) -> Self {
        Self {
            id,
            kind,
            npc: None,
            mob: None,
            said: None,
            times: vec![ts],
            at: at.to_string(),
            zone: zone.cloned(),
            lines: Vec::new(),
            items: BTreeMap::new(),
            count: 0,
            experience: false,
            factions: Vec::new(),
            achievements: Vec::new(),
            rewards: BTreeMap::new(),
            claimed: false,
        }
    }

    pub fn first(&self) -> i64 {
        self.times[0]
    }

    /// What the NPC said in it, one string: the text names, keywords and instructions are read from.
    pub fn reply(&self) -> String {
        let said: Vec<&str> = self.lines.iter().filter(|l| l.who != "You").map(|l| l.text.as_str()).collect();
        said.join(" ")
    }
}

/// One trade that went through: what was handed, to whom, and what came of it.
struct HandIn {
    npc: String,
    items: Vec<String>,
    ts: i64,
    at: String,
    zone: Option<String>,
    replies: Vec<Line>,
    experience: bool,
    factions: Vec<FactionLine>,
    achievements: Vec<String>,
    given: Vec<String>,
}

/// A hail or a say, and the NPC lines that answered it.
struct Turn {
    npc: String,
    said: Option<String>,
    ts: i64,
    at: String,
    zone: Option<String>,
    replies: Vec<Line>,
}

/// The trades that went through, offers less refusals and cancels; then their rewards.
fn hand_ins(talk: &VecDeque<Raw>) -> Vec<HandIn> {
    let mut open: Vec<(String, String)> = Vec::new();
    let mut out = Vec::new();
    for r in talk {
        match r {
            Raw::Offer { npc, item } => open.push((npc.clone(), item.clone())),
            Raw::Refused { npc } => {
                // The line opens on the name: `A fallen froglok says` for the offer's `a fallen froglok`.
                if let Some(i) = open.iter().rposition(|(n, _)| n.eq_ignore_ascii_case(npc)) {
                    open.remove(i);
                }
            }
            Raw::Cancel => open.clear(),
            Raw::TradeDone { npc, ts, at, zone } => {
                let items: Vec<String> = open.iter().filter(|(n, _)| n == npc).map(|(_, i)| i.clone()).collect();
                open.retain(|(n, _)| n != npc);
                if !items.is_empty() {
                    let h = HandIn { npc: npc.clone(), items, ts: *ts, at: at.clone(), zone: zone.clone(), replies: Vec::new(), experience: false, factions: Vec::new(), achievements: Vec::new(), given: Vec::new() };
                    out.push(h);
                }
            }
            _ => {}
        }
    }
    for r in talk {
        reward(&mut out, r);
    }
    out
}

/// Experience, a faction line, an achievement or an item given within REWARD_MS of a hand-in: its.
fn reward(hs: &mut [HandIn], r: &Raw) {
    let ts = match r {
        Raw::Xp { ts } | Raw::Faction { ts, .. } | Raw::Achieve { ts, .. } | Raw::Given { ts, .. } => *ts,
        _ => return,
    };
    let Some(h) = hs.iter_mut().filter(|h| (h.ts - ts).abs() <= REWARD_MS).min_by_key(|h| (h.ts - ts).abs()) else {
        return;
    };
    match r {
        Raw::Xp { .. } => h.experience = true,
        Raw::Faction { faction, line, .. } => h.factions.push(FactionLine { faction: faction.clone(), line: line.clone() }),
        Raw::Achieve { name, .. } => h.achievements.push(name.clone()),
        Raw::Given { item, .. } => h.given.push(item.clone()),
        _ => {}
    }
}

/// Hails and says with the NPC lines that answered them; an NPC line at a hand-in is the hand-in's.
/// A say nobody answered, and an NPC's unprompted chatter with no `[keyword]`, are dropped. A say long
/// after the last NPC line is the next NPC line's, when one answers within ANSWER_MS (Old Doug's "Go ask
/// my son Doug for 'more work'", 82 s after his last word).
fn turns(talk: &VecDeque<Raw>, hs: &mut [HandIn]) -> Vec<Turn> {
    let mut out: Vec<Turn> = Vec::new();
    let mut last: Option<(String, i64)> = None;
    let mut loose: Option<(String, i64, String)> = None;
    let mut zone: Option<String> = None;
    for r in talk {
        match r {
            Raw::Hail { npc, ts, at, zone: z } => {
                zone.clone_from(z);
                out.push(Turn { npc: npc.clone(), said: None, ts: *ts, at: at.clone(), zone: z.clone(), replies: Vec::new() });
                last = Some((npc.clone(), *ts));
            }
            Raw::Say { text, ts, at } => {
                match last.as_ref().filter(|(_, t)| ts - t <= SAY_MS) {
                    Some((npc, _)) => out.push(Turn { npc: npc.clone(), said: Some(text.clone()), ts: *ts, at: at.clone(), zone: zone.clone(), replies: Vec::new() }),
                    None => loose = Some((text.clone(), *ts, at.clone())),
                }
            }
            Raw::Npc { npc, text, ts, at } => {
                if let Some((said, t, a)) = loose.take().filter(|(_, t, _)| ts - t <= ANSWER_MS) {
                    out.push(Turn { npc: npc.clone(), said: Some(said), ts: t, at: a, zone: zone.clone(), replies: Vec::new() });
                }
                answer(&mut out, hs, Line { who: npc.clone(), text: text.clone(), ms: *ts }, at, zone.as_ref());
                last = Some((npc.clone(), *ts));
            }
            _ => {}
        }
    }
    out.retain(|t| !t.replies.is_empty());
    out
}

fn answer(out: &mut Vec<Turn>, hs: &mut [HandIn], line: Line, at: &str, zone: Option<&String>) {
    let ts = line.ms;
    if let Some(h) = hs.iter_mut().find(|h| h.npc == line.who && (h.ts - ts).abs() <= REWARD_MS) {
        h.replies.push(line);
        return;
    }
    if let Some(t) = out.iter_mut().rev().take_while(|t| ts - t.ts <= ANSWER_MS).find(|t| t.npc == line.who) {
        t.replies.push(line);
        return;
    }
    if line.text.contains('[') {
        out.push(Turn { npc: line.who.clone(), said: None, ts, at: at.to_string(), zone: zone.cloned(), replies: vec![line] });
    }
}

/// The node with `id`, made by `make` the first time; every later sighting adds its time.
fn upsert(nodes: &mut Vec<Node>, id: String, ts: i64, make: impl FnOnce(String) -> Node) -> &mut Node {
    match nodes.iter().position(|n| n.id == id) {
        Some(i) => {
            nodes[i].times.push(ts);
            &mut nodes[i]
        }
        None => {
            nodes.push(make(id));
            nodes.last_mut().expect("just pushed")
        }
    }
}

/// Greetings (a hail and its answer, or an unprompted `[keyword]` line) and asked keywords, each
/// distinct one once: hailing Doug three times is one greeting.
fn talk_nodes(turns: &[Turn], nodes: &mut Vec<Node>) {
    let mut greetings: BTreeMap<(String, String), String> = BTreeMap::new();
    for t in turns {
        let first = t.replies[0].text.clone();
        let (kind, id) = match &t.said {
            Some(s) => (Kind::Ask, format!("ask:{}:{}", t.npc, s.to_lowercase())),
            None => {
                let n = greetings.len();
                let id = greetings.entry((t.npc.clone(), first)).or_insert_with(|| format!("greet:{}#{n}", t.npc)).clone();
                (Kind::Greet, id)
            }
        };
        upsert(nodes, id, t.ts, |id| {
            let mut n = Node::new(id, kind, t.ts, &t.at, t.zone.as_ref());
            n.npc = Some(t.npc.clone());
            n.said.clone_from(&t.said);
            let you = match &t.said {
                Some(s) => s.clone(),
                None => format!("Hail, {}", t.npc),
            };
            n.lines.push(Line { who: "You".into(), text: you, ms: t.ts });
            n.lines.extend(t.replies.iter().cloned());
            n
        });
    }
}

/// Hand-ins of the same items to the same NPC are one node, counted (six trades of two skulls each).
fn hand_in_nodes(hs: &[HandIn], nodes: &mut Vec<Node>) {
    for h in hs {
        let mut set: Vec<&str> = h.items.iter().map(String::as_str).collect();
        set.sort_unstable();
        set.dedup();
        let id = format!("handin:{}:{}", h.npc, set.join("+"));
        let node = upsert(nodes, id, h.ts, |id| {
            let mut n = Node::new(id, Kind::HandIn, h.ts, &h.at, h.zone.as_ref());
            n.npc = Some(h.npc.clone());
            n.lines.clone_from(&h.replies);
            n.factions.clone_from(&h.factions);
            n.achievements.clone_from(&h.achievements);
            n
        });
        node.experience |= h.experience;
        for i in &h.items {
            *node.items.entry(i.clone()).or_insert(0) += 1;
        }
        for g in &h.given {
            *node.rewards.entry(g.clone()).or_insert(0) += 1;
        }
    }
}

/// Purchases, each item from each merchant once, counted.
fn buy_nodes(talk: &VecDeque<Raw>, nodes: &mut Vec<Node>) {
    for r in talk {
        if let Raw::Buy { npc, item, ts, at } = r {
            let node = upsert(nodes, format!("buy:{npc}:{item}"), *ts, |id| {
                let mut n = Node::new(id, Kind::Buy, *ts, at, None);
                n.npc = Some(npc.clone());
                n
            });
            *node.items.entry(item.clone()).or_insert(0) += 1;
        }
    }
}

/// Loots of an item some hand-in took, and the kills of the mob that dropped it.
fn fight_nodes(fight: &VecDeque<Fight>, nodes: &mut Vec<Node>) {
    let handed: HashSet<String> = nodes.iter().filter(|n| n.kind == Kind::HandIn).flat_map(|n| n.items.keys().cloned()).collect();
    for f in fight {
        if let Fight::Loot { item, mob, ts, at } = f {
            if handed.contains(item) {
                let node = upsert(nodes, format!("loot:{mob}:{item}"), *ts, |id| {
                    let mut n = Node::new(id, Kind::Loot, *ts, at, None);
                    n.mob = Some(mob.clone());
                    n
                });
                *node.items.entry(item.clone()).or_insert(0) += 1;
            }
        }
    }
    let loots: Vec<(String, i64, i64)> = nodes
        .iter()
        .filter(|n| n.kind == Kind::Loot)
        .filter_map(|n| Some((n.mob.clone()?, n.first(), *n.times.iter().max()?)))
        .collect();
    for (mob, first, last) in loots {
        for f in fight {
            if let Fight::Kill { mob: m, ts, at, zone } = f {
                if *m == mob && *ts >= first - KILLS_BEFORE_MS && *ts <= last {
                    let node = upsert(nodes, format!("kill:{mob}"), *ts, |id| {
                        let mut n = Node::new(id, Kind::Kill, *ts, at, zone.as_ref());
                        n.mob = Some(mob.clone());
                        n
                    });
                    node.count += 1;
                }
            }
        }
    }
}

/// Every node the log gives, the hails (who, when) for the "go talk to" edges, the task lines' times.
pub(super) fn make_nodes(talk: &VecDeque<Raw>, fight: &VecDeque<Fight>) -> (Vec<Node>, Vec<(String, i64)>) {
    let mut hs = hand_ins(talk);
    let ts = turns(talk, &mut hs);
    let mut nodes = Vec::new();
    talk_nodes(&ts, &mut nodes);
    hand_in_nodes(&hs, &mut nodes);
    buy_nodes(talk, &mut nodes);
    fight_nodes(fight, &mut nodes);
    let tasks: Vec<i64> = talk.iter().filter_map(|r| if let Raw::Task { ts } = r { Some(*ts) } else { None }).collect();
    for n in &mut nodes {
        n.claimed = n.times.iter().any(|t| tasks.iter().any(|k| (k - t).abs() <= TASK_MS));
        n.times.sort_unstable();
    }
    let hails = talk.iter().filter_map(|r| if let Raw::Hail { npc, ts, .. } = r { Some((npc.clone(), *ts)) } else { None }).collect();
    (nodes, hails)
}

pub use chain::build;

#[path = "gaps_threads_edges.rs"]
mod edges;

#[path = "gaps_threads_chain.rs"]
mod chain;
