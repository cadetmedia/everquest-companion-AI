//! Which log lines say a watched mob is ALIVE — what `respawn.rs mark_seen` is fed (owner ruling
//! 2026-10-11: any true sign the mob is back up ends the respawn gap and lights the row).
//!
//! A typed family names the mob in a field, and the field is the whole name. A line the parser did
//! not claim (`unknown`) is read for the two speech shapes that also bound the name exactly:
//! `<mob> says, '…'` and `… 'Hail, <mob>'`. The other unclaimed emotes ("X staggers.", "X is
//! leapt upon.") are NOT read: a name can only be cut out of free text by a prefix match, and a
//! watched `a ghoul` would then claim every `a ghoul savant` line. They cost nothing: the owner's
//! log shows the first sign of life is a cast or a swing in every cycle, and the emotes follow.
//! NPC targeting is never printed (`Targeted (NPC)` does not occur in that log).

use crate::event::Event;
use crate::message_overlay::message_text_of;

type Names<'e> = Vec<Option<&'e str>>;

/// The names an event states as alive, and which family stated them. The groups ARE the
/// `RespawnSeenVia` values, so the factoring and the vocabulary agree.
pub fn seen_names_of<'e>(ev: &'e Event<'_>) -> Option<(Names<'e>, &'static str)> {
    if let Some(names) = combat_names(ev) {
        return Some((names, "combat"));
    }
    if let Some(names) = spell_names(ev) {
        return Some((names, "spell"));
    }
    match ev.kind() {
        "consider" => Some((vec![ev.str("mob")], "consider")),
        // A mez / root / charm landed on it, broke on it, or wore off it.
        "cc" | "ccWake" | "charm" | "uncharm" => Some((vec![ev.str("mob")], "hold")),
        "petSay" => Some((vec![ev.str("name")], "say")),
        "unknown" => speech_names(message_text_of(ev.raw())).map(|names| (names, "say")),
        _ => None,
    }
}

fn combat_names<'e>(ev: &'e Event<'_>) -> Option<Names<'e>> {
    match ev.kind() {
        // Somebody swung at it, or it swung at somebody. `attacker` is null on caster-less DoT lines.
        "damage" | "miss" => Some(vec![ev.str("attacker"), ev.str("target")]),
        "heal" => Some(vec![ev.str("healer"), ev.str("target")]),
        // Its blow was absorbed.
        "mitigation" => Some(vec![ev.str("source")]),
        // What it killed is a corpse; the killer is not.
        "death" | "playerDeath" => Some(vec![ev.str("killer")]),
        _ => None,
    }
}

fn spell_names<'e>(ev: &'e Event<'_>) -> Option<Names<'e>> {
    match ev.kind() {
        // A spell named it — as a resister, as a caster, or as the thing something landed on.
        "resist" => Some(vec![ev.str("caster"), ev.str("target")]),
        "otherCastBegin" => Some(vec![ev.str("caster")]),
        "buffApply" | "poisonProc" => Some(vec![ev.str("target")]),
        // `<Name> feels/looks/seems …`; the subject is `self` for the player's own.
        "spellEmote" => Some(vec![ev.str("subject").filter(|s| *s != "self")]),
        _ => None,
    }
}

/// The speaker of `<name> says, '…'` and the name hailed in `… 'Hail, <name>'`, either absent.
/// `You say, '…'` has no speaker worth a clock, and only the hail is read off it.
fn speech_names(text: &str) -> Option<Names<'_>> {
    let (speaker, said) = match text.strip_prefix("You say, '") {
        Some(said) => (None, said),
        None => {
            let i = text.find(" says, '")?;
            (Some(&text[..i]), &text[i + " says, '".len()..])
        }
    };
    let said = said.strip_suffix('\'').unwrap_or(said);
    Some(vec![speaker, said.strip_prefix("Hail, ")])
}

#[cfg(test)]
mod tests {
    use super::speech_names;

    #[test]
    fn speech_names_cut_the_speaker_and_the_hailed_name_exactly() {
        assert_eq!(
            speech_names("Hoptor Thaggelum says, 'You will die.'"),
            Some(vec![Some("Hoptor Thaggelum"), None])
        );
        assert_eq!(
            speech_names("You say, 'Hail, Hoptor Thaggelum'"),
            Some(vec![None, Some("Hoptor Thaggelum")])
        );
        assert_eq!(
            speech_names("Revilus says, 'Hail, a reanimated hand'"),
            Some(vec![Some("Revilus"), Some("a reanimated hand")])
        );
        assert_eq!(speech_names("Hoptor Thaggelum staggers."), None);
    }
}
