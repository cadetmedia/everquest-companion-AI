//! The details beside a gap row (owner ask, 2026-10-11): where the log named it, from whom, and
//! the lines the game actually printed. Apart from `gaps.rs` so that file stays under the ceiling.
//!
//! Every list is a tally of distinct values with counts, kept whole and SERVED capped: the eight
//! most frequent, with the number of distinct values beside them so a capped list still says how
//! much it left out. The samples are the last SAMPLES raw lines, as the bazaar keeps its quotes.
//! The zones list also carries `all`, every zone by name, so the tab's "this zone" filter
//! (owner ask, 2026-10-17) finds a row whatever zone it ranks the current one.
//!
//! A ZONE IS TALLIED ONLY BY AN EVENT THAT PLACES THE NAME: the loot line (its own disposition —
//! sold, depot, hoard, combined, currency — happens on that line and is fine), a purchase or
//! received line, a kill, a con, a cast. A later disposal (`You successfully destroyed …`, the one
//! such shape the parser emits) says what became of an item, not where it came from, so it adds
//! its disposition and its line and no zone — see [`Details::disposal`].
//!
//! What the events carry decides what is tallied. A loot line is always the player's own (there is
//! no "Soandso has looted" line), so who looted is not a list. A cast-begin line names the caster
//! and the spell and never a target.
//!
//! THE COIN IS READ OFF THE RAW LINE. The loot event says `sold` and no more, and the purchase
//! event's price is an object the fold's event reader does not hand out, so both prices come from
//! the line's own clause (`sold it for 2 gold 5 silver.`, `for  5 platinum 2 gold.`), normalised
//! to one spelling. A SALE ON LOOT IS NOT THE REAL PRICE: an item sold instantly, to no vendor, is
//! sold at a discount, so its amount is a floor, and the list is named so wherever it is shown.

use crate::event::Event;
use crate::jsfn::item_base_name;
use regex::Regex;
use serde::ser::{Serialize, Serializer};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, VecDeque};
use std::sync::OnceLock;

/// Entries served per list.
const LIST_CAP: usize = 8;
/// Raw lines kept per row, newest last.
const SAMPLES: usize = 3;

/// Distinct values with how often each was seen.
#[derive(Debug, Clone, Default)]
struct Tally(HashMap<String, u32>);

impl Tally {
    fn add(&mut self, value: &str) {
        let v = value.trim();
        if v.is_empty() {
            return;
        }
        *self.0.entry(v.to_string()).or_default() += 1;
    }

    /// `{ entries: [{ name, n }…], distinct }` — the LIST_CAP most frequent, ties by name; `None`
    /// when nothing was tallied, so the snapshot carries no empty lists.
    fn serve(&self) -> Option<Value> {
        if self.0.is_empty() {
            return None;
        }
        let mut all: Vec<(&String, &u32)> = self.0.iter().collect();
        all.sort_by(|a, b| b.1.cmp(a.1).then_with(|| a.0.cmp(b.0)));
        let entries: Vec<Value> = all
            .iter()
            .take(LIST_CAP)
            .map(|(name, n)| json!({ "name": name, "n": n }))
            .collect();
        Some(json!({ "entries": entries, "distinct": self.0.len() }))
    }
}

#[derive(Debug, Clone, Default)]
pub struct Details {
    /// The zone the fold was in when the line was read.
    zones: Tally,
    /// An item: the corpse it was looted from, or the merchant it was bought from.
    sources: Tally,
    /// An item: how the loot line disposed of it (`depot`, `sold`, `hoard`, `combined`, `currency`).
    dispositions: Tally,
    /// A mob: the items it was seen to drop — the `sources` edge from the other side.
    drops: Tally,
    /// A mob: what the /con said, `L50 indifferent`.
    cons: Tally,
    /// A mob: what killed it; `you` when the line was "You have slain", `nobody` for "died.".
    killers: Tally,
    /// A spell: who cast it, player-shaped names kept as they are; `you` for the player's own.
    casters: Tally,
    /// An item: what an instant sale on loot paid — a discounted floor, never the vendor price.
    sales: Tally,
    /// An item: what a purchase line paid, the whole stack's price.
    paid: Tally,
    /// The two above summed, in copper, so a row can say what it brought in all.
    sales_copper: i64,
    paid_copper: i64,
    samples: VecDeque<String>,
}

