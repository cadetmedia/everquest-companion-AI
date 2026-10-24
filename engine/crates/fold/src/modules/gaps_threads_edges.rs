//! The edges between a chain's nodes (`gaps_threads_graph.rs`), each one evidence the log gives, with
//! the words the step shows for it (owner, 2026-10-23: "said [help]", "named Dougina", "Package for Old
//! Doug, bought from Dougina", "reward"):
//!
//!   * KEYWORD: an NPC offered `[help]` and the player said it to that NPC.
//!   * GOASK: "Go ask my son Doug for 'more work'" and the player did.
//!   * NAMED: an NPC's words name another NPC (the merchant that sells what is wanted wins) or, by a word
//!     only one of them carries, a mob a hand-in's item drops from ("the [fragile ones]").
//!   * SENT: an asked NPC sends the player somewhere ("Go talk to my old man") and the next NPC is the one
//!     a word of its name points to, or else the first one hailed within SENT_MS.
//!   * ITEM: an item bought or looted and later handed in; the kills of the mob that dropped it.
//!   * RETURN: the asked NPC whose words name the item (a 5-letter stem) is the one it is handed back to.

use super::{Kind, Node, ANSWER_MS};
use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

/// A "go talk to" reaches an NPC first hailed within this long after.
const SENT_MS: i64 = 300_000;
/// Words that tie nothing: articles, pronouns, the `pet` every tutorial skeleton carries.
const STOP: &[&str] = &[
    "the", "and", "for", "you", "your", "his", "her", "him", "she", "they", "them", "with", "this", "that", "here", "there", "from", "pet", "man",
    "one", "ones", "down", "some", "just", "into", "over", "about", "what", "will", "would", "could", "have", "has", "had", "are", "was", "who",
];
static INSTRUCTION: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)\b(?:go|head|check on|talk to|find|seek|visit|travel)\b").expect("valid"));

pub(super) struct Edge {
    pub from: usize,
    pub to: usize,
    pub why: &'static str,
    pub detail: String,
}

/// Every edge the nodes give evidence for, each pair once.
pub(super) fn edges(nodes: &[Node], hails: &[(String, i64)]) -> Vec<Edge> {
    let mut out = Vec::new();
    keyword_edges(nodes, &mut out);
    named_edges(nodes, &mut out);
    mob_edges(nodes, &mut out);
    sent_edges(nodes, hails, &mut out);
    item_edges(nodes, &mut out);
    return_edges(nodes, &mut out);
    let mut seen = HashSet::new();
    out.retain(|e| e.from != e.to && seen.insert((e.from, e.to)));
    out
}

/// A keyword as said and as offered: case and end punctuation aside.
fn norm(s: &str) -> String {
    s.trim().trim_end_matches(['.', '!', '?', ',']).to_lowercase()
}

/// The `[keywords]` a line offers.
fn offered(text: &str) -> Vec<String> {
    text.split('[').skip(1).filter_map(|r| r.split_once(']').map(|(k, _)| norm(k))).filter(|k| !k.is_empty()).collect()
}

/// Lower-cased words of three letters or more, the stop words out.
fn words(s: &str) -> Vec<String> {
    s.split(|c: char| !c.is_alphanumeric()).map(str::to_lowercase).filter(|w| w.len() >= 3 && !STOP.contains(&w.as_str())).collect()
}

fn is_talk(n: &Node) -> bool {
    matches!(n.kind, Kind::Greet | Kind::Ask)
}

/// The asked node of `npc` whose keyword is `kw`.
fn asked(nodes: &[Node], npc: &str, kw: &str) -> Option<usize> {
    nodes.iter().position(|n| n.kind == Kind::Ask && n.npc.as_deref() == Some(npc) && n.said.as_deref().map(norm).as_deref() == Some(kw))
}

fn keyword_edges(nodes: &[Node], out: &mut Vec<Edge>) {
    for (i, x) in nodes.iter().enumerate() {
        let Some(npc) = x.npc.as_deref() else { continue };
        for kw in offered(&x.reply()) {
            if let Some(j) = asked(nodes, npc, &kw) {
                out.push(Edge { from: i, to: j, why: "keyword", detail: format!("said [{kw}]") });
            }
        }
    }
}

/// The NPCs the nodes name, longest first, so `Old Doug` is read before `Doug`.
fn npc_names(nodes: &[Node]) -> Vec<String> {
    let mut names: Vec<String> = nodes.iter().filter_map(|n| n.npc.clone()).collect::<HashSet<_>>().into_iter().collect();
    names.sort_by(|a, b| b.len().cmp(&a.len()).then_with(|| a.cmp(b)));
    names
}

