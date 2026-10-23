//! Moving a recorded row to another source: a name the meter recorded as another player that a
//! `<Pet> says, 'My leader is <Player>.'` line has just shown to be that player's pet. Its damage moves
//! to the ally-pet row (`allypet:<owner>:<pet>`, `Pet (<pet>) - <Owner>`) in every fight it fought in
//! and in the zone session, instead of being dropped (owner, 2026-10-22: Malkil's pet Jeber vanished
//! from the Corrupted Kedgespawn fight once it named Malkil its leader). Into a row already there it is
//! summed. Apart from `state.rs` and `aggregate.rs`, which sit at their recorded sizes.

use super::aggregate::{Agg, CategoryStat, ModifierTally, SkillStat, SourceRef, SourceStat};
use super::state::EngineState;
use crate::jsmap::JsMap;

impl Agg {
    /// Move the `from` row to `to`: re-keyed and re-named when `to` has no row here, summed into it when
    /// it has. True when there was a row to move.
    pub fn move_out(&mut self, from: &str, to: &SourceRef) -> bool {
        let Some(mut row) = self.out.take(from) else {
            return false;
        };
        match self.out.get_mut(&to.id) {
            Some(into) => merge_source(into, row),
            None => {
                row.name = to.name.clone();
                row.kind = to.kind;
                self.out.insert(to.id.clone(), row);
            }
        }
        true
    }
}

impl EngineState {
    /// `retract_other`'s twin for a bind that names the row it belongs to: the same guards (a name the
    /// roster admitted is a person; a name never recorded has nothing to move), then the recorded row
    /// moves to `to` in the zone session, the open fight and every finished one.
    pub fn rekey_other(&mut self, name_key: &str, to: &SourceRef, why: &str) {
        if name_key.is_empty() || self.roster.admitted.contains(name_key) {
            return;
        }
        if !self.others.note_pet(name_key) || !self.others.is_recorded(name_key) {
            return;
        }
        self.others.forget(name_key);
        let id = format!("member:{name_key}");
        self.zone_agg.move_out(&id, to);
        if let Some(enc) = self.current.as_mut() {
            if enc.agg.move_out(&id, to) {
                enc.summary = None;
            }
        }
        for enc in &mut self.history {
            if enc.agg.move_out(&id, to) {
                enc.summary = None;
            }
        }
        let ts = self.last_activity_ts;
        self.log(
            ts,
            "charm",
            "info",
            format!(
                "➜ {name_key}: {why} - its recorded damage moved to {}",
                to.name
            ),
        );
    }
}

/// `from` summed into `into`. The attack-round grouper (`round_acc`) is kept as `into` had it: it holds
/// open sequences, not totals, and a pet's rounds before the bind read the same either way.
fn merge_source(into: &mut SourceStat, from: SourceStat) {
    into.total += from.total;
    into.hits += from.hits;
    into.crits += from.crits;
    into.ambiguous_hits += from.ambiguous_hits;
    into.ambiguous_total += from.ambiguous_total;
    into.misses += from.misses;
    for (a, b) in into.miss.iter_mut().zip(from.miss) {
        *a += b;
    }
    into.resists += from.resists;
    merge_skills(&mut into.by_skill, from.by_skill);
    for c in from.by_category.into_values() {
        merge_category(&mut into.by_category, c);
    }
    for (skill, seconds) in from.rounds.bucket {
        let to = into.rounds.bucket.entry(skill).or_default();
        for (second, hits) in seconds {
            *to.entry(second).or_insert(0) += hits;
        }
    }
    for m in from.mods.into_values() {
        merge_modifier(&mut into.mods, m);
    }
}

fn merge_skills(into: &mut JsMap<SkillStat>, from: JsMap<SkillStat>) {
    for s in from.into_values() {
        let Some(t) = into.get_mut(&s.name) else {
            into.insert(s.name.clone(), s);
            continue;
        };
        t.total += s.total;
        t.hits += s.hits;
        t.crits += s.crits;
        t.max = t.max.max(s.max);
        // 0 is "nothing landed yet" on either side (aggregate.rs `accrue_min`).
        t.min = match (t.min, s.min) {
            (0, m) | (m, 0) => m,
            (a, b) => a.min(b),
        };
        t.misses += s.misses;
        t.resists += s.resists;
    }
}

fn merge_category(into: &mut JsMap<CategoryStat>, c: CategoryStat) {
    let Some(t) = into.get_mut(&c.category) else {
        into.insert(c.category.clone(), c);
        return;
    };
    t.total += c.total;
    t.hits += c.hits;
    t.crits += c.crits;
    t.max = t.max.max(c.max);
    t.resists += c.resists;
    merge_skills(&mut t.by_skill, c.by_skill);
}

fn merge_modifier(into: &mut JsMap<ModifierTally>, m: ModifierTally) {
    let Some(t) = into.get_mut(&m.name) else {
        into.insert(m.name.clone(), m);
        return;
    };
    t.count += m.count;
    t.avoided += m.avoided;
    t.total += m.total;
}

#[cfg(test)]
mod tests {
    use super::super::CombatEngine;
    use crate::event::Event;

    fn fold(lines: &[String]) -> CombatEngine {
        let mut e = CombatEngine::new();
        e.set_player_name("Primitive");
        for line in lines {
            let ev = Event::from_json(line).expect("a JSON object");
            e.on_event(&ev, false, None);
        }
        e
    }

    fn hit(seq: i64, ts: i64, attacker: &str, mob: &str, amount: i64) -> String {
        format!(
            r#"{{"kind":"damage","seq":{seq},"ts":{ts},"raw":"d","attacker":"{attacker}","target":"{mob}","amount":{amount},"dtype":"spell","skill":"Water Elemental Attack","crit":false}}"#
        )
    }

