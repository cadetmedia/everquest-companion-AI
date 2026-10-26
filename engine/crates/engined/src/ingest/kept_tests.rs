//! The kept answer's two halves: the cache does what it says (a probe sink), and its [`key`] is
//! sound (the production sink folding real logs one event at a time).

use super::{key, Kept, Key};
use crate::ingest::{Event, EventSink, ModuleSnapshot, SinkInputs, SinkReport};
use std::cell::Cell;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// A sink with one module whose cursor and event count the test moves by hand, counting builds.
struct Probe {
    cursor: Option<i64>,
    events: i64,
    builds: Cell<i64>,
}

impl Probe {
    fn at(cursor: Option<i64>) -> Self {
        Self {
            cursor,
            events: 0,
            builds: Cell::new(0),
        }
    }
}

impl EventSink for Probe {
    fn event(&mut self, _event: &Event<'_>) {}
    fn report(&self) -> SinkReport {
        SinkReport {
            events: self.events,
            ..SinkReport::default()
        }
    }
    fn snapshot(&self, module: &str) -> Option<ModuleSnapshot> {
        if !["loot", "buffs", "resist"].contains(&module) {
            return None;
        }
        self.builds.set(self.builds.get() + 1);
        Some(ModuleSnapshot {
            seq: self.builds.get(),
            state: serde_json::json!([self.builds.get()]).into(),
        })
    }
    fn module_seqs(&self) -> Vec<(&'static str, i64)> {
        self.cursor
            .map(|c| vec![("loot", c), ("buffs", c), ("resist", c)])
            .unwrap_or_default()
    }
}

#[test]
fn a_repeat_ask_with_the_cursor_unmoved_is_the_kept_answer_and_builds_nothing() {
    let mut kept = Kept::default();
    let mut sink = Probe::at(Some(10));
    let first = kept.snapshot(&sink, "loot").expect("an answer");
    sink.events += 5;
    let again = kept.snapshot(&sink, "loot").expect("an answer");
    assert_eq!(
        sink.builds.get(),
        1,
        "events the cursor ignored build nothing"
    );
    assert!(std::ptr::eq(first.state.as_json(), again.state.as_json()));

    // The cursor moves: the next ask is a fresh build, and it is what is kept from then on.
    sink.cursor = Some(11);
    let moved = kept.snapshot(&sink, "loot").expect("an answer");
    assert_eq!(sink.builds.get(), 2);
    assert_eq!(moved.state, serde_json::json!([2]));
    kept.snapshot(&sink, "loot");
    assert_eq!(sink.builds.get(), 2);

    // …and a write forgets it.
    kept.forget();
    kept.snapshot(&sink, "loot");
    assert_eq!(sink.builds.get(), 3);
}

#[test]
fn buffs_is_kept_only_while_nothing_is_folded_and_resist_never() {
    let mut kept = Kept::default();
    let mut sink = Probe::at(Some(10));
    kept.snapshot(&sink, "buffs");
    kept.snapshot(&sink, "buffs");
    assert_eq!(sink.builds.get(), 1);
    sink.events += 1;
    kept.snapshot(&sink, "buffs");
    assert_eq!(
        sink.builds.get(),
        2,
        "an event, even with the cursor unmoved"
    );

    kept.snapshot(&sink, "resist");
    kept.snapshot(&sink, "resist");
    assert_eq!(sink.builds.get(), 4);
}

#[test]
fn a_module_with_no_cursor_is_built_every_time_and_an_unknown_one_answers_none() {
    let mut kept = Kept::default();
    let sink = Probe::at(None);
    kept.snapshot(&sink, "loot");
    kept.snapshot(&sink, "loot");
    assert_eq!(
        sink.builds.get(),
        2,
        "nothing can say the state is unchanged"
    );
    assert!(kept.snapshot(&sink, "nope").is_none());
}

// ── the key, against the production sink ────────────────────────────────────────────────────

/// Fixtures picked for breadth: the deepest loot ledger with kills, buff landings and wear-offs,
/// pet buffs and kill credit.
///
/// Thinned to every 50th event and beat to keep the suite quick. Every event, all six of
/// `wl40-farm-run`, `wl44-swap-boundary`, `e2e-leveling`, `w8-wears-off`, `p4-pet-buff-kill-credit`
/// and `w40-nife-buff`, is what found the `buffs`, `gaps` and `resist` exceptions (2026-10-26).
const FIXTURES: [&str; 3] = [
    "wl40-farm-run.log",
    "w8-wears-off.log",
    "p4-pet-buff-kill-credit.log",
];

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .expect("the crate is three levels below the repo root")
        .to_path_buf()
}

