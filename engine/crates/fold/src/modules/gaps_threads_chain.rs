//! The served chains (`gaps_threads_graph.rs` makes the nodes, `gaps_threads_edges.rs` the edges): one
//! graph per errand, its nodes in topological order, each step carrying the links that tie it to the
//! steps before it. The shape is `src/shared/gapQuestThreads.ts`'s.

use super::super::{Fight, Raw};
use super::edges::{edges, Edge};
use super::{make_nodes, FactionLine, Item, Kind, Line, Node};
use serde::Serialize;
use std::collections::{BTreeMap, HashSet, VecDeque};

#[derive(Serialize, Clone, Debug)]
pub struct Link {
    pub from: String,
    pub why: &'static str,
    pub detail: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Step {
    pub id: String,
    pub at: String,
    pub ms: i64,
    pub kind: &'static str,
    pub why: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub npc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zone: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub said: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub lines: Vec<Line>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub items: Vec<Item>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mob: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<u32>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub experience: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub factions: Vec<FactionLine>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub achievements: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub links: Vec<Link>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct QuestThread {
    pub id: String,
    pub giver: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zone: Option<String>,
    pub start_ms: i64,
    pub end_ms: i64,
    pub name: String,
    pub steps: Vec<Step>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub rewards: Vec<Item>,
}

/// The chains the recorded events give, oldest first; none a task line claims.
pub fn build(talk: &VecDeque<Raw>, fight: &VecDeque<Fight>) -> Vec<QuestThread> {
    let (nodes, hails) = make_nodes(talk, fight);
    let es = edges(&nodes, &hails);
    let mut out: Vec<QuestThread> = errands(&nodes, &es).iter().filter(|s| !s.iter().any(|&i| nodes[i].claimed)).map(|s| thread(&nodes, &es, s)).collect();
    out.sort_by_key(|t| t.start_ms);
    out
}

fn preds(n: usize, es: &[Edge]) -> Vec<Vec<usize>> {
    let mut p = vec![Vec::new(); n];
    for e in es {
        p[e.to].push(e.from);
    }
    p
}

/// `start` and everything that reaches it, never through another hand-in: another errand's hand-in is
/// that errand's (the package Old Doug took is not a step of the bones), unless nothing leads to it and
/// it opens this one (the Letter For Doug that starts the tutorial).
fn back(start: usize, p: &[Vec<usize>], nodes: &[Node]) -> Vec<usize> {
    let mut seen = vec![start];
    let mut queue = VecDeque::from([start]);
    while let Some(c) = queue.pop_front() {
        for &q in &p[c] {
            let other = nodes[q].kind == Kind::HandIn;
            if seen.contains(&q) || (other && !p[q].is_empty()) {
                continue;
            }
            seen.push(q);
            if !other {
                queue.push_back(q);
            }
        }
    }
    seen
}

/// One graph per hand-in; a hand-in nothing leads to that starts another errand is that errand's first
/// step (the tutorial's Letter For Doug); then the talk-only chains.
fn errands(nodes: &[Node], es: &[Edge]) -> Vec<Vec<usize>> {
    let p = preds(nodes.len(), es);
    let sets: Vec<(usize, Vec<usize>)> = (0..nodes.len()).filter(|&i| nodes[i].kind == Kind::HandIn).map(|h| (h, back(h, &p, nodes))).collect();
    let absorbed: HashSet<usize> = sets.iter().filter(|(h, _)| p[*h].is_empty() && sets.iter().any(|(o, s)| o != h && s.contains(h))).map(|(h, _)| *h).collect();
    let mut out: Vec<Vec<usize>> = sets.into_iter().filter(|(h, _)| !absorbed.contains(h)).map(|(_, s)| s).collect();
    let talk = talk_chains(nodes, es, &out);
    out.extend(talk);
    out
}

/// Asked keywords no errand took, joined by their edges (greetings may be shared): two or more asked
/// make a chain.
fn talk_chains(nodes: &[Node], es: &[Edge], taken: &[Vec<usize>]) -> Vec<Vec<usize>> {
    let used: HashSet<usize> = taken.iter().flatten().copied().collect();
    let free = |i: usize| nodes[i].kind == Kind::Greet || (nodes[i].kind == Kind::Ask && !used.contains(&i));
    let mut adj = vec![Vec::new(); nodes.len()];
    for e in es.iter().filter(|e| free(e.from) && free(e.to)) {
        adj[e.from].push(e.to);
        adj[e.to].push(e.from);
    }
    let mut done = vec![false; nodes.len()];
    let mut out = Vec::new();
    for s in (0..nodes.len()).filter(|&i| nodes[i].kind == Kind::Ask && !used.contains(&i)) {
        if done[s] {
            continue;
        }
        let comp = component(s, &adj, &mut done);
        if comp.iter().filter(|&&i| nodes[i].kind == Kind::Ask).count() >= 2 {
            out.push(comp);
        }
    }
    out
}

fn component(start: usize, adj: &[Vec<usize>], done: &mut [bool]) -> Vec<usize> {
    let mut comp = Vec::new();
    let mut queue = VecDeque::from([start]);
    done[start] = true;
    while let Some(c) = queue.pop_front() {
        comp.push(c);
        for &n in &adj[c] {
            if !done[n] {
                done[n] = true;
                queue.push_back(n);
            }
        }
    }
    comp
}

/// Topological over the set's edges; among the steps ready, the earliest first; a cycle is broken at
/// its earliest step.
fn order(nodes: &[Node], es: &[Edge], set: &[usize]) -> Vec<usize> {
    let inside: HashSet<usize> = set.iter().copied().collect();
    let local: Vec<&Edge> = es.iter().filter(|e| inside.contains(&e.from) && inside.contains(&e.to)).collect();
    let mut indeg: BTreeMap<usize, usize> = set.iter().map(|&i| (i, 0)).collect();
    for e in &local {
        *indeg.entry(e.to).or_default() += 1;
    }
    let mut out = Vec::new();
    while !indeg.is_empty() {
        let ready = indeg.iter().filter(|(_, d)| **d == 0).map(|(i, _)| *i).min_by_key(|&i| nodes[i].first());
        let next = ready.or_else(|| indeg.keys().copied().min_by_key(|&i| nodes[i].first())).expect("not empty");
        indeg.remove(&next);
        for e in local.iter().filter(|e| e.from == next) {
            if let Some(d) = indeg.get_mut(&e.to) {
                *d = d.saturating_sub(1);
            }
        }
        out.push(next);
    }
    out
}

fn kind_of(k: Kind) -> &'static str {
    match k {
        Kind::Greet | Kind::Ask => "talk",
        Kind::Buy => "buy",
        Kind::HandIn => "handin",
        Kind::Loot => "loot",
        Kind::Kill => "kill",
    }
}

fn items_of(m: &BTreeMap<String, u32>) -> Vec<Item> {
    m.iter().map(|(name, n)| Item { name: name.clone(), n: *n }).collect()
}

fn step(nodes: &[Node], es: &[Edge], set: &HashSet<usize>, i: usize) -> Step {
    let n = &nodes[i];
    let links: Vec<Link> = es.iter().filter(|e| e.to == i && set.contains(&e.from)).map(|e| Link { from: nodes[e.from].id.clone(), why: e.why, detail: e.detail.clone() }).collect();
    Step {
        id: n.id.clone(),
        at: n.at.clone(),
        ms: n.first(),
        kind: kind_of(n.kind),
        why: links.first().map_or("start", |l| l.why),
        npc: n.npc.clone(),
        zone: n.zone.clone(),
        said: n.said.iter().cloned().collect(),
        lines: n.lines.clone(),
        items: items_of(&n.items),
        mob: n.mob.clone(),
        count: (n.kind == Kind::Kill).then_some(n.count),
        experience: n.experience,
        factions: n.factions.clone(),
        achievements: n.achievements.clone(),
        links,
    }
}

fn thread(nodes: &[Node], es: &[Edge], set: &[usize]) -> QuestThread {
    let inside: HashSet<usize> = set.iter().copied().collect();
    let steps: Vec<Step> = order(nodes, es, set).into_iter().map(|i| step(nodes, es, &inside, i)).collect();
    let giver = steps.iter().find(|s| s.kind == "talk").or(steps.first()).and_then(|s| s.npc.clone().or_else(|| s.mob.clone())).unwrap_or_default();
    let start_ms = set.iter().map(|&i| nodes[i].first()).min().unwrap_or_default();
    let end_ms = set.iter().flat_map(|&i| nodes[i].times.iter().copied()).max().unwrap_or_default();
    let mut rewards: BTreeMap<String, u32> = BTreeMap::new();
    for &i in set {
        for (k, v) in &nodes[i].rewards {
            *rewards.entry(k.clone()).or_default() += v;
        }
    }
    let said = steps.iter().find_map(|s| s.said.first().cloned());
    let handed = steps.iter().find(|s| s.kind == "handin").and_then(|s| s.items.first().map(|i| i.name.clone()));
    let name = match (said, handed) {
        (Some(s), _) => format!("{giver}: {s}"),
        (None, Some(i)) => format!("{giver}: {i}"),
        _ => giver.clone(),
    };
    // Unique per chain: errands opened by the same greeting share a start, never a last step.
    let last = steps.last().map_or("", |s| s.id.as_str());
    QuestThread { id: format!("{giver}@{start_ms}:{last}"), zone: steps.iter().find_map(|s| s.zone.clone()), giver, start_ms, end_ms, name, steps, rewards: items_of(&rewards) }
}
