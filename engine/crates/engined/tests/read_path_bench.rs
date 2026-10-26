//! The read path, timed against a real log — a measurement, not a claim, so it is `#[ignore]`d and
//! asserts nothing about speed. Run it in release against a copy of a real log:
//!
//! ```text
//! EQ_BENCH_LOG=<copy>/eqlog_Name_server.txt cargo test --release -p engined \
//!   --test read_path_bench -- --ignored --nocapture
//! ```
//!
//! It APPENDS lines to that file, so point it at a copy, never at the game's own log. It prints four
//! things: what each big `module.snapshot` costs cold and repeated; how long a tiny ask on a second
//! connection waits while the first hammers the big ones (the ingest thread is the one door, so a
//! slow build is everybody's wait); how long a write and a first line take after a quiet spell (the
//! tail's idle nap); and, when `EQ_BENCH_PID_FILE` is set, a quiet window with the engine's pid
//! written there so its CPU time can be sampled from outside.

mod harness;

use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use harness::{attach, health, module_snapshot, perf_snapshot, session_mark, Client, Engine};
use protocol::generated::{EngineMessage, HealthResultStatus, ReplyResult};

/// The modules the performance review measured as big, plus two small ones for contrast, and the
/// overlay served apart from `buffs`.
const MODULES: [&str; 7] = [
    "loot",
    "gaps",
    "kills",
    "progression",
    "consider",
    "buffs",
    "messageOverlay",
];

/// Send one request and wait for the reply carrying its id; everything else on the stream is
/// traffic. Answers the round trip and the reply.
fn round_trip(
    client: &mut Client,
    message: &protocol::generated::ClientMessage,
    id: i64,
) -> (Duration, EngineMessage) {
    let started = Instant::now();
    client.send(message);
    loop {
        let got = client.recv();
        let mine = match &got {
            EngineMessage::Reply(reply) => *reply.id == id,
            EngineMessage::ErrorReply(err) => *err.id == id,
            _ => false,
        };
        if mine {
            return (started.elapsed(), got);
        }
    }
}

fn health_of(client: &mut Client, id: i64) -> protocol::generated::HealthResult {
    match round_trip(client, &health(id), id).1 {
        EngineMessage::Reply(reply) => match reply.result {
            ReplyResult::HealthResult(h) => h,
            other => panic!("health answers with health: {other:?}"),
        },
        other => panic!("health was refused: {other:?}"),
    }
}

fn ms(d: Duration) -> f64 {
    d.as_secs_f64() * 1000.0
}

fn summary(mut v: Vec<f64>) -> String {
    v.sort_by(f64::total_cmp);
    let pick = |q: f64| {
        #[allow(
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss,
            clippy::cast_precision_loss
        )]
        let i = ((v.len() - 1) as f64 * q).round() as usize;
        v[i]
    };
    format!(
        "n={} min {:.1} p50 {:.1} p95 {:.1} max {:.1} ms",
        v.len(),
        pick(0.0),
        pick(0.5),
        pick(0.95),
        pick(1.0)
    )
}

/// One line in the game's own shape, stamped now, CRLF-terminated as EverQuest writes them.
fn line(text: &str) -> String {
    let now = chrono_free_stamp();
    format!("[{now}] {text}\r\n")
}

/// `Mon Oct 26 12:00:00 2026` in host-local time, without a date crate: the parser reads the stamp,
/// so it has to be a real one. The weekday is not read by the stamp pattern, so any will do.
fn chrono_free_stamp() -> String {
    const MONTHS: [&str; 12] = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    let clock = eqlog::Clock::new(eqlog::host_timezone());
    let c = clock.civil(now_ms()).expect("a representable now");
    format!(
        "Mon {} {:02} {:02}:{:02}:{:02} {}",
        MONTHS[usize::try_from(c.month - 1).expect("a month")],
        c.day,
        c.hour,
        c.minute,
        c.second,
        c.year
    )
}

fn now_ms() -> i64 {
    i64::try_from(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("after 1970")
            .as_millis(),
    )
    .expect("fits")
}

