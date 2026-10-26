//! Which log lines are offered to the message-overlay miner.
//!
//! It mines the same way in replay and live, which is what makes the overlay a FOLD rather than a
//! session artifact, and therefore reproducible.
//!
//! There is deliberately no dirty-cache around `build()`: a `Fold` takes exactly one snapshot, so
//! memoizing would save nothing and would cost this file the interior mutability that
//! `EqModule::snapshot(&self)` otherwise never needs.
//!
//! `buffs` feeds it and `messageOverlay` serves it (`buffs_overlay.rs`), so it is shared between the
//! two and carries the overlay's own announce cursor.

use crate::event::{Event, Key, Kind};
use crate::message_overlay::{message_text_of, MessageOverlayMiner, SeedMessage};
use crate::spell_facts::{looks_landing_message, SpellFacts};
use serde_json::Value;
use std::cell::RefCell;
use std::rc::Rc;

/// The one miner, held by `buffs` (which feeds and persists it) and `messageOverlay` (which serves
/// it). Neither borrows it while the other holds the borrow: each takes it once per call.
pub type SharedMining = Rc<RefCell<OverlayMining>>;

pub struct OverlayMining {
    miner: MessageOverlayMiner,
    /// Moves whenever the served overlay may have; `messageOverlay`'s `published_seq`.
    announce: crate::announce::Announce,
}

impl OverlayMining {
    /// Seeded warm with the committed baseline, so a fresh install benefits from the shipped counts.
    /// Each seed carries its SOURCE KEY: the bucket a log is filed under is what lets `begin_source`
    /// replace it when that log is folded again, rather than accumulating on its own output.
    pub fn new(facts: SpellFacts, seeds: &[(&str, Vec<SeedMessage>)]) -> Self {
        let mut miner = MessageOverlayMiner::new(facts);
        for (key, counts) in seeds {
            miner.merge(counts, key);
        }
        OverlayMining {
            miner,
            announce: crate::announce::Announce::default(),
        }
    }

    /// The overlay's announce cursor. See [`crate::announce`].
    pub fn cursor(&self) -> i64 {
        self.announce.cursor()
    }

    /// A new world: zeroed alongside the serving module's `seq`.
    pub fn reset_announce(&mut self) {
        self.announce.reset();
    }

    /// A change with no event behind it (a seed, a discarded bucket).
    fn moved(&mut self) {
        let at = self.announce.cursor();
        self.announce.changed(at);
    }

    /// A log is about to be folded from its first byte — file what it teaches under `key` and drop
    /// whatever that key held.
    pub fn begin_source(&mut self, key: &str) {
        self.miner.begin_source(key);
        self.moved();
    }

    /// Offer one event to the miner. A cast is the association ANCHOR; the message-bearing events
    /// are candidate messages associated to the nearest anchor within the window.
    ///
    /// A line that reaches the miner moves the overlay's cursor: the CALL, not the miner's own
    /// verdict, because "unsure whether this mutated" is the case the announce law says to bump on.
    pub fn observe(&mut self, ev: &Event) {
        if self.feed(ev) {
            self.announce.changed(ev.seq());
        }
    }

    /// Whether `ev` fed the miner.
    fn feed(&mut self, ev: &Event) -> bool {
        match ev.kind_of() {
            Kind::CastBegin => {
                let spell = ev.str(Key::Spell).unwrap_or_default().to_string();
                self.miner.observe_cast(&spell, ev.ts());
                true
            }
            Kind::BuffApply | Kind::SpellEmote => {
                self.note(ev, "landing");
                true
            }
            Kind::BuffWearOff | Kind::IllusionFade | Kind::BuffFade => {
                self.note(ev, "wearsOff");
                true
            }
            // The AA potion quaff is a landing message the leveling analytics claim as their own
            // kind, but it is absent from spells.json so the overlay learned it here. It keeps the
            // same miner path so the learned overlay stays what it was.
            Kind::AaPotion | Kind::Unknown => {
                // A line the parser classified as nothing but that could be an un-catalogued landing
                // message, where the wiki's own cast-on-you text is wrong and the DB never matched
                // it. Only flavor-SHAPED lines are fed; the miner's unambiguous-anchor and count
                // rules discard coincidental pairings, so a wrong candidate never verifies.
                let t = message_text_of(ev.raw()).to_string();
                if looks_landing_message(&t) {
                    self.miner.observe_message(&t, ev.ts(), "landing");
                    return true;
                }
                false
            }
            _ => false,
        }
    }

    fn note(&mut self, ev: &Event, role: &'static str) {
        let text = message_text_of(ev.raw()).to_string();
        self.miner.observe_message(&text, ev.ts(), role);
    }

    /// Seed one persisted bucket, through the same `merge` the committed baseline arrives by.
    ///
    /// Separate from `new` on purpose: the baseline is a fact about committed data and is compiled
    /// in, while the user register is a file, and a constructor that could reach a file would not be
    /// reproducible by the goldens. This is the extra act, made by the one caller that has been
    /// handed a state directory.
    pub fn seed(&mut self, key: &str, counts: &[SeedMessage]) {
        self.miner.merge(counts, key);
        self.moved();
    }

    /// The persistence view — every bucket's raw counts, filed under the source that produced them.
    pub fn register(&self) -> crate::message_overlay::OverlayRegister {
        self.miner.register()
    }

    /// The served overlay.
    pub fn build(&self) -> Value {
        self.miner.build()
    }
}
