//! The observed-message overlay (Task #36), served as its own module, `messageOverlay`, beside
//! `buffs`.
//!
//! WHY APART (perf review 2026-10-20, second pass item 3). The overlay was served inside `buffs`
//! and was most of every buffs fetch: 1.22 of 1.29 MB on the owner's October log, re-sent to the
//! buffs overlay window and Loadout on every buff change. Only the Buffs tab's diagnostics panel
//! reads it, so it is asked for only while that panel is open.
//!
//! THE SAME MINER. `buffs` still feeds it and owns its persistence (`seed_persisted`, the state
//! writer); this module holds the same `Rc` and only serves it, with the cursor the miner moves.

use super::buffs_mining::SharedMining;
use crate::event::Event;
use crate::EqModule;
use serde_json::{json, Value};

pub struct MessageOverlayModule {
    mining: SharedMining,
    seq: i64,
}

impl MessageOverlayModule {
    pub fn new(mining: SharedMining) -> Self {
        Self { mining, seq: 0 }
    }
}

impl EqModule for MessageOverlayModule {
    fn id(&self) -> &'static str {
        "messageOverlay"
    }

    /// The overlay itself survives a reset (game knowledge; see `BuffsModule::reset`).
    fn reset(&mut self) {
        self.seq = 0;
        self.mining.borrow_mut().reset_announce();
    }

    fn on_event(&mut self, ev: &Event, _live: bool) {
        self.seq = ev.seq();
    }

    /// Moves when a line reaches the miner, or a bucket is seeded or discarded.
    fn published_seq(&self) -> Option<i64> {
        Some(self.mining.borrow().cursor())
    }

    /// `{version, updatedAt, messages, stats}`: `MessageOverlay` in shared/buffTypes.ts.
    fn snapshot(&self) -> Value {
        json!({ "seq": self.seq, "state": self.mining.borrow().build() })
    }
}

#[cfg(test)]
mod tests {
    use crate::event::Event;
    use crate::spell_facts::SpellFacts;
    use crate::EqModule;

    fn feed(m: &mut dyn EqModule, json: &str) {
        m.on_event(&Event::from_json(json).expect("a JSON object"), false);
    }

    #[test]
    fn the_overlay_is_served_here_not_in_buffs_and_a_fed_line_moves_only_its_cursor() {
        let facts = SpellFacts::default();
        let core = super::super::buffs::shared_core(facts.clone());
        let mut buffs = super::super::buffs::BuffsModule::new(facts, core);
        let mut overlay = super::MessageOverlayModule::new(buffs.shared_mining());
        assert!(buffs.snapshot()["state"].get("overlay").is_none());
        assert!(overlay.snapshot()["state"]["messages"].is_array());

        let before = overlay.published_seq();
        let cast = r#"{"kind":"castBegin","spell":"Bramblecoat","ts":1000,"seq":7,"raw":"[Mon Oct 26 12:00:00 2026] You begin casting Bramblecoat."}"#;
        feed(&mut buffs, cast);
        feed(&mut overlay, cast);
        let after = overlay.published_seq();
        assert!(after > before && after > Some(7), "{before:?} -> {after:?}");
        assert_eq!(overlay.snapshot()["seq"], 7);
    }
}
