//! Corpse coin per mob (review E3; owner, 2026-10-19): the range a mob page's `MONEY DROPS` block
//! states, from what the player's kills paid.
//!
//! Legends hands a kill's coin over AT the kill: `You receive 3 platinum, 5 gold and 8 copper from
//! the corpse.` prints just before the death line, in the same second, exactly as the faction
//! lines do (measured on the owner's log 2026-10-19: 5,576 of 5,689 coin lines claimed by a death
//! in the 2.5 s window). So a death claims ONE coin line read within KILL_COIN_MS before it, the
//! oldest still held (one corpse, one line; two deaths in a second each take their own).
//!
//! Every tier is one place (owner, 2026-10-19), and the coin agrees: on the owner's log the 32 mobs
//! killed 5+ times both in an instance tier and outside paid alike (a gorgon 3.9 platinum on average
//! outside, 4.2 inside; 2,162 tier lines, 3,392 open-world).
//!
//! NEVER "none". The game prints nothing for a kill that paid nothing and nothing for an empty
//! corpse, and some mobs pay rarely (a basilisk 2 kills in 103, both genuine), so no run of coinless
//! kills proves a mob drops no money. Only coin seen is served.

use crate::event::Event;
use crate::message_overlay::message_text_of;
use serde_json::{json, Value};
use std::collections::HashMap;

/// The faction window (`gaps_trade.rs` KILL_FACTION_MS): the coin line prints in the kill's second.
const KILL_COIN_MS: i64 = 2_500;
/// The page's order: platinum, gold, silver, copper.
const DENOMS: [&str; 4] = ["platinum", "gold", "silver", "copper"];

type Coins = [i64; 4];

/// `You receive 3 platinum, 5 gold and 8 copper from the corpse.` → `[3, 5, 0, 8]`.
pub fn corpse_coins(text: &str) -> Option<Coins> {
    let clause = text.strip_prefix("You receive ")?.strip_suffix(" from the corpse.")?;
    let mut out = [0; 4];
    let mut any = false;
    for part in clause.split(", ").flat_map(|p| p.split(" and ")) {
        let (n, denom) = part.trim().split_once(' ')?;
        let at = DENOMS.iter().position(|d| *d == denom)?;
        out[at] = n.replace(',', "").parse().ok()?;
        any = true;
    }
    any.then_some(out)
}

/// One mob's coin: how many kills paid, and each denomination's least and most.
struct Range {
    mob: String,
    n: u32,
    min: Coins,
    max: Coins,
}

#[derive(Default)]
pub struct KillCoin {
    /// Corpse coin lines not yet claimed by a death, with when they were read.
    pending: Vec<(Coins, i64)>,
    mobs: HashMap<String, Range>,
}

impl KillCoin {
    pub fn clear(&mut self) {
        self.pending.clear();
        self.mobs.clear();
    }

    /// A `coin` event: a corpse's coin is held for the death that follows it.
    pub fn line(&mut self, ev: &Event) {
        if ev.str("source") != Some("corpse") {
            return;
        }
        if let Some(c) = corpse_coins(message_text_of(ev.raw())) {
            self.pending.push((c, ev.ts()));
        }
    }

    /// A death claims the oldest coin line held within the window. True when one was recorded.
    pub fn death(&mut self, mob: &str, ts: i64) -> bool {
        self.pending.retain(|(_, at)| ts - at <= KILL_COIN_MS);
        if self.pending.is_empty() {
            return false;
        }
        let (coins, _) = self.pending.remove(0);
        let range = self.mobs.entry(mob.to_lowercase()).or_insert_with(|| Range {
            mob: mob.to_string(),
            n: 0,
            min: coins,
            max: coins,
        });
        range.n += 1;
        for ((lo, hi), c) in range.min.iter_mut().zip(range.max.iter_mut()).zip(coins) {
            *lo = (*lo).min(c);
            *hi = (*hi).max(c);
        }
        true
    }

    /// `[{mob, n, min: [p, g, s, c], max: [p, g, s, c]}]`, by mob.
    pub fn serve(&self) -> Value {
        let mut ranges: Vec<&Range> = self.mobs.values().collect();
        ranges.sort_by(|a, b| a.mob.cmp(&b.mob));
        let rows = ranges.iter().map(|r| json!({ "mob": r.mob, "n": r.n, "min": r.min, "max": r.max }));
        Value::Array(rows.collect())
    }
}

#[cfg(test)]
mod tests {
    use super::{corpse_coins, KillCoin};
    use crate::event::Event;

    fn coin(text: &str, ts: i64) -> Event<'static> {
        Event::from_json(&format!(
            r#"{{"kind":"coin","source":"corpse","ts":{ts},"seq":1,"raw":"[Tue Oct 06 18:20:21 2026] {text}"}}"#
        ))
        .expect("a JSON object")
    }

    #[test]
    fn every_coin_sentence_the_log_prints_reads_in_page_order() {
        assert_eq!(corpse_coins("You receive 7 copper from the corpse."), Some([0, 0, 0, 7]));
        assert_eq!(
            corpse_coins("You receive 3 platinum, 5 gold and 8 copper from the corpse."),
            Some([3, 5, 0, 8])
        );
        assert_eq!(
            corpse_coins("You receive 1 platinum, 2 gold, 3 silver and 4 copper from the corpse."),
            Some([1, 2, 3, 4])
        );
        assert_eq!(corpse_coins("You receive 4 silver and 1 copper from the corpse."), Some([0, 0, 4, 1]));
        assert_eq!(corpse_coins("You receive 2 platinum from Murga for the Bone Chips(s)."), None);
    }

    #[test]
    fn a_death_claims_one_coin_line_just_before_it_and_an_old_line_is_no_kills() {
        let mut k = KillCoin::default();
        k.line(&coin("You receive 9 copper from the corpse.", 1_000));
        k.line(&coin("You receive 4 silver and 1 copper from the corpse.", 1_000));
        assert!(k.death("a rabid kobold", 1_000));
        assert!(k.death("A rabid kobold", 1_000), "the second corpse takes the second line");
        assert!(!k.death("a rabid kobold", 2_000), "no line left: nothing recorded");
        k.line(&coin("You receive 1 gold from the corpse.", 6_000));
        assert!(!k.death("a rabid kobold", 60_000), "a line a minute old is no kill's");
        let served = k.serve();
        assert_eq!(served[0]["n"], 2);
        assert_eq!(served[0]["min"], serde_json::json!([0, 0, 0, 1]));
        assert_eq!(served[0]["max"], serde_json::json!([0, 0, 4, 9]));
    }
}
