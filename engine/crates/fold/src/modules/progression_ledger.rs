//! `progression`'s coin and death columns.
//!
//! Coin is what the log says ARRIVED: every `coin` line whatever its source (corpse, a destroyed
//! item's payout, a merchant sale), plus the price auto-sold loot carried. The parser keeps no field
//! for that price, so it is read off the raw line. Deaths are counted as printed; a `slain by` a
//! groupmate is a charm, and is counted all the same.

use super::progression::cap_drop;
use crate::event::Event;
use serde::Serialize;

/// Coin lines run ~300 a day on the owner's log, so this covers months.
const COIN_CAP: usize = 20_000;
const DEATH_CAP: usize = 4_000;

/// The coin and death columns, flattened into `ProgressionSnap`.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ledger {
    coin_ts: Vec<i64>,
    /// The whole amount in copper (10 copper = 1 silver = 1/10 gold = 1/100 platinum).
    coin_copper: Vec<i64>,
    death_ts: Vec<i64>,
    /// The killer as the line named it; '' for the bare `You died.` shape.
    death_killer: Vec<String>,
    #[serde(skip)]
    dropped_coin: bool,
    #[serde(skip)]
    dropped_death: bool,
}

/// Σ of every `<n> <denomination>` pair in `text`, in copper. `None` when it states none.
fn copper_in(text: &str) -> Option<i64> {
    let words: Vec<&str> = text.split_whitespace().collect();
    let mut total = None;
    for pair in words.windows(2) {
        let per = match pair[1].trim_end_matches([',', '.']) {
            "platinum" => 1000,
            "gold" => 100,
            "silver" => 10,
            "copper" => 1,
            _ => continue,
        };
        if let Ok(n) = pair[0].replace(',', "").parse::<i64>() {
            total = Some(total.unwrap_or(0) + n * per);
        }
    }
    total
}

/// The line's text without its `[timestamp] ` prefix.
fn body(raw: &str) -> &str {
    raw.split_once("] ").map_or(raw, |(_, rest)| rest)
}

impl Ledger {
    /// Folds one event. True when a column moved.
    pub fn fold(&mut self, ev: &Event) -> bool {
        let copper = match ev.kind() {
            // Only the clause before `from`: a merchant's name or the item sold follows it.
            "coin" => copper_in(body(ev.raw()).split(" from ").next().unwrap_or_default()),
            "loot" if ev.str("disposition") == Some("sold") => ev
                .raw()
                .split_once(" sold it for ")
                .and_then(|(_, price)| copper_in(price)),
            "playerDeath" => return self.push_death(ev.ts(), ev.str("killer").unwrap_or_default()),
            _ => return false,
        };
        match copper {
            Some(c) if c > 0 => {
                self.coin_ts.push(ev.ts());
                self.coin_copper.push(c);
                true
            }
            _ => false,
        }
    }

    fn push_death(&mut self, ts: i64, killer: &str) -> bool {
        // A bare `You died.` within a second of a `slain by` line is the same death told twice.
        if killer.is_empty() && self.death_ts.last().is_some_and(|&t| ts - t <= 1000) {
            return false;
        }
        self.death_ts.push(ts);
        self.death_killer.push(killer.to_string());
        true
    }

    /// Enforce both caps. Returns how many entries went.
    pub fn trim(&mut self) -> i64 {
        let c = cap_drop(COIN_CAP, self.coin_ts.len());
        self.coin_ts.drain(0..c);
        self.coin_copper.drain(0..c);
        let d = cap_drop(DEATH_CAP, self.death_ts.len());
        self.death_ts.drain(0..d);
        self.death_killer.drain(0..d);
        self.dropped_coin |= c > 0;
        self.dropped_death |= d > 0;
        (c + d) as i64
    }

    /// The oldest instant both columns are still complete from, once either has dropped.
    pub fn floor(&self) -> Option<i64> {
        let coin = self.coin_ts.first().filter(|_| self.dropped_coin);
        let death = self.death_ts.first().filter(|_| self.dropped_death);
        coin.into_iter().chain(death).copied().max()
    }
}
