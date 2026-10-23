//! A mob's fight numbers for its page, estimated from the log (owner, 2026-10-23: "can we estimate
//! NPC HP attacks etc etc etc if we have 10 or more kills of the mob?"): fixed rules only.
//!
//! A FIGHT for a name opens at the first combat line naming it (a blow at it, a blow or a swing by
//! it, landed or not) and closes at its death line (`X died.`, `You have slain X!`, `X has been
//! slain by Y!`). Per fight:
//!
//!   * HP: every damage line with the mob as target, whoever dealt it (melee, spells, DoT ticks,
//!     damage shields, the player's own), summed to the death. Served as the median of the fights
//!     kept, never the max. Known biases: the killing blow's overkill counts in full (high), and
//!     damage the log never shows (another group's DoTs, an unseen healer on the mob) is missed or
//!     its heals uncounted (low or high).
//!   * swings: the most weapon swings the mob made in one log second (hits and misses alike, a
//!     parry, dodge, block or riposte against it included), for an "up to N" per round: the most
//!     that two fights or more reached, so one odd second does not set it.
//!
//! A fight counts toward HP and swings only when it was seen whole and alone: opened after a zone
//! line named the place (the log's first lines, before one, may be a fight already under way, and
//! their tier is unknown; nothing crosses a zone line, since zoning drops every open fight), at
//! least OVERLAP_MS after the last death of the same name
//! and with no line naming that name within OVERLAP_MS after its own death (two of one name fought
//! at once share their lines: neither total is one mob's), and never swinging at two targets in one
//! second (a round is at one target; two are two mobs). A fight with no line for FIGHT_IDLE_MS
//! is dropped (fled, left, reset).
//!
//! Hits (the page's `damage_per_hit`) are every melee blow the mob landed, weapon verbs only (a
//! kick or bash is a skill with its own damage; a cleave lands at weapon damage), in any fight; its
//! attack kinds are every verb it landed or tried. Its spells are never hits.
//!
//! TIERS ARE NEVER MIXED (owner, 2026-10-23: "+0 and +1, +2, +3, +4 all will have different HP,
//! because +4 will multiclass"): every number is kept per zone tier (open world and a base instance
//! are both the base, 0; an unknown tier keeps nothing), and the page reads the base alone.
//!
//! Bounded: per name and tier a few numbers, the verbs seen, and the last SAMPLES_KEPT fight totals.

use super::consider::mob_key;
use crate::event::Event;
use crate::jsfn::{zone_tier, TIER_UNKNOWN};
use eqlog::names::id_key_ref;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet, HashMap, VecDeque};

/// No line for a fight in this long and it is over without a death.
const FIGHT_IDLE_MS: i64 = 60_000;
/// Another fight of the same name this close to a death means two were fought at once.
const OVERLAP_MS: i64 = 6_000;
/// Fight totals kept per name and tier, newest last, for the median.
const SAMPLES_KEPT: usize = 101;
/// A class skill with damage of its own: kept as an attack kind, never a hit nor a swing.
const SKILL_VERBS: [&str; 9] = [
    "kick", "bash", "slam", "backstab", "frenzy", "flurry", "shoot", "strike", "smite",
];
/// Legends' cleave lands at weapon damage (`Guard S`Tal slashes Gonekn for 107`, `cleaves Gonekn for
/// 107`) but comes once a round beside it, as kick and bash do (`A lion tries to claw`, `to cleave`,
/// `to bash`, one second): a hit, never a swing of the round.
const BESIDE_ROUND: &str = "cleave";
/// Swings outside the mob's round: its riposte, its flurry, its rampage.
const OFF_ROUND: [&str; 3] = ["Riposte", "Flurry", "Rampage"];

/// The page's tier for a zone: the open world and a base instance are both the base.
fn base_tier(zone: &str) -> i64 {
    match zone_tier(zone).1 {
        TIER_UNKNOWN => TIER_UNKNOWN,
        t => t.max(0),
    }
}

/// A fight not yet over.
struct Open {
    tier: i64,
    last: i64,
    total: i64,
    clean: bool,
    /// The log second being counted, its swings so far and their target, and the most in any second.
    sec: i64,
    in_sec: u32,
    at: String,
    swings: u32,
}

impl Open {
    /// One swing of the mob's round. A round is at one target: swings at two in one second are two
    /// mobs of one name (measured: `a hill giant` at YOU and at Konantik in the same second), so
    /// the fight is no one mob's.
    fn swing(&mut self, ts: i64, target: &str) {
        if ts / 1000 != self.sec {
            (self.sec, self.in_sec) = (ts / 1000, 0);
            self.at.clear();
            self.at.push_str(target);
        } else if self.at != target {
            self.clean = false;
        }
        self.in_sec += 1;
        self.swings = self.swings.max(self.in_sec);
    }
}

