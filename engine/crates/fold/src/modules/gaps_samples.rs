//! The proof behind each kill-faction pair the Gaps tab checks (owner, 2026-10-20: "how do I know
//! it has Grobb Merchants?"): a pair's last kills' raw lines, each the faction line then the death
//! line, verbatim with their stamps. Its own module, `killFactionSamples`, beside `gaps`.
//!
//! WHY APART (perf review, 2026-10-20, finding 2). The lines were served inside `gaps`'s
//! `killFactions` and were most of every Gaps fetch: 458 of 951 KB on the owner's October log,
//! re-sent on every hail, con, loot and kill. Only an open faction row, a Copy and the saved and
//! archived Gaps files read them, so they are asked for only then, and `gaps` serves the pairs'
//! counts and amounts alone (`gaps_trade.rs`).
//!
//! THE SAME PAIRING. A death claims the faction lines read within `KILL_FACTION_MS` before it, and
//! a death without a name claims none and leaves them held, exactly as `KillFactions` pairs them, so
//! the two modules name the same pairs. This one folds whether or not the knowledge is installed:
//! a pair `gaps` never names is simply never asked for.

use super::gaps_trade::{faction_of, KILL_FACTION_MS};
use crate::event::Event;
use crate::message_overlay::message_text_of;
use crate::EqModule;
use serde_json::{json, Value};
use std::collections::HashMap;

/// The proof a pair keeps: its last three kills, each the faction line then the death line.
const KILL_FACTION_SAMPLES: usize = 6;

/// One pair's proof, under the spellings it was first seen with.
struct Proof {
    mob: String,
    faction: String,
    samples: Vec<String>,
}

#[derive(Default)]
pub struct KillFactionSamplesModule {
    /// Faction lines not yet claimed by a death: the faction, when it was read, and the raw line.
    pending: Vec<(String, i64, String)>,
    /// By case-folded (mob, faction), as `KillFactions` keys its pairs.
    pairs: HashMap<(String, String), Proof>,
    seq: i64,
    announce: crate::announce::Announce,
}

impl KillFactionSamplesModule {
    pub fn new() -> Self {
        Self::default()
    }

    fn clear(&mut self) {
        self.pending.clear();
        self.pairs.clear();
    }

    /// A faction line, held for the death that follows it.
    fn line(&mut self, ev: &Event) {
        if let Some((f, _, _)) = faction_of(message_text_of(ev.raw())) {
            self.pending
                .push((f.to_string(), ev.ts(), ev.raw().to_string()));
        }
    }

    /// A named death claims the held lines; true when a pair took a line.
    fn death(&mut self, ev: &Event) -> bool {
        let Some(mob) = ev.str("name") else {
            return false;
        };
        let mut any = false;
        for (faction, at, line) in std::mem::take(&mut self.pending) {
            if ev.ts() - at > KILL_FACTION_MS {
                continue;
            }
            let key = (mob.to_lowercase(), faction.to_lowercase());
            let proof = self.pairs.entry(key).or_insert_with(|| Proof {
                mob: mob.to_string(),
                faction,
                samples: Vec::new(),
            });
            proof.samples.extend([line, ev.raw().to_string()]);
            let over = proof.samples.len().saturating_sub(KILL_FACTION_SAMPLES);
            proof.samples.drain(..over);
            any = true;
        }
        any
    }
}

