//! The registry's whole-fold views: which wired modules a build lacks, and every snapshot at once.
//! Apart from `lib.rs` so that file stays under its recorded size.

use crate::{Registry, WIRING_ORDER};
use serde_json::{json, Value};
use std::collections::HashSet;

impl Registry {
    /// Every id `WIRING_ORDER` names that nothing registered — the harness's skipped list.
    pub fn missing(&self) -> Vec<&'static str> {
        let have: HashSet<&str> = self.ids().into_iter().collect();
        WIRING_ORDER
            .iter()
            .copied()
            .filter(|id| !have.contains(id))
            .collect()
    }

    /// `{ "modules": [ { "id": …, "snapshot": { "seq": …, "state": … } }, … ] }` — the same shape
    /// the golden's `modules` array carries, in delivery order, so the comparator joins on `id`
    /// and compares `snapshot` whole.
    pub fn snapshots(&self) -> Value {
        json!({
            "modules": self.mods.iter().map(|m| json!({
                "id": m.id(),
                "snapshot": m.snapshot(),
            })).collect::<Vec<_>>(),
            "skipped": self.missing(),
        })
    }
}
