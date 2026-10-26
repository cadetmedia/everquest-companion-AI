//! WHERE A CLOCK'S NUMBER COMES FROM — the committed wiki floor (`data/respawns.json`, the
//! `|respawn_time` of every page in the mob catalog, read once) and the estimate ladder it floors.
//! Out of `respawn.rs` (the factoring ratchet, JOS-523): the clocks and the learned evidence both
//! read the floor.

use serde::Deserialize;

/// One row of `data/respawns.json`. `seconds` is absent on roughly a fifth of the rows: the grammar
/// is a whitelist, so anything it cannot fully consume ("Triggered", "6-8 hours", "?") keeps its
/// verbatim text and states no number. A half-read duration would put a fabricated number on a
/// countdown.
#[derive(Debug, Clone, Deserialize)]
pub struct WikiRespawn {
    pub key: String,
    pub page: String,
    pub text: String,
    #[serde(default)]
    pub seconds: Option<i64>,
}

#[derive(Deserialize)]
struct WikiRespawnData {
    rows: Vec<WikiRespawn>,
}

/// Read straight out of `src/main/data/`: exactly one copy of the committed floor, so a re-scrape
/// reaches both readers at once.
const RESPAWNS_JSON: &str = include_str!("../../../../../src/main/data/respawns.json");

pub fn wiki() -> &'static std::collections::HashMap<String, WikiRespawn> {
    static WIKI: std::sync::OnceLock<std::collections::HashMap<String, WikiRespawn>> =
        std::sync::OnceLock::new();
    WIKI.get_or_init(|| {
        let data: WikiRespawnData =
            serde_json::from_str(RESPAWNS_JSON).expect("respawns.json is not readable");
        data.rows.into_iter().map(|r| (r.key.clone(), r)).collect()
    })
}

/// `resolveRespawn` — the estimate ladder. Rung 2 is FLOORED by rung 3 rather than averaged with it
/// (the smallest gap you measured is an upper bound, so the wiki lifting it is a correction); rung
/// 1 is never floored, because the user is looking at the spawn and the wiki describes another
/// server.
pub fn resolve_respawn(
    custom_ms: Option<i64>,
    observed_ms: Option<i64>,
    samples: i64,
    wiki_ms: Option<i64>,
) -> (Option<i64>, &'static str) {
    if let Some(c) = custom_ms {
        if c > 0 {
            return (Some(c), "custom");
        }
    }
    if let Some(o) = observed_ms {
        if o > 0 && samples > 0 {
            let floored = match wiki_ms {
                Some(w) => o.max(w),
                None => o,
            };
            return (Some(floored), "observed");
        }
    }
    if let Some(w) = wiki_ms {
        if w > 0 {
            return (Some(w), "wiki");
        }
    }
    (None, "none")
}