/// Fold `bytes` through the production sink one event at a time — the first half as the scan,
/// the second as the live tail with a heartbeat per log second — and, after every `every`th event
/// and every `every`th beat, fail on any module whose [`key`] held while its state moved. Answers
/// how many held keys were compared.
fn check(log: &Path, bytes: &[u8], every: u64) -> u64 {
    let parser = eqlog::parser_for("Primitive", eqlog::host_timezone());
    let mut sink = crate::foldsink::folding_sinks()(&SinkInputs {
        log,
        character: Some("Primitive"),
        db: parser.spell_db(),
        clock: parser.clock(),
        attached_at_ms: 0,
        state_dir: None,
    });
    let total = eqlog::scan::scan_bytes(&parser, bytes, |_json, _payload| {});
    let half = total / 2;

    let mut last: HashMap<&'static str, (Key, serde_json::Value)> = HashMap::new();
    let mut compared = 0;
    let mut beat_at = i64::MIN;
    let mut beats = 0_u64;
    let mut seq = 0_i64;
    eqlog::scan::scan_bytes(&parser, bytes, |json, payload| {
        let i = u64::try_from(seq).expect("a count");
        let live = i >= half;
        let ts = crate::ingest::ts_of(json).unwrap_or(0);
        if live && ts >= beat_at.saturating_add(1000) {
            beat_at = ts;
            beats += 1;
            sink.tick(ts);
            if beats.is_multiple_of(every) {
                compared += compare(&*sink, &mut last, log, seq, "a beat");
            }
        }
        sink.event(&Event {
            json,
            payload,
            seq,
            live,
        });
        if i.is_multiple_of(every) || i + 1 == total {
            compared += compare(&*sink, &mut last, log, seq, "an event");
        }
        seq += 1;
    });
    compared
}

fn compare(
    sink: &dyn EventSink,
    last: &mut HashMap<&'static str, (Key, serde_json::Value)>,
    log: &Path,
    at: i64,
    after: &str,
) -> u64 {
    let mut compared = 0;
    for (module, _) in sink.module_seqs() {
        let Some(now) = key(sink, module) else {
            continue;
        };
        let state = sink
            .snapshot(module)
            .expect("a module that states a cursor answers")
            .state
            .as_json()
            .clone();
        if let Some((was, before)) = last.get(module) {
            if *was == now {
                compared += 1;
                assert!(
                    *before == state,
                    "{}: {module}'s state moved after {after} (event {at}) under an unmoved key \
                     {now:?}, so a kept answer would be stale",
                    log.display()
                );
            }
        }
        last.insert(module, (now, state));
    }
    compared
}

#[test]
fn a_kept_key_never_holds_while_the_state_moves() {
    for fixture in FIXTURES {
        let path = repo_root().join("tests").join("fixtures").join(fixture);
        let bytes = std::fs::read(&path)
            .unwrap_or_else(|e| panic!("the fixture at {} is readable: {e}", path.display()));
        assert!(check(&path, &bytes, 50) > 0, "{fixture}: nothing compared");
    }
}

/// The same over a real log. `EQ_BENCH_LOG` names a copy; `EQ_BENCH_EVERY` thins it (default 1).
#[test]
#[ignore = "runs against a real log named by EQ_BENCH_LOG"]
fn a_kept_key_never_holds_while_the_state_moves_over_a_real_log() {
    let log = PathBuf::from(std::env::var("EQ_BENCH_LOG").expect("EQ_BENCH_LOG names a copy"));
    let bytes = std::fs::read(&log).expect("the log");
    let every = std::env::var("EQ_BENCH_EVERY")
        .ok()
        .and_then(|n| n.parse().ok())
        .unwrap_or(1);
    let compared = check(&log, &bytes, every);
    eprintln!("{compared} held keys compared");
}
