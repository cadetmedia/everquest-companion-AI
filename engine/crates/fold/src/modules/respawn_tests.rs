//! `respawn.rs` on synthetic events: a confirmed sighting moving the clock, and the respawn sample
//! ending at the first sign of life (owner ruling 2026-10-11).

use super::respawn::{RespawnModule, RespawnPrefs, RespawnRow, RespawnWatchPref};
use crate::event::Event;
use crate::EqModule;

/// The zone line the stay begins with. Every timestamp below is derived from this one, so the
/// arithmetic in the assertions reads instead of being a set of magic epochs.
const T_ZONE: i64 = 1_787_181_000_000;
/// The kill that starts the clock — a minute into the stay.
const T_DEATH: i64 = T_ZONE + 60_000;
/// The line that names the mob again, two minutes after it died. It moves no clock on its own.
const T_SEEN: i64 = T_DEATH + 120_000;
/// Ten seconds later — where the ordering clock stands while the assertions read rows.
const NOW: i64 = T_SEEN + 10_000;
/// The spawn, 9.5 minutes after the death — the owner's Lower Guk cycle — and the kill 70 s into
/// the fight that follows.
const T_UP: i64 = T_DEATH + 570_000;
const T_SECOND_DEATH: i64 = T_UP + 70_000;

/// The user's own number, so the estimate ladder answers `custom` and the countdown is a round
/// minute.
const CUSTOM_SEC: i64 = 60;

fn watching_the_knight() -> RespawnPrefs {
    RespawnPrefs {
        watches: vec![RespawnWatchPref {
            key: "a vis ghoul knight".to_owned(),
            display: "a vis ghoul knight".to_owned(),
            custom_sec: Some(CUSTOM_SEC),
        }],
    }
}

fn ev(json: &str) -> Event<'static> {
    Event::from_json(json).expect("a JSON object")
}

