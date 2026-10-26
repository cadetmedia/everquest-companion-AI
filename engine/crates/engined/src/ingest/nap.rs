//! The live tail's nap: sleep out one poll interval, waking early when the world changes hands —
//! and when somebody asks the fold a question.
//!
//! A live engine spends almost all of its time here, so a reader served only at the top of a poll
//! would wait a whole poll interval. Serving inside the nap was the first half of the fix; this is
//! the second. The nap used to be a blind [`TAIL_NAP`] sleep with the asks drained after it, so every
//! live read waited out whatever was left of the nap it landed in — up to 25 ms, paid per request,
//! and paid again by each read queued behind it on main's one connection. A slow PC with several
//! windows hydrating at once spent its whole read deadline that way.
//!
//! So the nap now waits ON the ask door: `recv_timeout` instead of `sleep`. An ask that arrives
//! mid-nap ends that nap and is answered at once, then everything else is drained exactly as before.
//! Nothing else moved:
//!
//! * the poll interval is the same interval, measured against a deadline rather than a count of
//!   naps, so an ask cutting a nap short never stretches the poll it sits in;
//! * every turn of the loop still re-asks ownership, takes writes and offers the views a serve — the
//!   same three acts, once per wake rather than once per 25 ms, each with its own cadence or cost
//!   rule (`Serving::tick` builds nothing that is not owed);
//! * nothing blocks the fold: the wait is bounded by the nap (see below), the fold is not folding
//!   while it naps, and a preempted tail usually notices within one [`TAIL_NAP`], because the attach
//!   that disowns it drops its ask door and a dead door ends the wait. A connection thread may still
//!   hold a clone of that door (`state.asks`, held for up to `SNAPSHOT_PATIENCE`), and then the door
//!   stays open and the tail notices at its next wake instead: at most one [`IDLE_NAP`] (one poll
//!   interval) on a quiet log, which is bounded and harmless.
//!
//! A write wakes the nap through the same door. `std::sync::mpsc` cannot wait on two channels at
//! once, and a second door would be the second channel `State::asks` (`world.rs`) argues against, so
//! the world posts the write on its own channel and then an empty [`Ask::Wake`] on this one. A new
//! subscription does the same, since its first full window is built at the next wake.
//!
//! THE NAP BACKS OFF ON A QUIET LOG. With EverQuest closed the tail used to wake forty times a
//! second to find nothing. Once the log has not grown for [`QUIET_AFTER`] the nap is the whole poll
//! interval instead ([`Quiet`]), and the first line that lands puts it back to [`TAIL_NAP`]. That
//! costs a first line nothing: lines are only ever looked for at the poll, every
//! `DEFAULT_POLL_INTERVAL`, whatever the nap. What a long nap could have delayed — an ask, a write,
//! a new subscription — wakes it, and a disowned door is noticed as above. The
//! one thing left on the long nap is a view frame the serve cadence deferred, and a log quiet for
//! seconds has none owed.

use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::thread;
use std::time::{Duration, Instant};

use super::{answer_asks, answer_writes, Ask, EventSink, Serving, Write, TAIL_NAP};
use crate::world::World;

/// How long the log must go without a new line before the tail naps long.
const QUIET_AFTER: Duration = Duration::from_secs(3);

/// The nap on a quiet log: the whole poll interval, so an idle tail wakes once per poll.
const IDLE_NAP: Duration = eqlog::tail::DEFAULT_POLL_INTERVAL;

/// When the log last grew, and therefore how long the tail may nap.
pub(super) struct Quiet {
    since: Instant,
}

impl Quiet {
    /// Armed as busy: a fold that just landed is about to serve its first frames.
    pub(super) fn new() -> Self {
        Self {
            since: Instant::now(),
        }
    }

    /// One poll's outcome: `true` when it folded anything.
    pub(super) fn folded(&mut self, any: bool) {
        if any {
            self.since = Instant::now();
        }
    }

    /// The nap this turn of the tail may take.
    pub(super) fn nap(&self) -> Duration {
        if self.since.elapsed() < QUIET_AFTER {
            TAIL_NAP
        } else {
            IDLE_NAP
        }
    }
}

/// Sleep out one poll interval in naps of at most `nap_len` ([`Quiet::nap`]), waking early when the
/// world changes hands or an ask arrives — and answering asks, taking writes and serving views at
/// every wake.
#[allow(clippy::too_many_arguments)]
pub(super) fn nap(
    interval: Duration,
    nap_len: Duration,
    world: &World,
    generation: u64,
    answers: &Receiver<Ask>,
    writes: &Receiver<Write>,
    sink: &mut dyn EventSink,
    serving: &mut Serving,
) {
    let until = Instant::now() + interval;
    let mut nap_len = nap_len;
    while world.owns(generation) {
        let left = until.saturating_duration_since(Instant::now());
        if left.is_zero() {
            break;
        }
        let woke = wait_for_ask(answers, left.min(nap_len));
        // Something woke a long nap: back to short ones for the rest of this interval, so whatever
        // it owes the serve cadence (a new subscription's window) is not left to the next poll.
        if woke.is_some() {
            nap_len = TAIL_NAP;
        }
        answer_asks(answers, woke, &*sink, serving);
        // A write arriving while the tail naps is taken in that nap, for the same reason — and a
        // session mark, which the user presses because the log has gone quiet, lands almost always
        // in exactly this nap.
        answer_writes(writes, sink, serving);
        // A subscription opened while the tail is napping is owed a reset, for the same reason:
        // serving here makes the wait for a full window one nap instead of one poll. Nothing is
        // built when nothing owes and nothing moved.
        serving.tick(world, generation, &*sink);
    }
}

