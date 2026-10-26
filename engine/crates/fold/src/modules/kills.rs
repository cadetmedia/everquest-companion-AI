//! `src/main/modules/kills.ts` plus the pure core it reuses from `src/main/log/reducers.ts`
//! (`isCountedKill`, `recordKill`) and `src/shared/kills.ts` (`killTotals`).
//!
//! The four scalars are derived, never incremented: `tiers` is the record and `kill_totals` folds
//! it after every write, so `bestTier` and `lastTs` cannot describe two different kills.
//!
//! The credit join carries `progression.ts`'s exact semantics: an experience line claims BACKWARD
//! inside `KILL_EXP_JOIN_MS`, a claim CONSUMES the line, and every death line consumes — including
//! the ones this module does not count. An unclaimed older line is replaced rather than kept: a
//! stale line handed to a later kill is a fabricated attribution.
//!
//! The tier is the zone you were standing in. `zone.unwrap_or("")` is a real answer rather than a
//! fallback: a kill folded before the first `You have entered` may not claim d0, and
//! `zone_tier("")` is `TIER_UNKNOWN` for exactly that.
//!
//! A bare zone name is not always the open world — a base-difficulty raid or personal instance
//! prints the same bare `You have entered <zone>.` line the open world does. So this module
//! remembers the creating-instance notice, and it lives here rather than in `zone_tier`, which is a
//! pure fold of a NAME shared with other readers. Four properties keep the memory honest: it is
//! EVIDENCE, not proximity (a later bare re-entry with no fresh notice still stamps d0); it
//! overrides `TIER_OPEN_WORLD` and nothing else (d1-d4 and the suffixed d0 already state an
//! instance, and `TIER_UNKNOWN` stays unknown — law 1); it expires, checked at use so nothing has
//! to sweep; and it is character-scoped, cleared by the epoch alongside the KillMap.

use crate::event::Event;
use crate::jsfn::{starts_with_you_word, zone_id_key, zone_tier, TIER_OPEN_WORLD, TIER_UNKNOWN};
use crate::jsmap::JsMap;
use crate::knowledge::Knowledge;
use crate::EqModule;
use eqlog::names::{id_key, is_player_shaped_name};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

/// `shared/kills.ts KILLS_SHAPE_VERSION`.
const KILLS_SHAPE_VERSION: i64 = 5;

/// `shared/kills.ts KILL_EXP_JOIN_MS` — how far back a kill line may reach for the exp line that
/// credits it. Measured at 0–1 s; 2.5 s is slack over the observed spread, not a hunt.
const KILL_EXP_JOIN_MS: i64 = 2500;

