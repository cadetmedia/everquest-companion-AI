//! The bazaar: what players asked and offered for items in trade chat, per day, per item, per
//! direction (owner ask, 2026-10-06).
//!
//! Chat reaches the fold as `unknown` lines; this reads the ones a player spoke on a channel, in an
//! auction or out of character, and hands the message to [`super::bazaar_parse`]. Item names come
//! from the installed knowledge, so nothing is read until it is installed.
//!
//! A seller repeats the same offer every few minutes, so within a day one speaker's offer of one
//! item at one price counts once. The day is the log's own date, read off the line, so it is the
//! player's calendar day and never shifts with a time zone.

use super::bazaar_parse::{parse_trade, Dir, ItemIndex, Offer};
use crate::event::Event;
use crate::knowledge::Knowledge;
use crate::message_overlay::message_text_of;
use crate::EqModule;
use regex::Regex;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashSet, VecDeque};
use std::sync::{Arc, OnceLock};

/// One day's offers for one item, tier and direction.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BazaarRow {
    day: String,
    dir: &'static str,
    item: String,
    tier: u32,
    /// Offers that stated a price.
    n: u32,
    /// Offers that stated none ("WTB Fleeting Quiver pst").
    unpriced: u32,
    min: Option<f64>,
    max: Option<f64>,
    /// Of the priced offers, for the average.
    sum: f64,
    /// Every priced offer's platinum per unit, in log order, for medians and outliers.
    prices: Vec<f64>,
    /// Who said it and what they said: one quote per person, their newest, the latest QUOTES_KEPT people.
    quotes: Vec<Quote>,
}

/// One counted offer as it was said: the "who's offering" list.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Quote {
    /// The log's time of day, `17:54:48`.
    at: String,
    who: String,
    /// Platinum per unit, when the offer stated a price.
    price: Option<f64>,
    /// The whole chat message, cut at QUOTE_CHARS.
    msg: String,
}

/// The latest QUOTES_KEPT people quoted per row (owner, 2026-10-07): one quote a person, their
/// newest, so a seller posting all day never crowds out the others.
const QUOTES_KEPT: usize = 20;
const QUOTE_CHARS: usize = 200;

/// One offer heard live, newest last: what a watch alert is raised from.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveOffer {
    seq: i64,
    /// The log's own stamp, `2026-09-23 17:54:48`.
    at: String,
    speaker: String,
    dir: &'static str,
    item: String,
    tier: u32,
    /// Platinum per unit, when the offer stated a price.
    price: Option<f64>,
}

/// Live offers kept for the watch alerts; older ones have been alerted on already.
const LIVE_KEEP: usize = 100;

type Key = (String, Dir, String, u32);

#[derive(Default)]
pub struct BazaarModule {
    index: Option<ItemIndex>,
    rows: BTreeMap<Key, BazaarRow>,
    /// Today's (speaker, direction, item, tier, price in hundredths of a platinum) already counted.
    seen: HashSet<(String, Dir, String, u32, i64)>,
    seen_day: String,
    live: VecDeque<LiveOffer>,
    seq: i64,
    announce: crate::announce::Announce,
}

impl BazaarModule {
    pub fn new() -> Self {
        Self::default()
    }

    fn clear(&mut self) {
        self.rows.clear();
        self.seen.clear();
        self.seen_day.clear();
        self.live.clear();
    }

    fn fold_line(&mut self, raw: &str, live: bool) -> bool {
        let Some(ix) = self.index.as_ref() else {
            return false;
        };
        let Some((speaker, msg)) = chat_of(message_text_of(raw)) else {
            return false;
        };
        let Some(day) = day_of(raw) else {
            return false;
        };
        let offers = parse_trade(msg, ix);
        if day != self.seen_day {
            self.seen.clear();
            self.seen_day = day.clone();
        }
        let mut changed = false;
        for o in offers {
            // An offer read through a guess is listed, unpriced, and never counted (Offer::sure).
            let unit = o.unit_pp().filter(|_| o.sure);
            let cents = unit.map_or(-1, |p| (p * 100.0).round() as i64);
            let first = (speaker.to_lowercase(), o.dir, o.item.clone(), o.tier, cents);
            if !self.seen.insert(first) {
                continue;
            }
            if live && o.sure {
                self.hear(raw, speaker, &o);
            }
            let key = (day.clone(), o.dir, o.item, o.tier);
            let row = self.rows.entry(key).or_insert_with_key(|k| BazaarRow {
                day: k.0.clone(),
                dir: k.1.as_str(),
                item: k.2.clone(),
                tier: k.3,
                ..BazaarRow::default()
            });
            if o.sure {
                add(row, unit);
            }
            quote(
                &mut row.quotes,
                Quote {
                    at: time_of(raw).unwrap_or_default(),
                    who: speaker.to_string(),
                    price: unit,
                    msg: msg.chars().take(QUOTE_CHARS).collect(),
                },
            );
            changed = true;
        }
        changed
    }
}