fn zone(ts: i64) -> String {
    format!(r#"{{"kind":"zone","seq":0,"ts":{ts},"raw":"z","zone":"The Ruins of Old Guk"}}"#)
}

fn death(seq: i64, ts: i64) -> String {
    format!(
        r#"{{"kind":"death","seq":{seq},"ts":{ts},"raw":"d","name":"a vis ghoul knight","bySelf":true}}"#
    )
}

/// `<Mob> hits YOU for N points of damage.` — the shape the e2e plays.
fn hits_you(seq: i64, ts: i64) -> String {
    format!(
        r#"{{"kind":"damage","seq":{seq},"ts":{ts},"raw":"h","attacker":"a vis ghoul knight","target":"You","amount":106}}"#
    )
}

/// A module standing in Old Guk, one kill deep, with the mob seen alive since.
fn seen_after_a_kill() -> RespawnModule {
    let mut m = RespawnModule::new(NOW, watching_the_knight());
    m.on_event(&ev(&zone(T_ZONE)), false);
    m.on_event(&ev(&death(1, T_DEATH)), false);
    m.on_event(&ev(&hits_you(2, T_SEEN)), true);
    m
}

fn only_row(m: &RespawnModule) -> RespawnRow {
    let mut rows = m.watch_rows(NOW);
    assert_eq!(rows.len(), 1, "the watch list has exactly one mob in it");
    rows.remove(0)
}

#[test]
fn confirming_a_sighting_re_bases_the_clock_and_says_that_is_what_happened() {
    // The app never does this by itself: the fixture lit the row with a combat line naming a
    // watched mob and the clock did not move, and this call is the person confirming it.
    let mut m = seen_after_a_kill();

    let before = only_row(&m);
    assert_eq!(before.basis, "death", "evidence alone touches no clock");
    assert_eq!(before.base_ts, T_DEATH);
    assert_eq!(before.seen_ts, Some(T_SEEN));
    let rev_before = m.revision();

    assert!(m.confirm_sighting(&before.id));

    let after = only_row(&m);
    assert!(
        m.revision() > rev_before,
        "a confirmation must advance the module revision too — it advances no log seq"
    );
    assert_eq!(
        after.base_ts, T_SEEN,
        "the clock now counts from the sighting"
    );
    assert_eq!(after.basis, "sighting");
    // The row leaves the seen state, because the evidence is now AT the base rather than after
    // it. Fresh evidence will mark it again, which is correct: it is up.
    assert_eq!(after.seen_ts, None);
    assert_eq!(after.seen_via, None);
    // A confirmation is not a death and never a gap sample, so the ladder learned nothing.
    assert_eq!(after.samples, 0);
    assert_eq!(after.kills, 1);
    assert_eq!(after.estimate_ms, Some(CUSTOM_SEC * 1000));
    assert_eq!(after.source, "custom");
}

#[test]
fn a_kill_of_the_seen_mob_resumes_the_normal_death_driven_clock() {
    // The later of (death, confirmation) wins by arithmetic, so the next kill takes the base
    // back with no code anywhere that undoes a confirmation.
    let mut m = seen_after_a_kill();
    let id = only_row(&m).id;
    assert!(m.confirm_sighting(&id));
    assert_eq!(only_row(&m).basis, "sighting");

    let t_second_death = T_DEATH + 420_000;
    m.on_event(&ev(&death(3, t_second_death)), true);

    let row = only_row(&m);
    assert_eq!(row.basis, "death");
    assert_eq!(row.base_ts, t_second_death);
    assert_eq!(row.kills, 2);
    assert_eq!(row.seen_ts, None);
    // The gap ends at the first sign of life after the death — the hit at T_SEEN — never at the
    // confirmation, and the fight after it is not respawn time.
    assert_eq!(row.samples, 1);
    assert_eq!(row.observed_ms, Some(T_SEEN - T_DEATH));
}

#[test]
fn a_confirmation_with_nothing_to_confirm_is_refused_rather_than_invented() {
    // Neither refusal may move a clock, and neither may move the revision — a push carrying no
    // change would make every dedupe downstream a lie.
    let mut m = RespawnModule::new(NOW, watching_the_knight());
    m.on_event(&ev(&zone(T_ZONE)), false);
    m.on_event(&ev(&death(1, T_DEATH)), false);

    let row = only_row(&m);
    let rev = m.revision();
    assert!(
        !m.confirm_sighting(&row.id),
        "the row is due, but nothing has been seen"
    );
    assert!(!m.confirm_sighting("no such row"));
    assert_eq!(m.revision(), rev, "a refusal publishes nothing");
    assert_eq!(only_row(&m).basis, "death");
}

// ── The sample ends at the first sign of life ────────────────────────────────────────────────

/// Every line family that says the knight is alive, with the `seenVia` it reports.
fn signs_of_life(seq: i64, ts: i64) -> Vec<(&'static str, String, &'static str)> {
    vec![
        (
            "it casts",
            format!(
                r#"{{"kind":"otherCastBegin","seq":{seq},"ts":{ts},"raw":"c","caster":"a vis ghoul knight","spell":"Summon Dead"}}"#
            ),
            "spell",
        ),
        ("it attacks", hits_you(seq, ts), "combat"),
        (
            "something attacks it",
            format!(
                r#"{{"kind":"damage","seq":{seq},"ts":{ts},"raw":"h","attacker":"Revilus","target":"a vis ghoul knight","amount":40}}"#
            ),
            "combat",
        ),
        (
            "someone hails it",
            format!(
                r#"{{"kind":"unknown","seq":{seq},"ts":{ts},"raw":"[Sun Oct 11 20:41:59 2026] You say, 'Hail, a vis ghoul knight'"}}"#
            ),
            "say",
        ),
        (
            "it speaks",
            format!(
                r#"{{"kind":"unknown","seq":{seq},"ts":{ts},"raw":"[Sun Oct 11 20:41:59 2026] a vis ghoul knight says, 'Your flesh will feed my hounds.'"}}"#
            ),
            "say",
        ),
        (
            "it kills something",
            format!(
                r#"{{"kind":"death","seq":{seq},"ts":{ts},"raw":"d","name":"Revilus","bySelf":false,"killer":"a vis ghoul knight"}}"#
            ),
            "combat",
        ),
        (
            "its emote",
            format!(
                r#"{{"kind":"spellEmote","seq":{seq},"ts":{ts},"raw":"e","subject":"a vis ghoul knight","text":"a vis ghoul knight feels very dispelled."}}"#
            ),
            "spell",
        ),
    ]
}

#[test]
fn every_sign_of_life_lights_the_row_and_ends_the_gap_there() {
    for (what, line, via) in signs_of_life(2, T_UP) {
        let mut m = RespawnModule::new(NOW, watching_the_knight());
        m.on_event(&ev(&zone(T_ZONE)), false);
        m.on_event(&ev(&death(1, T_DEATH)), false);
        m.on_event(&ev(&line), true);

        let row = only_row(&m);
        assert_eq!(row.seen_ts, Some(T_UP), "{what}: the Timers row reads UP");
        assert_eq!(row.seen_via, Some(via), "{what}");
        assert_eq!(
            row.base_ts, T_DEATH,
            "{what}: the clock itself does not move"
        );

        m.on_event(&ev(&death(3, T_SECOND_DEATH)), true);
        let row = only_row(&m);
        assert_eq!(row.samples, 1, "{what}");
        assert_eq!(
            row.observed_ms,
            Some(570_000),
            "{what}: the sample is death to first sighting, not death to death"
        );
        assert_eq!(row.gaps_ms, Some(vec![570_000]), "{what}");
    }
}

#[test]
fn with_nothing_seen_between_the_next_death_ends_the_gap() {
    let mut m = RespawnModule::new(NOW, watching_the_knight());
    m.on_event(&ev(&zone(T_ZONE)), false);
    m.on_event(&ev(&death(1, T_DEATH)), false);
    m.on_event(&ev(&death(2, T_SECOND_DEATH)), true);
    let row = only_row(&m);
    assert_eq!(row.samples, 1);
    assert_eq!(row.observed_ms, Some(640_000));
}

#[test]
fn a_mention_inside_the_minute_is_the_same_pull_not_the_spawn() {
    // A second knight in the pull swings 30 s after the first died; the spawn is seen at 570 s.
    let mut m = RespawnModule::new(NOW, watching_the_knight());
    m.on_event(&ev(&zone(T_ZONE)), false);
    m.on_event(&ev(&death(1, T_DEATH)), false);
    m.on_event(&ev(&hits_you(2, T_DEATH + 30_000)), true);
    m.on_event(&ev(&hits_you(3, T_UP)), true);
    m.on_event(&ev(&death(4, T_SECOND_DEATH)), true);
    let row = only_row(&m);
    assert_eq!(row.observed_ms, Some(570_000));

    // And with only the early swing, the gap falls back to death→death.
    let mut m = RespawnModule::new(NOW, watching_the_knight());
    m.on_event(&ev(&zone(T_ZONE)), false);
    m.on_event(&ev(&death(1, T_DEATH)), false);
    m.on_event(&ev(&hits_you(2, T_DEATH + 30_000)), true);
    m.on_event(&ev(&death(3, T_SECOND_DEATH)), true);
    assert_eq!(only_row(&m).observed_ms, Some(640_000));
}

#[test]
fn a_zone_line_between_the_deaths_refuses_the_sample_sighting_or_not() {
    let mut m = RespawnModule::new(NOW, watching_the_knight());
    m.on_event(&ev(&zone(T_ZONE)), false);
    m.on_event(&ev(&death(1, T_DEATH)), false);
    m.on_event(&ev(&zone(T_DEATH + 100_000)), false);
    m.on_event(&ev(&hits_you(2, T_UP)), true);
    m.on_event(&ev(&death(3, T_SECOND_DEATH)), true);
    let row = only_row(&m);
    assert_eq!(row.kills, 2);
    assert_eq!(row.samples, 0);
    assert_eq!(row.observed_ms, None);
}

#[test]
fn a_corpse_never_marks_its_own_row_seen() {
    // The death line names the knight; it must not light the row, and the killer field on a
    // slain-by line is somebody else.
    let mut m = RespawnModule::new(NOW, watching_the_knight());
    m.on_event(&ev(&zone(T_ZONE)), false);
    m.on_event(&ev(&death(1, T_DEATH)), false);
    m.on_event(
        &ev(&format!(
            r#"{{"kind":"death","seq":2,"ts":{T_UP},"raw":"d","name":"a vis ghoul knight","bySelf":false,"killer":"Revilus"}}"#
        )),
        true,
    );
    let row = only_row(&m);
    assert_eq!(row.seen_ts, None);
    assert_eq!(row.kills, 2);
    assert_eq!(
        row.observed_ms,
        Some(570_000),
        "the second death ended the gap, as before"
    );
}