/// How long a remembered creating-instance notice keeps answering for its zone.
///
/// Seven days is the weekly lockout period — the longest span over which the answer could still
/// matter. It is a bound on a memory, not a measurement: the game states nothing about when an
/// instance dies. Generous in the direction that costs least, since an expired notice just returns
/// the kill to the open world.
const INSTANCE_NOTICE_TTL_MS: i64 = 7 * 24 * 60 * 60 * 1000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KillTierRun {
    count: i64,
    first_ts: i64,
    last_ts: i64,
    credited: i64,
    last_credited_ts: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KillInfo {
    count: i64,
    best_tier: i64,
    first_ts: i64,
    last_ts: i64,
    credited: i64,
    display: String,
    tiers: JsMap<KillTierRun>,
}

#[derive(Default)]
pub struct KillsModule {
    kills: JsMap<KillInfo>,
    zone: Option<String>,
    seq: i64,
    /// The experience line the next kill line may claim — the timestamp is all this module needs.
    pending_exp_ts: Option<i64>,
    /// The instance memory — `zoneIdKey` of a zone seen to have an instance created, against the
    /// timestamp of the most recent such notice.
    ///
    /// A plain `HashMap` rather than a [`JsMap`]: nothing publishes it, so no iteration order of it
    /// is observable. The ordered map is only right where a `values()` walk reaches a snapshot.
    instances: HashMap<String, i64>,
    /// The announce cursor — see [`crate::announce`]. Only a recorded kill and a rebirth change the
    /// KillMap, which is the whole of `snapshot()`; the other four arms mutate state nobody reads.
    announce: crate::announce::Announce,
    /// Player-shaped names a pet line spoke for (claim, pet say, ally leader): a pet, never a mob.
    pets: HashSet<String>,
    /// The mob catalog, for a one-word killer that is a mob all the same (`Terror`).
    knowledge: Option<Arc<dyn Knowledge>>,
}

impl KillsModule {
    pub fn new() -> Self {
        Self::default()
    }

    /// The experience line this kill line claims, if any. Claiming CONSUMES it.
    fn take_exp(&mut self, ts: i64) -> bool {
        match self.pending_exp_ts.take() {
            Some(at) => ts >= at && ts - at <= KILL_EXP_JOIN_MS,
            None => false,
        }
    }

    /// A player or a pet died: the same rule the gaps module files players by, plus the pets the
    /// log named. Your own blow (`bySelf`) is always a kill.
    fn is_friendly_death(&self, ev: &Event) -> bool {
        let Some(name) = ev.str("name").filter(|_| !ev.bool("bySelf")) else {
            return false;
        };
        let known_mob = |k: &str| self.knowledge.as_ref().is_some_and(|kn| kn.known_mob(k));
        // A charmed named mob answers `/pet leader` too, and is a mob again once the charm breaks.
        let pet = self.pets.contains(&id_key(name)) && !known_mob(name);
        is_player_death(name, ev.str("killer"), known_mob) || pet
    }

    /// Is there a live creating-instance notice for this zone at `ts`?
    ///
    /// Reading rather than consuming, unlike [`Self::take_exp`] beside it: an experience line
    /// credits exactly one kill, while one instance holds a whole evening's clear. The window has
    /// the same shape as the credit join's, so a notice can never reach a kill that preceded it.
    fn inside_a_remembered_instance(&self, zone: &str, ts: i64) -> bool {
        match self.instances.get(&zone_id_key(zone)) {
            Some(&at) => ts >= at && ts - at <= INSTANCE_NOTICE_TTL_MS,
            None => false,
        }
    }
}

/// `shared/kills.ts killTotals` — the five scalars, folded from the per-tier runs.
///
/// `bestTier` seeds at the floor of the key ordering, not at 0: a record whose only runs are
/// open-world has no difficulty to report, and seeding 0 would claim a base-instance clear it never
/// made. Iteration order cannot move any of these (a max, a min, two sums).
fn kill_totals(tiers: &JsMap<KillTierRun>) -> (i64, i64, i64, i64, i64) {
    let mut count = 0;
    let mut best_tier = TIER_UNKNOWN;
    let mut first_ts = 0;
    let mut last_ts = 0;
    let mut credited = 0;
    for (key, run) in tiers.iter() {
        if run.count <= 0 {
            continue;
        }
        count += run.count;
        best_tier = best_tier.max(key.parse::<i64>().unwrap_or(0));
        first_ts = if first_ts != 0 {
            first_ts.min(run.first_ts)
        } else {
            run.first_ts
        };
        last_ts = last_ts.max(run.last_ts);
        credited += run.credited;
    }
    (count, best_tier, first_ts, last_ts, credited)
}

/// `main/log/reducers.ts recordKill`, in place.
fn record_kill(
    kills: &mut JsMap<KillInfo>,
    key: &str,
    display: &str,
    tier: i64,
    ts: i64,
    credited: bool,
) {
    if !kills.contains_key(key) {
        kills.insert(
            key.to_string(),
            KillInfo {
                count: 0,
                best_tier: 0,
                first_ts: 0,
                last_ts: 0,
                credited: 0,
                display: display.to_string(),
                tiers: JsMap::new(),
            },
        );
    }
    let k = kills.get_mut(key).expect("just inserted");
    let tier_key = tier.to_string();
    if !k.tiers.contains_key(&tier_key) {
        k.tiers.insert(
            tier_key.clone(),
            KillTierRun {
                count: 0,
                first_ts: ts,
                last_ts: ts,
                credited: 0,
                last_credited_ts: 0,
            },
        );
    }
    let run = k.tiers.get_mut(&tier_key).expect("just inserted");
    run.count += 1;
    run.first_ts = run.first_ts.min(ts);
    run.last_ts = run.last_ts.max(ts);
    if credited {
        run.credited += 1;
        // A max, not an assignment: a replay is chronological, but a fold must not depend on it.
        run.last_credited_ts = run.last_credited_ts.max(ts);
    }
    let (count, best_tier, first_ts, last_ts, cred) = kill_totals(&k.tiers);
    k.count = count;
    k.best_tier = best_tier;
    k.first_ts = first_ts;
    k.last_ts = last_ts;
    k.credited = cred;
}

impl EqModule for KillsModule {
    fn id(&self) -> &'static str {
        "kills"
    }

    fn reset(&mut self) {
        self.kills.clear();
        self.zone = None;
        self.seq = 0;
        self.pending_exp_ts = None;
        self.instances.clear();
        self.announce.reset();
        self.pets.clear();
    }

    fn on_event(&mut self, ev: &Event, _live: bool) {
        self.seq = ev.seq();
        match ev.kind() {
            "epoch" => {
                // Character rebirth: the KillMap belongs to the dead character, and so do the
                // instances it stood in — a notice names a player, and that player is gone.
                self.kills.clear();
                self.pending_exp_ts = None;
                self.instances.clear();
                self.pets.clear();
                self.announce.changed(self.seq);
                return;
            }
            "zone" => {
                self.zone = ev.str("zone").map(str::to_string);
                return;
            }
            "instanceCreate" => {
                if let Some(zone) = ev.str("zone") {
                    // A max, not an assignment: a replay is chronological, but a fold must not
                    // depend on it, and a late older notice must not un-refresh the entry.
                    let at = self.instances.entry(zone_id_key(zone)).or_insert(ev.ts());
                    *at = (*at).max(ev.ts());
                }
                return;
            }
            "expGain" => {
                self.pending_exp_ts = Some(ev.ts());
                return;
            }
            "petClaim" | "petSay" | "allyPetLeader" => {
                let pet = ev.str("name").or_else(|| ev.str("pet"));
                // An article-led name (a charmed `a gnoll`) is every other `a gnoll` too.
                if let Some(pet) = pet.filter(|p| is_player_shaped_name(p)) {
                    self.pets.insert(id_key(pet));
                }
                return;
            }
            "death" => {}
            _ => return,
        }
        // Consumed BEFORE the counted filter, as progression.ts does: the line belongs to the kill
        // it precedes whoever landed the blow, and leaving it pending would hand your experience to
        // the next mob that dies near you.
        let credited = self.take_exp(ev.ts());
        if !is_counted_kill(ev) || self.is_friendly_death(ev) {
            return;
        }
        let zone = self.zone.as_deref().unwrap_or("");
        let mut tier = zone_tier(zone).1;
        // The narrow override — see the header. Only this one answer moves.
        if tier == TIER_OPEN_WORLD && self.inside_a_remembered_instance(zone, ev.ts()) {
            tier = 0;
        }
        // Key by the canonical lowercase name so the two casings EQ emits for one mob fold into a
        // single entry; keep the raw name for display.
        let name = ev.str("name").unwrap_or_default();
        record_kill(
            &mut self.kills,
            &id_key(name),
            name,
            tier,
            ev.ts(),
            credited,
        );
        self.announce.changed(self.seq);
    }

    /// Moves on a counted kill, or a rebirth. See the `announce` field.
    fn published_seq(&self) -> Option<i64> {
        Some(self.announce.cursor())
    }

    fn snapshot(&self) -> Value {
        json!({
            "seq": self.seq,
            "state": { "v": KILLS_SHAPE_VERSION, "mobs": self.kills }
        })
    }

    fn install_knowledge(&mut self, k: &Arc<dyn Knowledge>) {
        self.knowledge = Some(Arc::clone(k));
    }
}