/// `4 platinum, 2 gold, 1 silver and 4 copper` → (`4 platinum 2 gold 1 silver 4 copper`, copper
/// total); `None` for `free` or a clause with no coin in it.
fn coin_of(clause: &str) -> Option<(String, i64)> {
    static TOKEN: OnceLock<Regex> = OnceLock::new();
    let token = TOKEN.get_or_init(|| {
        Regex::new(r"([0-9][0-9,]*) (platinum|gold|silver|copper)").expect("a valid pattern")
    });
    let mut words = Vec::new();
    let mut copper = 0i64;
    for m in token.captures_iter(clause) {
        let amount: i64 = m[1].replace(',', "").parse().ok()?;
        let per = match &m[2] {
            "platinum" => 1000,
            "gold" => 100,
            "silver" => 10,
            _ => 1,
        };
        copper += amount * per;
        words.push(format!("{amount} {}", &m[2]));
    }
    (!words.is_empty()).then(|| (words.join(" "), copper))
}

/// The coin a line printed after the last `marker`, up to the final full stop — see [`coin_of`].
fn price_of(raw: &str, marker: &str) -> Option<(String, i64)> {
    let at = raw.rfind(marker)? + marker.len();
    coin_of(raw[at..].trim().trim_end_matches('.'))
}

impl Details {
    /// One mention of the row's name on `ev`, read for the row's domain.
    pub fn record(&mut self, domain: &str, ev: &Event, zone: Option<&str>) {
        if let Some(z) = zone {
            self.zones.add(z);
        }
        match domain {
            "item" => self.item(ev),
            "mob" => self.mob(ev),
            "spell" => self.spell(ev),
            _ => {}
        }
        self.sample(ev);
    }

    /// A later disposal of the name — the disposition and the line, nothing placing it anywhere.
    pub fn disposal(&mut self, ev: &Event) {
        self.dispositions.add(ev.str("disposition").unwrap_or_default());
        self.sample(ev);
    }

    fn sample(&mut self, ev: &Event) {
        if self.samples.len() == SAMPLES {
            self.samples.pop_front();
        }
        self.samples.push_back(ev.raw().to_string());
    }

    fn item(&mut self, ev: &Event) {
        match ev.kind() {
            "loot" => {
                self.sources.add(ev.str("source").unwrap_or_default());
                self.dispositions.add(ev.str("disposition").unwrap_or_default());
                if let Some((coin, copper)) = price_of(ev.raw(), " and sold it for ") {
                    self.sales.add(&coin);
                    self.sales_copper += copper;
                }
            }
            "purchase" => {
                self.sources.add(ev.str("npc").unwrap_or_default());
                if let Some((coin, copper)) = price_of(ev.raw(), " for ") {
                    self.paid.add(&coin);
                    self.paid_copper += copper;
                }
            }
            _ => {}
        }
    }

    fn mob(&mut self, ev: &Event) {
        match ev.kind() {
            // An item at any tier is one item (owner, 2026-10-19).
            "loot" => self.drops.add(&item_base_name(ev.str("item").unwrap_or_default())),
            "consider" => {
                let level = ev.int("level").unwrap_or_default();
                let faction = ev.str("faction").unwrap_or_default();
                self.cons.add(&format!("L{level} {faction}"));
            }
            "death" => {
                let killer = if ev.bool("bySelf") {
                    "you"
                } else {
                    ev.str("killer").unwrap_or("nobody")
                };
                self.killers.add(killer);
            }
            _ => {}
        }
    }

    fn spell(&mut self, ev: &Event) {
        match ev.kind() {
            "castBegin" => self.casters.add("you"),
            "otherCastBegin" => self.casters.add(ev.str("caster").unwrap_or_default()),
            _ => {}
        }
    }
}

/// Only the lists that have something in them, then the samples.
impl Serialize for Details {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let mut out = Map::new();
        let lists = [
            ("zones", &self.zones),
            ("sources", &self.sources),
            ("dispositions", &self.dispositions),
            ("drops", &self.drops),
            ("cons", &self.cons),
            ("killers", &self.killers),
            ("casters", &self.casters),
            ("sales", &self.sales),
            ("paid", &self.paid),
        ];
        for (name, tally) in lists {
            if let Some(v) = tally.serve() {
                out.insert(name.to_string(), v);
            }
        }
        if let Some(zones) = out.get_mut("zones") {
            let mut all: Vec<&String> = self.zones.0.keys().collect();
            all.sort();
            zones["all"] = json!(all);
        }
        let sums = [("salesCopper", self.sales_copper), ("paidCopper", self.paid_copper)];
        for (name, copper) in sums {
            if copper > 0 {
                out.insert(name.to_string(), json!(copper));
            }
        }
        out.insert("samples".to_string(), json!(self.samples));
        Value::Object(out).serialize(s)
    }
}