impl BazaarModule {
    fn hear(&mut self, raw: &str, speaker: &str, o: &Offer) {
        if self.live.len() == LIVE_KEEP {
            self.live.pop_front();
        }
        self.live.push_back(LiveOffer {
            seq: self.seq,
            at: stamp_of(raw).unwrap_or_default(),
            speaker: speaker.to_string(),
            dir: o.dir.as_str(),
            item: o.item.clone(),
            tier: o.tier,
            price: o.unit_pp(),
        });
    }
}

/// A person's newest quote replaces their earlier one; past QUOTES_KEPT people, the oldest goes.
fn quote(quotes: &mut Vec<Quote>, q: Quote) {
    quotes.retain(|x| !x.who.eq_ignore_ascii_case(&q.who));
    quotes.push(q);
    if quotes.len() > QUOTES_KEPT {
        quotes.remove(0);
    }
}

fn add(row: &mut BazaarRow, unit: Option<f64>) {
    let Some(p) = unit else {
        row.unpriced += 1;
        return;
    };
    row.n += 1;
    row.sum += p;
    row.prices.push(p);
    row.min = Some(row.min.map_or(p, |m| m.min(p)));
    row.max = Some(row.max.map_or(p, |m| m.max(p)));
}

/// `Leric tells General:1, 'WTS …'` → the speaker and the message. Also auctions, shouts and
/// out-of-character speech, and the player's own lines (`You tell General:1, '…'`).
fn chat_of(text: &str) -> Option<(&str, &str)> {
    static CHAT: OnceLock<Regex> = OnceLock::new();
    let rx = CHAT.get_or_init(|| {
        Regex::new(r"^([A-Za-z`]+) (?:tells? [A-Za-z0-9]+:\d+|auctions?|shouts?|says? out of character), '(.*)'\s*$")
            .expect("a valid pattern")
    });
    let c = rx.captures(text)?;
    Some((c.get(1)?.as_str(), c.get(2)?.as_str()))
}

/// `[Wed Sep 23 17:54:48 2026] …` → `17:54:48`.
fn time_of(raw: &str) -> Option<String> {
    Some(
        raw.strip_prefix('[')?
            .split_whitespace()
            .nth(3)?
            .to_string(),
    )
}

/// `[Wed Sep 23 17:54:48 2026] …` → `2026-09-23 17:54:48`.
fn stamp_of(raw: &str) -> Option<String> {
    Some(format!("{} {}", day_of(raw)?, time_of(raw)?))
}

/// `[Wed Sep 23 17:54:48 2026] …` → `2026-09-23`.
fn day_of(raw: &str) -> Option<String> {
    const MONTHS: [&str; 12] = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    let stamp = raw.strip_prefix('[')?.split(']').next()?;
    let parts: Vec<&str> = stamp.split_whitespace().collect();
    let [_, month, day, _, year] = parts.as_slice() else {
        return None;
    };
    let m = MONTHS.iter().position(|x| x == month)? + 1;
    let d: u32 = day.parse().ok()?;
    Some(format!("{year}-{m:02}-{d:02}"))
}

impl EqModule for BazaarModule {
    fn id(&self) -> &'static str {
        "bazaar"
    }

    fn reset(&mut self) {
        self.clear();
        self.seq = 0;
        self.announce.reset();
    }

    fn on_event(&mut self, ev: &Event, live: bool) {
        self.seq = ev.seq();
        if ev.kind() == "epoch" {
            self.clear();
            self.announce.changed(self.seq);
            return;
        }
        if ev.kind() == "unknown" && self.fold_line(ev.raw(), live) {
            self.announce.changed(self.seq);
        }
    }

    /// Moves when a counted offer lands. See [`crate::announce`].
    fn published_seq(&self) -> Option<i64> {
        Some(self.announce.cursor())
    }

    fn snapshot(&self) -> Value {
        let rows: Vec<&BazaarRow> = self.rows.values().collect();
        json!({ "seq": self.seq, "state": { "rows": rows, "live": self.live } })
    }

    fn install_knowledge(&mut self, k: &Arc<dyn Knowledge>) {
        self.index = Some(ItemIndex::new(k.item_names()));
    }
}

#[cfg(test)]
#[path = "bazaar_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "bazaar_corpus_tests.rs"]
mod corpus_tests;