/// A fight that ended in a death, waiting OVERLAP_MS to show it was fought alone.
struct Ended {
    tier: i64,
    total: i64,
    swings: u32,
    died: i64,
}

/// The most swings in a second a fight is counted up to; more reads as this.
const SWINGS_CAP: usize = 8;

/// One name at one tier.
#[derive(Default)]
struct TierFacts {
    kills: u32,
    /// Fights kept, and the last SAMPLES_KEPT of their totals.
    fights: u32,
    totals: VecDeque<i64>,
    hits: u32,
    hit_min: Option<i64>,
    hit_max: Option<i64>,
    attacks: BTreeSet<String>,
    /// Fights kept by the most swings they showed in one second.
    swings: [u32; SWINGS_CAP + 1],
}

impl TierFacts {
    fn kept(&mut self, e: &Ended) {
        self.fights += 1;
        if self.totals.len() == SAMPLES_KEPT {
            self.totals.pop_front();
        }
        self.totals.push_back(e.total);
        self.swings[(e.swings as usize).min(SWINGS_CAP)] += 1;
    }

    fn hit(&mut self, amount: i64) {
        self.hits += 1;
        self.hit_min = Some(self.hit_min.map_or(amount, |m| m.min(amount)));
        self.hit_max = Some(self.hit_max.map_or(amount, |m| m.max(amount)));
    }

    /// The most swings in one second that two fights or more showed: one odd second (a round
    /// landing on a second's edge, a stray line) is not the mob's round.
    fn swings_up_to(&self, ended: Option<&Ended>) -> Option<usize> {
        let extra = ended.map(|e| (e.swings as usize).min(SWINGS_CAP));
        (1..=SWINGS_CAP)
            .rev()
            .find(|&n| self.swings[n] + u32::from(extra == Some(n)) >= 2)
    }

    fn serve(&self, tier: i64, ended: Option<&Ended>) -> Value {
        let mut totals: Vec<i64> = self
            .totals
            .iter()
            .copied()
            .chain(ended.map(|e| e.total))
            .collect();
        totals.sort_unstable();
        let fights = self.fights + u32::from(ended.is_some());
        let mut v =
            json!({ "tier": tier, "kills": self.kills, "fights": fights, "attacks": self.attacks });
        if let Some(hp) = median(&totals) {
            v["hp"] = json!(hp);
        }
        if let (Some(lo), Some(hi)) = (self.hit_min, self.hit_max) {
            v["hits"] = json!(self.hits);
            v["hitMin"] = json!(lo);
            v["hitMax"] = json!(hi);
        }
        if let Some(n) = self.swings_up_to(ended) {
            v["swings"] = json!(n);
        }
        v
    }
}

fn median(sorted: &[i64]) -> Option<i64> {
    let n = sorted.len();
    match n {
        0 => None,
        _ if n % 2 == 1 => Some(sorted[n / 2]),
        _ => Some((sorted[n / 2 - 1] + sorted[n / 2] + 1) / 2),
    }
}

#[derive(Default)]
struct Mob {
    open: Option<Open>,
    ended: Option<Ended>,
    last_death: Option<i64>,
    tiers: BTreeMap<i64, TierFacts>,
}

impl Mob {
    /// A line naming the mob at `ts`: settles the fight that ended before it, then finds or opens
    /// the fight this line belongs to.
    fn touch(&mut self, ts: i64, tier: i64) -> Option<&mut Open> {
        self.settle(ts);
        if self
            .open
            .as_ref()
            .is_some_and(|o| ts - o.last > FIGHT_IDLE_MS)
        {
            self.open = None;
        }
        if self.open.is_none() {
            let alone = self.last_death.is_none_or(|d| ts - d >= OVERLAP_MS);
            let clean = alone && tier != TIER_UNKNOWN;
            self.open = Some(Open {
                tier,
                last: ts,
                total: 0,
                clean,
                sec: 0,
                in_sec: 0,
                at: String::new(),
                swings: 0,
            });
        }
        let open = self.open.as_mut()?;
        open.last = ts;
        Some(open)
    }

    /// The fight that ended last is kept once OVERLAP_MS passed with no line naming the mob.
    fn settle(&mut self, ts: i64) {
        let Some(e) = self.ended.take() else {
            return;
        };
        if ts - e.died >= OVERLAP_MS {
            self.tiers.entry(e.tier).or_default().kept(&e);
        }
    }

