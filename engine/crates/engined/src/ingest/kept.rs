//! The last `module.snapshot` answer per module, kept until something it depends on moves.
//!
//! Every ask used to rebuild the module's whole state on the ingest thread, and the tail does not
//! fold while it builds. Most of that work repeats: a tab remount, a window opened late or a second
//! reader asks again with nothing new, and on a long log `buffs` costs ~100 ms to build, `combo`
//! ~27 and `loot` ~10. So the answer is kept and handed out again (an `Arc` bump) for as long as its
//! [`Key`] holds.
//!
//! THE KEY IS THE MODULE'S ANNOUNCE CURSOR (`EqModule::published_seq`), the contract every reader
//! already lives by: it moves when the published state changes (`fold::announce`), and a client
//! holding a snapshot never refetches until it does. Two kinds of module need more, found by
//! folding real logs event by event and comparing (the tests below):
//!
//! * a module whose cursor deliberately ignores a field that moves on ordinary lines — `buffs`'
//!   per-spell `stats`, `gaps`' `seen` counts — is kept only while no event has been folded;
//! * `resist`, whose counts settle on the heartbeat without moving its cursor, is never kept. It is
//!   two integers, and no app reader asks for it.
//! * `respawn` is never kept either: the heartbeat's clock orders its rows (`order_rows`) and its
//!   revision deliberately ignores the heartbeat. The fixtures cannot show it (no watch list is
//!   defined there, so no rows), and its build is small: at most 60 rows, 40 candidates and the
//!   learned gaps.
//!
//! A write (a define, a mark, a confirm) forgets everything kept: writes are rare, and that keeps
//! the key from depending on which defines announce.
//!
//! The kept answer carries the `seq` it was built at, which may be behind what a fresh build would
//! say. That is the true seq of that exact state, so a client's `seq <= knownSeq` test can refetch
//! once more at worst, and never misses a change.
//!
//! One per attach (it lives in `Serving`), so a new fold never answers from the last one's.

use std::collections::HashMap;

use super::{EventSink, ModuleSnapshot};

/// Modules never kept — see the module header.
const NEVER: [&str; 2] = ["resist", "respawn"];

/// Modules kept only while no event has been folded — see the module header.
const UNTIL_ANY_EVENT: [&str; 2] = ["buffs", "gaps"];

/// What a kept answer was built under. Equal keys mean the module's state cannot have moved.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct Key {
    cursor: i64,
    /// The fold's event count, for the [`UNTIL_ANY_EVENT`] modules only.
    events: Option<i64>,
}

/// The key `module`'s answer would be kept under now, or `None` when it is not kept at all — a
/// module in [`NEVER`], or one that states no cursor.
pub(super) fn key(sink: &dyn EventSink, module: &str) -> Option<Key> {
    if NEVER.contains(&module) {
        return None;
    }
    let cursor = sink
        .module_seqs()
        .into_iter()
        .find_map(|(id, seq)| (id == module).then_some(seq))?;
    let events = UNTIL_ANY_EVENT
        .contains(&module)
        .then(|| sink.report().events);
    Some(Key { cursor, events })
}

/// The kept answers, by module id.
#[derive(Default)]
pub(super) struct Kept {
    answers: HashMap<String, (Key, ModuleSnapshot)>,
}

impl Kept {
    /// One module's published state: the kept answer if its key still holds, else a fresh build,
    /// kept for the next asker.
    pub(super) fn snapshot(
        &mut self,
        sink: &dyn EventSink,
        module: &str,
    ) -> Option<ModuleSnapshot> {
        let now = key(sink, module);
        if let (Some(now), Some((at, kept))) = (now, self.answers.get(module)) {
            if *at == now {
                return Some(kept.clone());
            }
        }
        let fresh = sink.snapshot(module);
        match (now, &fresh) {
            (Some(now), Some(answer)) => {
                self.answers
                    .insert(module.to_owned(), (now, answer.clone()));
            }
            _ => {
                self.answers.remove(module);
            }
        }
        fresh
    }

    /// A write reached the fold: nothing kept is trusted past it.
    pub(super) fn forget(&mut self) {
        self.answers.clear();
    }
}

#[cfg(test)]
#[path = "kept_tests.rs"]
mod tests;
