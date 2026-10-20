//! What a mob was seen to do, for the NPC page's `| special` (review 2026-10-19, E2). EQ Legends
//! prints `(Rampage)` and `(Flurry)` on the mob's own attack lines, and the parser already hands
//! them over as `modifiers`; nothing kept them per mob. Only what the log states: no guess at
//! Summons, Enrage or an immunity, which Legends never prints.

use crate::event::Event;
use crate::modules::resist::world::is_player_shaped_name;
use serde_json::{json, Value};
use std::collections::{BTreeSet, HashMap};

/// The modifier word a line carries → the word the wiki's `special` uses.
const SPECIALS: [(&str, &str); 2] = [("Rampage", "Rampages"), ("Flurry", "Flurries")];

#[derive(Default)]
pub struct MobSpecials {
    /// Lower-cased mob → its display name and what it did.
    seen: HashMap<String, (String, BTreeSet<&'static str>)>,
}

impl MobSpecials {
    pub fn clear(&mut self) {
        self.seen.clear();
    }

    /// A damage or miss line: a mob-shaped attacker's Rampage or Flurry. True when it was new.
    pub fn event(&mut self, ev: &Event) -> bool {
        let Some(attacker) = ev.str("attacker") else {
            return false;
        };
        if attacker == "You" || attacker.ends_with(" pet") || is_player_shaped_name(attacker) {
            return false;
        }
        let mods = ev.arr_str("modifiers");
        let mut changed = false;
        for (word, special) in SPECIALS {
            if mods.contains(&word) {
                let entry = self
                    .seen
                    .entry(attacker.to_lowercase())
                    .or_insert_with(|| (attacker.to_string(), BTreeSet::new()));
                changed |= entry.1.insert(special);
            }
        }
        changed
    }

    /// `[{mob, specials: ["Flurries"]}]`, by mob.
    pub fn serve(&self) -> Value {
        let mut rows: Vec<&(String, BTreeSet<&'static str>)> = self.seen.values().collect();
        rows.sort_by(|a, b| a.0.cmp(&b.0));
        Value::Array(
            rows.iter()
                .map(|(mob, s)| json!({ "mob": mob, "specials": s }))
                .collect(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::MobSpecials;
    use crate::event::Event;

    #[test]
    fn a_mobs_rampage_and_flurry_are_kept_and_a_players_are_not() {
        let mut s = MobSpecials::default();
        let ev = |json: &str| Event::from_json(json).expect("json");
        assert!(s.event(&ev(r#"{"kind":"damage","attacker":"Lord of Ire","modifiers":["Flurry"],"seq":1,"ts":1,"raw":"x"}"#)));
        assert!(!s.event(&ev(r#"{"kind":"damage","attacker":"Lord of Ire","modifiers":["Flurry"],"seq":2,"ts":2,"raw":"x"}"#)));
        assert!(!s.event(&ev(r#"{"kind":"damage","attacker":"Ganer","modifiers":["Rampage"],"seq":3,"ts":3,"raw":"x"}"#)));
        assert!(!s.event(&ev(
            r#"{"kind":"damage","attacker":"You","modifiers":["Rampage"],"seq":4,"ts":4,"raw":"x"}"#
        )));
        assert_eq!(
            s.serve(),
            serde_json::json!([{ "mob": "Lord of Ire", "specials": ["Flurries"] }])
        );
    }
}
