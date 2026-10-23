//! Fished items (owner, 2026-10-22): `You caught Fresh Fish!` is a source like a forage. An item the
//! data lacks is an Items row of kind `fished`, and the zones it was caught in are served apart from
//! its other zones (`fishedIn`), so the page's notes say "Fished up in [[Lake Nerius]]" and nothing
//! more. `You caught something...` names nothing. Measured on the owner's log (2026-10-22): 33
//! catches, 26 naming an item, 5 items, all in Lake Nerius (two tiers).
//!
//! A child of `gaps.rs`, apart so that file keeps its size.

use super::GapsModule;
use crate::event::Event;
use crate::modules::gaps_keys::item_gap_key;
use std::collections::HashMap;

/// Each fished item's zones by its key, in the order first caught there.
#[derive(Default)]
pub struct Fished {
    zones: HashMap<String, Vec<String>>,
}

impl Fished {
    pub fn clear(&mut self) {
        self.zones.clear();
    }

    pub fn of(&self, key: &str) -> Option<&Vec<String>> {
        self.zones.get(key).filter(|z| !z.is_empty())
    }
}

impl GapsModule {
    /// A catch: the item filed as fished, and the zone kept for its notes.
    pub(super) fn fished(&mut self, item: &str, ev: &Event) -> bool {
        if let Some(zone) = self.zone.clone() {
            let zones = self.fish.zones.entry(item_gap_key(item)).or_default();
            if !zones.contains(&zone) {
                zones.push(zone);
            }
        }
        self.item_named(item, "fished", ev)
    }
}