/// The names `text` mentions as whole words, each with where it ends; a longer name masks a shorter one
/// inside it (`Old Doug` hides its `Doug`), and `Dougrick` is no `Doug`.
fn mentions(text: &str, names: &[String]) -> Vec<(String, usize)> {
    let mut work: Vec<char> = text.chars().collect();
    let mut found = Vec::new();
    for n in names {
        let pat: Vec<char> = n.chars().collect();
        let mut at = 0;
        while at + pat.len() <= work.len() {
            let fits = work[at..at + pat.len()] == pat[..];
            let left = at == 0 || !work[at - 1].is_alphanumeric();
            let right = at + pat.len() == work.len() || !work[at + pat.len()].is_alphanumeric();
            if fits && left && right {
                found.push((n.clone(), at + pat.len()));
                work[at..at + pat.len()].iter_mut().for_each(|c| *c = ' ');
            }
            at += 1;
        }
    }
    found
}

/// `Doug for 'more work'` after the name: the asked node it sends the player to.
fn go_ask(nodes: &[Node], rest: &str, npc: &str) -> Option<(usize, String)> {
    let kw = rest.trim_start().strip_prefix("for '")?.split('\'').next()?;
    asked(nodes, npc, &norm(kw)).map(|j| (j, kw.to_string()))
}

/// The first talk of `npc` at or after `after` (else its first): where a mention of it leads.
fn entry(nodes: &[Node], npc: &str, after: i64) -> Option<usize> {
    let of = || nodes.iter().enumerate().filter(|(_, n)| is_talk(n) && n.npc.as_deref() == Some(npc));
    let later = |n: &Node| n.times.iter().copied().filter(|&t| t >= after).min();
    of().filter_map(|(i, n)| later(n).map(|t| (t, i))).min().map(|(_, i)| i).or_else(|| of().min_by_key(|(_, n)| n.first()).map(|(i, _)| i))
}

fn named_edges(nodes: &[Node], out: &mut Vec<Edge>) {
    let names = npc_names(nodes);
    for (i, x) in nodes.iter().enumerate().filter(|(_, n)| is_talk(n) || n.kind == Kind::HandIn) {
        let chars: Vec<char> = x.reply().chars().collect();
        for (n, end) in mentions(&x.reply(), &names) {
            if x.npc.as_deref() == Some(n.as_str()) {
                continue;
            }
            let rest: String = chars[end..].iter().collect();
            if let Some((j, kw)) = go_ask(nodes, &rest, &n) {
                out.push(Edge { from: i, to: j, why: "goask", detail: format!("go ask {n} for '{kw}'") });
                continue;
            }
            let buys: Vec<usize> = (0..nodes.len()).filter(|&j| nodes[j].kind == Kind::Buy && nodes[j].npc.as_deref() == Some(n.as_str())).collect();
            let targets = if buys.is_empty() { entry(nodes, &n, x.first()).into_iter().collect() } else { buys };
            out.extend(targets.into_iter().map(|j| Edge { from: i, to: j, why: "named", detail: format!("named {n}") }));
        }
    }
}

/// Words that name exactly one of `names`, with whose they are.
fn distinct_words(names: &[String]) -> HashMap<String, String> {
    let mut count: HashMap<String, (usize, String)> = HashMap::new();
    for n in names {
        for w in words(n).into_iter().collect::<HashSet<_>>() {
            let e = count.entry(w).or_insert((0, n.clone()));
            e.0 += 1;
        }
    }
    count.into_iter().filter(|(_, (c, _))| *c == 1).map(|(w, (_, n))| (w, n)).collect()
}

/// A mob a talk names by a word only its name carries ("the [fragile ones]" → a fragile pet).
fn mob_edges(nodes: &[Node], out: &mut Vec<Edge>) {
    let mobs: Vec<String> = nodes.iter().filter(|n| n.kind == Kind::Kill).filter_map(|n| n.mob.clone()).collect();
    let by_word = distinct_words(&mobs);
    for (i, x) in nodes.iter().enumerate().filter(|(_, n)| is_talk(n)) {
        let said: HashSet<String> = words(&x.reply()).into_iter().collect();
        for (w, mob) in &by_word {
            let kill = nodes.iter().position(|n| n.kind == Kind::Kill && n.mob.as_deref() == Some(mob.as_str()));
            if let (true, Some(j)) = (said.contains(w), kill) {
                out.push(Edge { from: i, to: j, why: "named", detail: format!("named {mob}") });
            }
        }
    }
}