    fn died(&mut self, ts: i64, tier: i64) {
        self.settle(ts);
        let fight = self.open.take().filter(|o| ts - o.last <= FIGHT_IDLE_MS);
        let at = fight.as_ref().map_or(tier, |o| o.tier);
        if let Some(o) = fight.filter(|o| o.clean && o.total > 0) {
            self.ended = Some(Ended {
                tier: o.tier,
                total: o.total,
                swings: o.swings,
                died: ts,
            });
        }
        if at != TIER_UNKNOWN {
            self.tiers.entry(at).or_default().kills += 1;
        }
        self.last_death = Some(ts);
    }
}

pub struct MobFights {
    /// By the name lowercased (`id_key`), as the lines spell it.
    mobs: HashMap<String, Mob>,
    /// `mob_key` (a row's key) to the `id_key` above, filled once per name.
    keys: HashMap<String, String>,
    /// The current zone's tier (`base_tier`); unknown until the log's first zone line.
    tier: i64,
}

impl Default for MobFights {
    fn default() -> Self {
        Self {
            mobs: HashMap::new(),
            keys: HashMap::new(),
            tier: TIER_UNKNOWN,
        }
    }
}

impl MobFights {
    pub fn clear(&mut self) {
        *self = Self::default();
    }

    /// A new zone: its tier, and no fight carries over.
    pub fn zone(&mut self, zone: Option<&str>) {
        self.tier = base_tier(zone.unwrap_or(""));
        for m in self.mobs.values_mut() {
            m.open = None;
        }
    }

    fn mob(&mut self, name: &str) -> &mut Mob {
        let id = id_key_ref(name);
        if !self.mobs.contains_key(id.as_ref()) {
            self.keys.insert(mob_key(name), id.to_string());
            self.mobs.insert(id.to_string(), Mob::default());
        }
        self.mobs.get_mut(id.as_ref()).expect("just inserted")
    }

    /// The fight a line naming `name` belongs to (none for `You`).
    fn fight(&mut self, name: Option<&str>, ts: i64) -> Option<&mut Open> {
        let name = name.filter(|n| !n.is_empty() && *n != "You")?;
        let tier = self.tier;
        self.mob(name).touch(ts, tier)
    }

    /// A damage or miss line. Never announces: the numbers are served with the next kill.
    pub fn event(&mut self, ev: &Event) {
        let ts = ev.ts();
        let amount = ev.int("amount").unwrap_or(0);
        let hit = ev.kind() == "damage";
        if let Some(o) = self.fight(ev.str("target"), ts) {
            o.total += if hit { amount } else { 0 };
        }
        let Some(o) = self.fight(ev.str("attacker"), ts) else {
            return;
        };
        // The mob's own blow: only its melee, never a spell or a damage shield.
        if hit && ev.str("dtype") != Some("melee") {
            return;
        }
        let verb = ev.str("verb").unwrap_or("hit");
        let weapon = !SKILL_VERBS.contains(&verb);
        let in_round = weapon && verb != BESIDE_ROUND;
        let tier = o.tier;
        if in_round
            && !ev
                .arr_str("modifiers")
                .iter()
                .any(|m| OFF_ROUND.contains(m))
        {
            o.swing(ts, ev.str("target").unwrap_or(""));
        }
        let Some(name) = ev.str("attacker") else {
            return;
        };
        let facts = self.mob(name).tiers.entry(tier).or_default();
        if hit && weapon {
            facts.hit(amount);
        }
        if !facts.attacks.contains(verb) {
            facts.attacks.insert(verb.to_string());
        }
    }

    /// A death line: the fight's end and a kill at its tier.
    pub fn death(&mut self, ev: &Event) {
        if let Some(name) = ev.str("name").filter(|n| !n.is_empty()) {
            let (ts, tier) = (ev.ts(), self.tier);
            self.mob(name).died(ts, tier);
        }
    }

    /// A row's fight numbers by its key (`mob_key`), one entry per tier seen, base first:
    /// `[{tier, kills, fights, hp?, hitMin?, hitMax?, attacks, swings?}]`.
    pub fn of(&self, key: &str) -> Option<Value> {
        let m = self.mobs.get(self.keys.get(key)?)?;
        let ended = |t: i64| m.ended.as_ref().filter(|e| e.tier == t);
        let tiers: Vec<Value> = m
            .tiers
            .iter()
            .map(|(t, f)| f.serve(*t, ended(*t)))
            .collect();
        (!tiers.is_empty()).then_some(Value::Array(tiers))
    }
}

#[cfg(test)]
#[path = "gaps_fight_tests.rs"]
mod tests;
