//! A quest step's talk (gaps_quest_log.rs THE TALK): the player's lines and the step NPC's, less an
//! NPC line that answers another player. A child of `gaps_quest_log.rs`, apart so that file keeps its size.

use super::{Step, Talk, HAIL_ANSWER_MS, OTHER_MS, TALK_CAP, TALK_MS};

/// Whether `npc`'s line at `at` answers another player: one hailed it, or said something, within
/// OTHER_MS, and the player said nothing in the HAIL_ANSWER_MS before. A line in the step's own
/// second (a hand-in's answer) is the player's.
fn answers_other(s: &Step, npc: &str, at: i64) -> bool {
    if at / 1000 == s.ts / 1000 {
        return false;
    }
    let near = s.others.iter().any(|(o, hailed)| (o - at).abs() <= OTHER_MS && hailed.as_deref().is_none_or(|h| h == npc));
    let mine = s.heard.iter().any(|(t, who, _)| who.is_none() && *t <= at && at - t <= HAIL_ANSWER_MS);
    near && !mine
}

/// Who a heard line is in the step's talk: `You`, or the step's NPC when not answering another player.
fn talk_speaker(s: &Step, who: Option<&str>, at: i64) -> Option<String> {
    match who {
        None => Some("You".to_string()),
        Some(n) if s.npc.as_deref() == Some(n) && !answers_other(s, n, at) => Some(n.to_string()),
        Some(_) => None,
    }
}

/// The step's talk: the player's lines and its NPC's before it, then the NPC's answer. The talk
/// starts at the player's last hail of that NPC, else TALK_MS before the step (Lord Lyfyx was
/// hailed 108 s before the hand-in that answered with the next quest).
pub(super) fn talk_of(s: &Step) -> Vec<Talk> {
    let hail = s.npc.as_ref().map(|n| format!("Hail, {n}"));
    let hailed = s.heard.iter().rev().find(|(_, who, text)| who.is_none() && Some(text) == hail.as_ref());
    let start = hailed.map_or(s.ts - TALK_MS, |(at, _, _)| *at);
    let mut talk: Vec<Talk> = Vec::new();
    for (at, who, text) in s.heard.iter().filter(|(at, _, _)| *at >= start) {
        let Some(who) = talk_speaker(s, who.as_deref(), *at) else {
            continue;
        };
        if !talk.iter().any(|t| t.who == who && t.text == *text) {
            talk.push(Talk { who, text: text.clone(), ms: *at });
        }
    }
    for t in &s.answers {
        if !answers_other(s, &t.who, t.ms) && !talk.iter().any(|x| x.who == t.who && x.text == t.text) {
            talk.push(t.clone());
        }
    }
    let skip = talk.len().saturating_sub(TALK_CAP);
    talk.split_off(skip)
}