/// The NPC first hailed after one of `x`'s times, within SENT_MS: where "go up the stairs" led.
fn next_hail(nodes: &[Node], hails: &[(String, i64)], x: &Node) -> Option<(usize, String)> {
    let mut best: Option<(i64, &String, i64)> = None;
    for &t in &x.times {
        for (n, h) in hails.iter().filter(|(n, h)| Some(n.as_str()) != x.npc.as_deref() && *h > t && h - t <= SENT_MS) {
            if best.is_none_or(|b| h - t < b.0) {
                best = Some((h - t, n, *h));
            }
        }
    }
    let (_, n, h) = best?;
    entry(nodes, n, h - ANSWER_MS).map(|j| (j, format!("went to {n}")))
}

fn sent_edges(nodes: &[Node], hails: &[(String, i64)], out: &mut Vec<Edge>) {
    let named: HashSet<usize> = out.iter().filter(|e| e.why == "named" || e.why == "goask").map(|e| e.from).collect();
    let by_word = distinct_words(&npc_names(nodes));
    for (i, x) in nodes.iter().enumerate().filter(|(i, n)| is_talk(n) && !named.contains(i)) {
        let text = x.reply();
        let Some(m) = INSTRUCTION.find(&text) else { continue };
        let phrase = text[m.start()..].split(['.', '!', '?']).next().unwrap_or_default();
        let own: Vec<String> = x.npc.as_deref().map(words).unwrap_or_default();
        let pointed = words(phrase).into_iter().filter(|w| !own.contains(w)).find_map(|w| by_word.get(&w).cloned());
        let target = match pointed {
            Some(n) => entry(nodes, &n, x.first()).map(|j| (j, format!("sent to {n}"))),
            // A greeting's "go home" sends nowhere, and an answer that still offers a [keyword] keeps the
            // talk going ("head down there and pick up my weekly [supplies]"): only an asked answer that
            // ends it is followed to whoever is hailed next.
            None if x.kind == Kind::Ask && offered(&text).is_empty() => next_hail(nodes, hails, x),
            None => None,
        };
        if let Some((j, detail)) = target {
            out.push(Edge { from: i, to: j, why: "sent", detail });
        }
    }
}

fn item_edges(nodes: &[Node], out: &mut Vec<Edge>) {
    for (j, h) in nodes.iter().enumerate().filter(|(_, n)| n.kind == Kind::HandIn) {
        for (i, g) in nodes.iter().enumerate().filter(|(_, n)| matches!(n.kind, Kind::Buy | Kind::Loot)) {
            let Some(item) = g.items.keys().find(|k| h.items.contains_key(*k)) else { continue };
            let from = g.npc.as_ref().map_or_else(|| format!("looted from {}", g.mob.as_deref().unwrap_or("?")), |n| format!("bought from {n}"));
            out.push(Edge { from: i, to: j, why: "item", detail: format!("{item}, {from}") });
        }
    }
    for (i, k) in nodes.iter().enumerate().filter(|(_, n)| n.kind == Kind::Kill) {
        for (j, l) in nodes.iter().enumerate().filter(|(_, n)| n.kind == Kind::Loot && n.mob == k.mob) {
            let item = l.items.keys().next().cloned().unwrap_or_default();
            out.push(Edge { from: i, to: j, why: "item", detail: format!("{item}, dropped by {}", k.mob.as_deref().unwrap_or("?")) });
        }
    }
}

/// Five-letter stems: `packaged` is the `Package` the NPC wants.
fn stems(s: &str) -> HashSet<String> {
    words(s).into_iter().map(|w| w.chars().take(5).collect()).collect()
}

fn return_edges(nodes: &[Node], out: &mut Vec<Edge>) {
    for (j, h) in nodes.iter().enumerate().filter(|(_, n)| n.kind == Kind::HandIn) {
        let Some(npc) = h.npc.as_deref() else { continue };
        let wanted: HashSet<String> = h.items.keys().flat_map(|i| stems(i)).filter(|w| !stems(npc).contains(w)).collect();
        let asks = nodes.iter().enumerate().filter(|(_, n)| is_talk(n) && n.npc.as_deref() == Some(npc) && n.first() < h.first());
        let best = asks.filter(|(_, n)| !stems(&n.reply()).is_disjoint(&wanted)).max_by_key(|(_, n)| n.first());
        if let Some((i, _)) = best {
            out.push(Edge { from: i, to: j, why: "return", detail: format!("back to {npc}") });
        }
    }
}
