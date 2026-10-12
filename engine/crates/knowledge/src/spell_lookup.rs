//! `knowledge.spell` — one spell off the effective catalog. Apart from `lib.rs` so that file stays
//! under its recorded size.

use crate::Corpus;
use fold::knowledge::Answer;
use serde_json::{json, Value};

impl Corpus {
    /// One spell, from the effective catalog — `knowledge.spell`.
    ///
    /// Every field is copied across ONLY IF THE DB STATES IT (law 1), so an absent wiki field stays
    /// absent and the card never has to decide what a missing duration looks like.
    ///
    /// EXACT NAME MATCH ONLY, a stated limit rather than a bug: answering `Rune III` with `Rune`'s
    /// numbers needs the lineage block that would say out loud they are the line's, which is the
    /// named gap in the crate header. Without it, `found: false` is the honest answer.
    #[must_use]
    pub fn spell(&self, name: &str) -> Answer {
        let queried = name.trim();
        let db = eqlog::spelldb::shared();
        let wanted = queried.to_lowercase();
        let Some(entry) = db
            .spells
            .iter()
            .find(|s| s.name.trim().to_lowercase() == wanted)
        else {
            return Answer {
                record: json!({ "queried": queried, "found": false, "illusion": false }),
                found: false,
            };
        };
        let mut record = json!({
            "queried": queried,
            "name": entry.name,
            "found": true,
            "illusion": entry.illusion,
        });
        let mut state = |key: &str, value: Value| {
            if !value.is_null() {
                record[key] = value;
            }
        };
        state("durationText", json!(entry.duration_text));
        state("durationMs", json!(entry.duration_ms));
        state("targetType", json!(entry.target_type));
        state("spellType", json!(entry.spell_type));
        state("classes", json!(entry.classes));
        state("msgCastOnYou", json!(entry.msg_cast_on_you));
        state("msgCastOnOther", json!(entry.msg_cast_on_other));
        state("msgWearsOff", json!(entry.msg_wears_off));
        state("effects", json!(entry.effects));
        Answer {
            record,
            found: true,
        }
    }
}