#[test]
#[ignore = "a measurement against a real log; see the header"]
fn read_path_costs() {
    let log = std::env::var("EQ_BENCH_LOG").expect("EQ_BENCH_LOG names a COPY of a real log");
    let engine = Engine::start();
    let mut client = engine.connected();
    client.send(&attach(1, &log));
    let mut id = 100;
    let started = Instant::now();
    loop {
        id += 1;
        if matches!(health_of(&mut client, id).status, HealthResultStatus::Live) {
            break;
        }
        assert!(
            started.elapsed() < Duration::from_secs(600),
            "never went live"
        );
        std::thread::sleep(Duration::from_millis(50));
    }
    eprintln!("live after {:.1} s", started.elapsed().as_secs_f64());
    // Let the go-live serve settle.
    std::thread::sleep(Duration::from_secs(2));

    // `EQ_BENCH_IDLE_ONLY` skips straight to the quiet window.
    let idle_only = std::env::var("EQ_BENCH_IDLE_ONLY").is_ok();

    // 1. Each module, once cold and then repeated with nothing new folded.
    for module in MODULES.iter().filter(|_| !idle_only) {
        id += 1;
        let (cold, reply) = round_trip(&mut client, &module_snapshot(id, module), id);
        let bytes = serde_json::to_string(&reply).map_or(0, |s| s.len());
        let mut repeats = Vec::new();
        for _ in 0..10 {
            id += 1;
            repeats.push(ms(round_trip(
                &mut client,
                &module_snapshot(id, module),
                id,
            )
            .0));
        }
        eprintln!(
            "snapshot {module:<12} {:>9} bytes  first {:>6.1} ms  repeat {}",
            bytes,
            ms(cold),
            summary(repeats)
        );
    }

    // 2. A tiny ask on a second connection while the first asks the big ones back to back.
    if idle_only {
        idle_window(&engine);
        return;
    }
    let mut side = engine.connected();
    let mut quiet = Vec::new();
    let mut sid = 1_000_000;
    for _ in 0..200 {
        sid += 1;
        quiet.push(ms(round_trip(&mut side, &perf_snapshot(sid), sid).0));
        std::thread::sleep(Duration::from_millis(2));
    }
    eprintln!(
        "side perf.snapshot, nothing else asking: {}",
        summary(quiet)
    );
    let stop = Arc::new(AtomicBool::new(false));
    let hammer = {
        let stop = Arc::clone(&stop);
        std::thread::spawn(move || {
            let mut id = 2_000_000;
            let mut asked = 0;
            while !stop.load(Ordering::Relaxed) {
                for module in ["gaps", "loot", "kills"] {
                    id += 1;
                    round_trip(&mut client, &module_snapshot(id, module), id);
                    asked += 1;
                }
            }
            (client, asked)
        })
    };
    let mut busy = Vec::new();
    let window = Instant::now();
    while window.elapsed() < Duration::from_secs(5) {
        sid += 1;
        busy.push(ms(round_trip(&mut side, &perf_snapshot(sid), sid).0));
        std::thread::sleep(Duration::from_millis(2));
    }
    stop.store(true, Ordering::Relaxed);
    let (mut client, asked) = hammer.join().expect("the hammer");
    eprintln!(
        "side perf.snapshot, while the main connection asked {asked} big snapshots in 5 s: {}",
        summary(busy)
    );

    // 3. After a quiet spell: a write's ack, and how long the first appended line takes to be
    // folded (observed as `session.health`'s event count moving).
    let mut file = std::fs::OpenOptions::new()
        .append(true)
        .open(&log)
        .expect("the copy is appendable");
    // Each spell is jittered across a poll interval, or every sample would land at the same phase
    // of the tail's 400 ms poll and measure one point of it.
    let spell = |base_ms: u64| {
        let jitter = u64::from(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("after 1970")
                .subsec_nanos(),
        ) % 400;
        Duration::from_millis(base_ms + jitter)
    };
    for base_ms in [1_000_u64, 5_000].iter().copied().filter(|_| !idle_only) {
        let (mut writes, mut lines) = (Vec::new(), Vec::new());
        for _ in 0..8 {
            std::thread::sleep(spell(base_ms));
            id += 1;
            writes.push(ms(
                round_trip(&mut client, &session_mark(id, now_ms()), id).0
            ));
            std::thread::sleep(spell(base_ms));
            id += 1;
            let before = health_of(&mut client, id).events;
            let appended = Instant::now();
            file.write_all(line("You say, 'bench'").as_bytes())
                .expect("append");
            file.flush().expect("flush");
            loop {
                id += 1;
                if health_of(&mut client, id).events != before {
                    break;
                }
                assert!(appended.elapsed() < Duration::from_secs(10), "never folded");
                std::thread::sleep(Duration::from_millis(1));
            }
            lines.push(ms(appended.elapsed()));
        }
        eprintln!(
            "after ~{base_ms} ms quiet: session.marks.add ack {}",
            summary(writes)
        );
        eprintln!(
            "after ~{base_ms} ms quiet: first line folded {}",
            summary(lines)
        );
    }

    idle_window(&engine);
}