/// `main/log/reducers.ts isCountedKill` — self-slain always counts; slain-by counts only when the
/// killer isn't you.
fn is_counted_kill(ev: &Event) -> bool {
    if ev.bool("bySelf") {
        return true;
    }
    match ev.str("killer") {
        // An empty killer string is falsy in the TS and does not disqualify.
        Some(killer) if !killer.is_empty() => !starts_with_you_word(killer),
        _ => true,
    }
}

/// A player (or a player's pet) dying to a mob: a player-shaped victim the catalog does not name a
/// mob (`concard.rs con_card_is_player`), and a killer that is not player-shaped or that
/// `known_mob` names a mob anyway (`Terror`). Kills and gaps share it.
pub fn is_player_death(
    victim: &str,
    killer: Option<&str>,
    known_mob: impl Fn(&str) -> bool,
) -> bool {
    let killer_is_mob = killer.is_some_and(|k| !is_player_shaped_name(k) || known_mob(k));
    is_player_shaped_name(victim) && !known_mob(victim) && killer_is_mob
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::knowledge::{Answer, Miss, OwnLoot};

    /// A catalog that knows two one-word mobs and nothing else.
    struct Catalog;

    impl Knowledge for Catalog {
        fn item(&self, _name: &str) -> Answer {
            unreachable!("kills asks the catalog only")
        }
        fn identity_keys(&self, mob: &str) -> Vec<String> {
            vec![id_key(mob)]
        }
        fn mob(&self, _name: &str, _loot: &dyn OwnLoot) -> Answer {
            unreachable!("kills asks the catalog only")
        }
        fn known_mob(&self, name: &str) -> bool {
            matches!(id_key(name).as_str(), "trakanon" | "terror")
        }
        fn take_misses(&self) -> Vec<Miss> {
            Vec::new()
        }
    }

    fn fold(lines: &[&str]) -> Value {
        fold_with(KillsModule::new(), lines)
    }

    fn fold_with(mut m: KillsModule, lines: &[&str]) -> Value {
        for line in lines {
            m.on_event(&Event::from_json(line).expect("a JSON event"), false);
        }
        m.snapshot()["state"]["mobs"].clone()
    }

    fn fold_knowing(lines: &[&str]) -> Vec<String> {
        let mut m = KillsModule::new();
        m.install_knowledge(&(Arc::new(Catalog) as Arc<dyn Knowledge>));
        let mobs = fold_with(m, lines);
        mobs.as_object().expect("mobs").keys().cloned().collect()
    }

    /// A one-word named mob is a mob whoever kills it, and a pet line it spoke while charmed does
    /// not make it a pet for good.
    #[test]
    fn a_catalog_mob_dying_to_a_mob_or_after_a_pet_line_is_a_kill() {
        let keys = fold_knowing(&[
            r#"{"kind":"death","seq":1,"ts":1000,"raw":"d","name":"Trakanon","bySelf":false,"killer":"a goblin sentry"}"#,
            r#"{"kind":"allyPetLeader","seq":2,"ts":2000,"raw":"l","pet":"Terror","owner":"Malkil"}"#,
            r#"{"kind":"death","seq":3,"ts":3000,"raw":"d","name":"Terror","bySelf":false,"killer":"Rykkerr"}"#,
        ]);
        assert_eq!(keys, ["terror", "trakanon"]);
    }

    /// A pet named by the dead character is no pet of the next one.
    #[test]
    fn the_epoch_forgets_the_pets() {
        let mobs = fold(&[
            r#"{"kind":"petClaim","seq":1,"ts":1000,"raw":"p","name":"Gobekn","via":"leader"}"#,
            r#"{"kind":"epoch","seq":2,"ts":2000,"raw":"e"}"#,
            r#"{"kind":"death","seq":3,"ts":3000,"raw":"d","name":"Gobekn","bySelf":false,"killer":"Rykkerr"}"#,
        ]);
        let keys: Vec<&String> = mobs.as_object().expect("mobs").keys().collect();
        assert_eq!(keys, ["gobekn"], "{mobs}");
    }

    #[test]
    fn a_player_or_your_pet_dying_is_not_a_kill() {
        let mobs = fold(&[
            r#"{"kind":"petClaim","seq":1,"ts":1000,"raw":"p","name":"Gobekn","via":"leader"}"#,
            r#"{"kind":"death","seq":2,"ts":2000,"raw":"d","name":"Gonekn","bySelf":false,"killer":"a gnoll"}"#,
            r#"{"kind":"death","seq":3,"ts":3000,"raw":"d","name":"Gobekn","bySelf":false,"killer":"Terror"}"#,
            r#"{"kind":"death","seq":4,"ts":4000,"raw":"d","name":"a gnoll","bySelf":false,"killer":"Gobekn"}"#,
            r#"{"kind":"death","seq":5,"ts":5000,"raw":"d","name":"Fippy","bySelf":true}"#,
        ]);
        let keys: Vec<&String> = mobs.as_object().expect("mobs").keys().collect();
        assert_eq!(keys, ["a gnoll", "fippy"], "{mobs}");
    }
}