impl EqModule for KillFactionSamplesModule {
    fn id(&self) -> &'static str {
        "killFactionSamples"
    }

    fn reset(&mut self) {
        self.clear();
        self.seq = 0;
        self.announce.reset();
    }

    fn on_event(&mut self, ev: &Event, _live: bool) {
        self.seq = ev.seq();
        match ev.kind() {
            "epoch" => {
                self.clear();
                self.announce.changed(self.seq);
            }
            "unknown" => self.line(ev),
            "death" if self.death(ev) => self.announce.changed(self.seq),
            _ => {}
        }
    }

    /// Moves when a kill adds a proof line. See [`crate::announce`].
    fn published_seq(&self) -> Option<i64> {
        Some(self.announce.cursor())
    }

    /// `[{mob, faction, samples}]`, by mob then faction, each pair's lines oldest first.
    fn snapshot(&self) -> Value {
        let mut pairs: Vec<&Proof> = self.pairs.values().collect();
        pairs.sort_by(|a, b| a.mob.cmp(&b.mob).then_with(|| a.faction.cmp(&b.faction)));
        let rows: Vec<Value> = pairs
            .iter()
            .map(|p| json!({ "mob": p.mob, "faction": p.faction, "samples": p.samples }))
            .collect();
        json!({ "seq": self.seq, "state": rows })
    }
}

#[cfg(test)]
mod tests {
    use super::KillFactionSamplesModule;
    use crate::event::Event;
    use crate::EqModule;

    fn feed(m: &mut KillFactionSamplesModule, json: &str) {
        m.on_event(&Event::from_json(json).expect("a JSON object"), false);
    }

    fn line(m: &mut KillFactionSamplesModule, text: &str, ts: i64) {
        let raw = format!("[Wed Jul 29 01:23:12 2026] {text}");
        feed(
            m,
            &format!(r#"{{"kind":"unknown","ts":{ts},"seq":1,"raw":"{raw}"}}"#),
        );
    }

    fn death(m: &mut KillFactionSamplesModule, name: Option<&str>, ts: i64) {
        let named = name.map_or(String::new(), |n| format!(r#""name":"{n}","#));
        let raw = "[Mon Oct 19 23:56:47 2026] You have slain a troll slayer!";
        feed(
            m,
            &format!(r#"{{"kind":"death",{named}"ts":{ts},"seq":2,"raw":"{raw}"}}"#),
        );
    }

    #[test]
    fn a_kill_serves_its_faction_line_and_death_line_as_proof_and_keeps_the_last_three() {
        let mut m = KillFactionSamplesModule::new();
        for i in 0..4 {
            let at = i * 10_000;
            let by = format!("with Grobb Merchants has been adjusted by {}.", i + 1);
            line(&mut m, &format!("Your faction standing {by}"), at);
            death(&mut m, Some("a troll slayer"), at);
        }
        let served = m.snapshot()["state"].clone();
        assert_eq!(served[0]["mob"], "a troll slayer");
        assert_eq!(served[0]["faction"], "Grobb Merchants");
        let samples: Vec<&str> = served[0]["samples"]
            .as_array()
            .expect("the proof lines")
            .iter()
            .map(|s| s.as_str().unwrap_or(""))
            .collect();
        assert_eq!(samples.len(), 6, "three kills, two lines each");
        assert_eq!(
            samples[4..],
            [
                "[Wed Jul 29 01:23:12 2026] Your faction standing with Grobb Merchants has been adjusted by 4.",
                "[Mon Oct 19 23:56:47 2026] You have slain a troll slayer!"
            ],
            "the newest kill last, verbatim with its stamps"
        );
        assert!(samples[0].ends_with("by 2."), "the oldest kill dropped");
    }

    #[test]
    fn an_unnamed_death_leaves_the_lines_held_and_an_old_line_is_no_kills() {
        let mut m = KillFactionSamplesModule::new();
        line(
            &mut m,
            "Your faction standing with Grobb Merchants has been adjusted by 1.",
            1_000,
        );
        death(&mut m, None, 1_500);
        assert_eq!(m.snapshot()["state"], serde_json::json!([]));
        death(&mut m, Some("a troll slayer"), 2_000);
        assert_eq!(
            m.snapshot()["state"][0]["samples"].as_array().map(Vec::len),
            Some(2)
        );
        line(
            &mut m,
            "Your faction standing with Grobb Merchants has been adjusted by 1.",
            3_000,
        );
        death(&mut m, Some("a rat"), 60_000);
        assert_eq!(
            m.snapshot()["state"].as_array().map(Vec::len),
            Some(1),
            "a minute old"
        );
    }
}