/// 4. A quiet window to sample the idle engine from outside, when `EQ_BENCH_PID_FILE` asks for one.
fn idle_window(engine: &Engine) {
    if let Ok(pid_file) = std::env::var("EQ_BENCH_PID_FILE") {
        std::fs::write(&pid_file, engine.pid().to_string()).expect("the pid file");
        eprintln!("idle window: pid {} written to {pid_file}", engine.pid());
        std::thread::sleep(Duration::from_secs(45));
    }
}

/// Where the time in one `module.snapshot` goes, in-process: building the module's `Value` (what
/// the ingest thread pays, and the tail with it), deep-cloning it, and serializing it (what the
/// connection's writer pays). Folded the way `module_snapshot.rs`'s oracle folds, minus knowledge.
#[test]
#[ignore = "a measurement against a real log; see the header"]
fn snapshot_build_costs() {
    let log = std::env::var("EQ_BENCH_LOG").expect("EQ_BENCH_LOG names a COPY of a real log");
    let bytes = std::fs::read(&log).expect("the log");
    let name = std::path::Path::new(&log)
        .file_name()
        .expect("a file")
        .to_string_lossy();
    let character = eqlog::character_of(&name).unwrap_or_default();
    let parser = eqlog::parser_for(&character, eqlog::host_timezone());
    let db = parser.spell_db().expect("the parser carries the catalog");
    let launch_ms = fold::epoch::launch_ms(parser.clock());
    let deps = fold::ClusterDeps {
        known_spell: db.keys().map(str::to_string).collect(),
        spell_classes: fold::modules::combo::evidence::spell_class_index(db),
        facts: fold::spell_facts::SpellFacts::project(db),
        launch_ms,
        construction_now_ms: now_ms(),
        character: None,
        self_name: None,
        respawn_prefs: fold::modules::respawn::RespawnPrefs::default(),
    };
    let mut folder = fold::Fold::new(fold::registered(deps), launch_ms);
    folder.fold_bytes(&parser, &bytes);
    for module in fold::WIRING_ORDER {
        let (mut build, mut clone, mut ser) = (Vec::new(), Vec::new(), Vec::new());
        let mut size = 0;
        for _ in 0..5 {
            let t = Instant::now();
            let v = folder.registry.snapshot_of(module).expect("registered");
            build.push(ms(t.elapsed()));
            let t = Instant::now();
            let c = v.clone();
            clone.push(ms(t.elapsed()));
            let t = Instant::now();
            size = serde_json::to_string(&c).expect("serializes").len();
            ser.push(ms(t.elapsed()));
        }
        let mid = |mut v: Vec<f64>| {
            v.sort_by(f64::total_cmp);
            v[v.len() / 2]
        };
        eprintln!(
            "{module:<20} {size:>9} bytes  build {:>6.2}  clone {:>6.2}  serialize {:>6.2} ms",
            mid(build),
            mid(clone),
            mid(ser)
        );
    }
}