    fn death(seq: i64, ts: i64, mob: &str) -> String {
        format!(
            r#"{{"kind":"death","seq":{seq},"ts":{ts},"raw":"x","name":"{mob}","bySelf":true}}"#
        )
    }

    fn leader(seq: i64, ts: i64, owner: &str) -> String {
        format!(
            r#"{{"kind":"allyPetLeader","seq":{seq},"ts":{ts},"raw":"l","pet":"Jeber","owner":"{owner}"}}"#
        )
    }

    /// Two fights Jeber fought in before it named its leader: one finished, one still open.
    fn fights() -> Vec<String> {
        vec![
            r#"{"kind":"zone","seq":0,"ts":1000,"raw":"z","zone":"Lake Nerius"}"#.to_string(),
            hit(1, 2_000, "You", "Corrupted Kedgespawn", 300),
            hit(2, 2_500, "Jeber", "Corrupted Kedgespawn", 162),
            death(3, 3_000, "Corrupted Kedgespawn"),
            hit(4, 200_000, "You", "a ghost gill", 100),
            hit(5, 200_500, "Jeber", "a ghost gill", 219),
        ]
    }

    fn total(agg: &super::Agg, id: &str) -> Option<i64> {
        agg.out.get(id).map(|s| s.total)
    }

    /// Owner, 2026-10-22: Malkil's pet Jeber vanished from the Corrupted Kedgespawn fight once it said
    /// "My leader is Malkil". Its damage moves to the ally-pet row there, in the open fight and in the
    /// zone session; no fight loses a point.
    #[test]
    fn a_leader_line_moves_the_pets_recorded_damage_to_its_ally_pet_row() {
        let mut lines = fights();
        lines.push(leader(6, 201_000, "Malkil"));
        let e = fold(&lines);
        let st = e.st.borrow();
        let pet = "allypet:malkil:jeber";
        let done = st.history.last().expect("the finished fight");
        assert_eq!(total(&done.agg, "member:jeber"), None);
        assert_eq!(total(&done.agg, pet), Some(162));
        assert_eq!(
            done.agg.out.get(pet).map(|s| s.name.as_str()),
            Some("Pet (Jeber) - Malkil")
        );
        let open = st.current.as_ref().expect("the open fight");
        assert_eq!(total(&open.agg, pet), Some(219));
        assert_eq!(total(&st.zone_agg, pet), Some(162 + 219));
        assert_eq!(total(&st.zone_agg, "member:jeber"), None);
    }

    /// A leader line the ally model refuses (it names the player) keeps today's behaviour: the row
    /// recorded as another player is dropped, and no ally-pet row appears.
    #[test]
    fn a_refused_bind_still_drops_the_recorded_row() {
        let mut lines = fights();
        lines.push(leader(6, 201_000, "Primitive"));
        let e = fold(&lines);
        let st = e.st.borrow();
        assert_eq!(total(&st.zone_agg, "member:jeber"), None);
        assert!(st.zone_agg.out.keys().all(|k| !k.starts_with("allypet:")));
    }

    /// Into a row already there, a moved row is summed and its lanes merged (max the larger, min the
    /// smaller landed); into none it is re-keyed and re-named.
    #[test]
    fn move_out_sums_into_an_existing_row_and_rekeys_into_none() {
        use super::super::aggregate::{new_source, Agg, SkillStat, SourceKind, SourceRef};
        let lane = |name: &str, total: i64, max: i64, min: i64| SkillStat {
            name: name.to_string(),
            total,
            hits: 1,
            max,
            min,
            ..SkillStat::default()
        };
        let row = |total: i64, l: SkillStat| {
            let mut s = new_source("x", SourceKind::Other);
            s.total = total;
            s.hits = 1;
            s.by_skill.insert(l.name.clone(), l);
            s
        };
        let to = SourceRef {
            id: "allypet:malkil:jeber".to_string(),
            name: "Pet (Jeber) - Malkil".to_string(),
            kind: SourceKind::AllyPet,
        };
        let mut agg = Agg::new();
        agg.out.insert(
            "member:jeber".to_string(),
            row(162, lane("Slash", 162, 162, 162)),
        );
        agg.out
            .insert(to.id.clone(), row(219, lane("Slash", 219, 219, 219)));
        assert!(agg.move_out("member:jeber", &to));
        let got = agg.out.get(&to.id).expect("merged");
        assert_eq!((got.total, got.hits), (381, 2));
        let slash = got.by_skill.get("Slash").expect("lane");
        assert_eq!((slash.total, slash.max, slash.min), (381, 219, 162));
        assert!(!agg.out.contains_key("member:jeber"));
        let mut lone = Agg::new();
        lone.out.insert(
            "member:jeber".to_string(),
            row(162, lane("Slash", 162, 162, 162)),
        );
        assert!(lone.move_out("member:jeber", &to));
        let moved = lone.out.get(&to.id).expect("re-keyed");
        assert_eq!(
            (moved.name.as_str(), moved.kind, moved.total),
            ("Pet (Jeber) - Malkil", SourceKind::AllyPet, 162)
        );
        assert!(!lone.move_out("member:nobody", &to));
    }

    /// After the bind the pet's damage books on the ally-pet row directly.
    #[test]
    fn a_moved_row_is_summed_into_an_existing_one() {
        let mut lines = fights();
        lines.push(leader(6, 201_000, "Malkil"));
        // After the bind Jeber's damage books on the ally-pet row; a second other row under the same
        // name, moved again, sums into it.
        lines.push(hit(7, 201_500, "Jeber", "a ghost gill", 50));
        let e = fold(&lines);
        let st = e.st.borrow();
        assert_eq!(
            total(&st.zone_agg, "allypet:malkil:jeber"),
            Some(162 + 219 + 50)
        );
    }
}
