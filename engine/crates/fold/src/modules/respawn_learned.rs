//! THE LEARNED EVIDENCE — every mob's same-stay gaps, kept for the wiki's respawn time (owner,
//! 2026-10-25: the wiki number from the player's own kills; gaps-tab's `respawnLearn.ts` reads it).
//!
//! `respawn.rs` decides what a gap is (a death to the mob's first sign of life, in one stay, a minute
//! or more); this keeps them. Every qualifying gap per mob is kept, the newest
//! `RESPAWN_MAX_LEARNED_GAPS`, because the respawn is a constant and the wiki number is the value
//! most of them agree on. The store has its own cap apart from the 800-mob history, so a mob camped
//! last week keeps what it taught while the history turns over with every trash pull since.
//!
//! Measured on the owner's logs (2026-10-25): the October log (105 MB) publishes 314 mobs, 3,026
//! gaps, 72 KB of snapshot, and the whole fold is no slower (28 s against 30 s before); the
//! August-October archive (334 MB), 433 mobs and 125 KB (85 s against 91 s). Those published
//! only mobs with three gaps; every mob with one is published since 2026-10-26, so an archive's
//! one or two can join another log's: a 68 MB copy of the October log went from 204 mobs and 47 KB
//! to 430 and 84 KB.

use crate::jsmap::JsMap;
use serde::Serialize;

/// Gaps kept per mob, newest.
const RESPAWN_MAX_LEARNED_GAPS: usize = 50;
/// Mobs remembered. One with a single gap counts too, since its third may come; at 50 gaps each, a
/// few hundred KB at the very worst. It also bounds what is published: every mob with a gap is, so
/// an archived log's one or two gaps can join the live log's (the reader asks for three).
const MAX_LEARNED_STORE: usize = 1_000;

/// One mob's gaps.
#[derive(Debug, Clone)]
struct LearnedGaps {
    key: String,
    display: String,
    zone: String,
    /// The death that ended its last gap, for the published order.
    last_ts: i64,
    /// Oldest first, capped at `RESPAWN_MAX_LEARNED_GAPS`.
    gaps: Vec<i64>,
}

/// What the wiki's own page states of a mob's respawn: the verbatim text, its ms when it is a
/// duration, and the page — as `respawn.rs` reads its committed floor.
pub struct WikiSays {
    pub text: String,
    pub ms: Option<i64>,
    pub page: String,
}

/// One mob's gaps as published, watched or not. Every gap is an upper bound on the respawn; the
/// reader looks for the value most of them agree on.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RespawnLearned {
    id: String,
    key: String,
    display: String,
    zone: String,
    /// Newest first.
    gaps_ms: Vec<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    wiki_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    wiki_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    wiki_page: Option<String>,
}

/// The store, by row id (`<zone key>::<mob key>`), in order of last learning.
#[derive(Debug, Clone, Default)]
pub struct LearnedStore {
    map: JsMap<LearnedGaps>,
}

impl LearnedStore {
    pub fn clear(&mut self) {
        self.map.clear();
    }

    /// One qualifying gap: the entry re-inserted so the order is the order of last learning, its gaps
    /// capped (oldest dropped), the store capped (least recently learned dropped).
    pub fn record(&mut self, id: &str, mob: (&str, &str, &str), last_ts: i64, gap: i64) {
        let (key, display, zone) = mob;
        let mut entry = match self.map.get(id) {
            Some(prior) => {
                let e = prior.clone();
                self.map.remove(id);
                e
            }
            None => LearnedGaps {
                key: key.to_string(),
                display: display.to_string(),
                zone: zone.to_string(),
                last_ts: 0,
                gaps: Vec::new(),
            },
        };
        entry.display = display.to_string();
        entry.last_ts = last_ts;
        entry.gaps.push(gap);
        if entry.gaps.len() > RESPAWN_MAX_LEARNED_GAPS {
            entry.gaps.remove(0);
        }
        self.map.insert(id.to_string(), entry);
        while self.map.len() > MAX_LEARNED_STORE {
            let Some(oldest) = self.map.keys().next().map(str::to_string) else {
                break;
            };
            self.map.remove(&oldest);
        }
    }

    /// Every mob with a gap, most recently learned first, each with what its wiki page says.
    pub fn published(&self, wiki: impl Fn(&str) -> Option<WikiSays>) -> Vec<RespawnLearned> {
        let mut entries: Vec<(&str, &LearnedGaps)> = self.map.iter().collect();
        entries.sort_by_key(|(_, e)| std::cmp::Reverse(e.last_ts));
        entries
            .into_iter()
            .map(|(id, e)| {
                let says = wiki(&e.key);
                RespawnLearned {
                    id: id.to_string(),
                    key: e.key.clone(),
                    display: e.display.clone(),
                    zone: e.zone.clone(),
                    gaps_ms: e.gaps.iter().rev().copied().collect(),
                    wiki_text: says.as_ref().map(|w| w.text.clone()),
                    wiki_ms: says.as_ref().and_then(|w| w.ms),
                    wiki_page: says.map(|w| w.page),
                }
            })
            .collect()
    }
}