/// One nap: wait at most `at_most` for an ask, and hand it back the moment it lands.
///
/// `None` is a nap that ran its length with nobody asking. A door with no sender left is slept on
/// rather than returned from at once: the world drops this generation's sender only in the critical
/// section that disowns it, so the ownership check at the top of the next turn is what ends the
/// loop — and returning early here would turn that one turn into a spin. For at most [`TAIL_NAP`],
/// though, so a long idle nap does not slow a preempted tail's exit.
fn wait_for_ask(answers: &Receiver<Ask>, at_most: Duration) -> Option<Ask> {
    match answers.recv_timeout(at_most) {
        Ok(ask) => Some(ask),
        Err(RecvTimeoutError::Timeout) => None,
        Err(RecvTimeoutError::Disconnected) => {
            thread::sleep(at_most.min(TAIL_NAP));
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{wait_for_ask, Quiet, IDLE_NAP, QUIET_AFTER, TAIL_NAP};
    use crate::ingest::{Ask, PerfAsk};
    use std::sync::mpsc::channel;
    use std::time::{Duration, Instant};

    /// Long enough that a wait which slept it out instead of waking could never pass for one that
    /// woke, on any machine this suite runs on.
    const LONG_NAP: Duration = Duration::from_secs(10);

    /// An ask, with the receiving end of its answer dropped — the door only cares that one arrived.
    fn an_ask() -> Ask {
        let (answer, _wait) = channel();
        Ask::Perf(PerfAsk { answer })
    }

    #[test]
    fn an_ask_sent_mid_nap_ends_the_nap_the_moment_it_lands() {
        let (asks, answers) = channel::<Ask>();
        let asker = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(20));
            asks.send(an_ask()).expect("the nap is listening");
            // Held until the nap is over, so a disconnect can never be what woke it.
            std::thread::sleep(Duration::from_millis(200));
        });
        let started = Instant::now();
        let woke = wait_for_ask(&answers, LONG_NAP);
        let waited = started.elapsed();
        assert!(
            matches!(woke, Some(Ask::Perf(_))),
            "the ask that woke the nap is handed back"
        );
        assert!(
            waited < LONG_NAP / 4,
            "woke after {waited:?}, which is sleeping the nap out rather than waking for the ask"
        );
        asker.join().expect("the asker");
    }

    #[test]
    fn an_ask_already_waiting_is_answered_without_napping_at_all() {
        let (asks, answers) = channel::<Ask>();
        asks.send(an_ask()).expect("send");
        let started = Instant::now();
        assert!(wait_for_ask(&answers, LONG_NAP).is_some());
        assert!(started.elapsed() < LONG_NAP / 4);
    }

    #[test]
    fn a_quiet_door_naps_its_full_length_and_returns_nothing() {
        let (_asks, answers) = channel::<Ask>();
        let nap = Duration::from_millis(30);
        let started = Instant::now();
        assert!(wait_for_ask(&answers, nap).is_none());
        assert!(started.elapsed() >= nap, "a nap is a nap, not a busy poll");
    }

    #[test]
    fn a_door_nobody_can_ask_through_is_slept_out_rather_than_spun_on() {
        let (asks, answers) = channel::<Ask>();
        drop(asks);
        let started = Instant::now();
        assert!(wait_for_ask(&answers, TAIL_NAP).is_none());
        assert!(
            started.elapsed() >= TAIL_NAP,
            "a disowned fold's door must not turn the nap loop into a spin"
        );
    }

    #[test]
    fn a_dead_door_cuts_a_long_idle_nap_to_a_short_one() {
        let (asks, answers) = channel::<Ask>();
        drop(asks);
        let started = Instant::now();
        assert!(wait_for_ask(&answers, LONG_NAP).is_none());
        assert!(
            started.elapsed() < LONG_NAP / 4,
            "a preempted tail must not sleep out an idle nap before it notices"
        );
    }

    #[test]
    fn the_nap_is_short_while_lines_arrive_and_long_once_the_log_has_been_quiet() {
        let mut quiet = Quiet::new();
        assert_eq!(quiet.nap(), TAIL_NAP, "a fold that just landed is busy");
        quiet.since = Instant::now()
            .checked_sub(QUIET_AFTER)
            .expect("a past instant");
        quiet.folded(false);
        assert_eq!(
            quiet.nap(),
            IDLE_NAP,
            "a poll that folded nothing keeps it quiet"
        );
        quiet.folded(true);
        assert_eq!(quiet.nap(), TAIL_NAP, "the first line snaps it back");
    }
}
