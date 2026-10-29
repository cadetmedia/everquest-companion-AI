//! An immunity is not a resist (owner, 2026-10-28). The lines are the owner's own, cut from his log.

use super::ledger_file::ResistRowFile;
use super::{is_immunity_sentence, ResistModule};
use crate::event::Event;
use crate::EqModule;
use eqlog::event::{Ev, Kind};

fn fold(lines: &[&str]) -> Vec<ResistRowFile> {
    let parser = eqlog::parser_for("Drywrought", eqlog::Tz::UTC);
    let mut module = ResistModule::new();
    let mut ev = Ev::new();
    for (i, line) in lines.iter().enumerate() {
        assert!(parser.parse_event(line, i as i64 + 1, &mut ev), "{line}");
        module.on_event(&Event::typed(ev.payload()), false);
    }
    module
        .user_ledger_file()
        .sources
        .into_iter()
        .flat_map(|s| s.rows)
        .collect()
}

fn row<'a>(rows: &'a [ResistRowFile], spell: &str) -> &'a ResistRowFile {
    rows.iter()
        .find(|r| r.spell_key == spell)
        .unwrap_or_else(|| panic!("no row for {spell}: {rows:?}"))
}

#[test]
fn the_client_immunity_sentences_are_recognised_and_the_portion_ones_are_not() {
    for yes in [
        "Your target is immune to root spells.",
        "Your target is immune to snare spells.",
        "Your target is immune to fear spells.",
        "Your target is immune to changes in its attack speed.",
        "Your target is immune to the Allure spell.",
        "Your target cannot be mesmerized.",
        "Your target cannot be mesmerized (with this spell).",
        "This NPC cannot be charmed.",
        "A kobold noble is immune to pull spells.",
    ] {
        assert!(is_immunity_sentence(yes), "{yes}");
    }
    for no in [
        "Your target is immune to the stun portion of this effect.",
        "Your target is immune to the memory blur portion of this effect.",
        "A kobold noble resisted your Beguile!",
    ] {
        assert!(!is_immunity_sentence(no), "{no}");
    }
}

/// The fold reads them off `unknown`, so the parser must keep leaving them there.
#[test]
fn the_parser_leaves_the_immunity_sentences_unclaimed() {
    let parser = eqlog::parser_for("Drywrought", eqlog::Tz::UTC);
    let mut ev = Ev::new();
    for text in [
        "Your target is immune to root spells.",
        "This NPC cannot be charmed.",
    ] {
        assert!(parser.parse_event(&format!("[Sat Oct 24 02:16:44 2026] {text}"), 1, &mut ev));
        assert_eq!(ev.payload().kind(), Kind::Unknown, "{text}");
    }
}

#[test]
fn a_resist_the_game_explained_as_an_immunity_is_counted_apart_and_a_later_one_is_a_resist() {
    let rows = fold(&[
        "[Fri Sep 25 23:07:42 2026] This NPC cannot be charmed.",
        "[Fri Sep 25 23:07:42 2026] A kobold noble resisted your Beguile!",
        "[Fri Sep 25 23:07:50 2026] A kobold noble resisted your Beguile!",
    ]);
    let beguile = row(&rows, "beguile");
    assert_eq!((beguile.resist, beguile.immune), (1, Some(1)));
}

/// One sentence explains one line, and only within its own second.
#[test]
fn an_immunity_explains_one_resist_and_goes_stale() {
    let rows = fold(&[
        "[Sat Oct 24 02:16:44 2026] Your target is immune to root spells.",
        "[Sat Oct 24 02:16:44 2026] A scavenging gnawer resisted your Instill II!",
        "[Sat Oct 24 02:16:44 2026] A scavenging gnawer resisted your Instill II!",
        "[Sat Oct 24 02:16:50 2026] Your target is immune to root spells.",
        "[Sat Oct 24 02:16:55 2026] A scavenging gnawer resisted your Instill II!",
    ]);
    let instill = row(&rows, "instill");
    assert_eq!((instill.resist, instill.immune), (2, Some(1)));
}

/// The stun portion is followed by the spell landing, so it must not swallow the next resist.
#[test]
fn a_portion_immunity_leaves_the_next_resist_a_resist() {
    let rows = fold(&[
        "[Wed Aug 05 20:44:31 2026] Your target is immune to the stun portion of this effect.",
        "[Wed Aug 05 20:44:31 2026] A fire giant warrior resisted your Discordant Mind!",
    ]);
    let mind = row(&rows, "discordant mind");
    assert_eq!((mind.resist, mind.immune), (1, None));
}

/// The sentence is said to the caster alone, so another caster's resist is never explained by it.
#[test]
fn an_immunity_never_explains_another_casters_resist() {
    let rows = fold(&[
        "[Fri Sep 25 23:07:42 2026] This NPC cannot be charmed.",
        "[Fri Sep 25 23:07:42 2026] A kobold noble resisted Kamas's Beguile!",
    ]);
    let beguile = row(&rows, "beguile");
    assert_eq!((beguile.resist, beguile.immune), (1, None));
}

/// The immunity lands on the row the resist would have, so the published counts do not move.
#[test]
fn an_immunity_files_on_the_row_the_resist_would_have_used() {
    let with = fold(&[
        "[Fri Sep 25 23:07:42 2026] This NPC cannot be charmed.",
        "[Fri Sep 25 23:07:42 2026] A kobold noble resisted your Beguile!",
    ]);
    let without = fold(&["[Fri Sep 25 23:07:42 2026] A kobold noble resisted your Beguile!"]);
    assert_eq!(with.len(), without.len());
    assert_eq!(with[0].mob_key, without[0].mob_key);
}
