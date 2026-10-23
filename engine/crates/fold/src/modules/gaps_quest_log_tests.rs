//! The quest log against the owner's lines of 2026-10-22 (eqlog_Drywrought_oggok.txt).

use super::{quest_key, QuestLogs};
use serde_json::json;

/// Feeds `(seconds, text)` lines; an item given or offered is `GIVEN:<item>` / `OFFER:<item>|<npc>`.
fn feed(q: &mut QuestLogs, lines: &[(i64, &str)]) {
    for (s, text) in lines {
        let ts = 1_787_000_000_000 + s * 1000;
        if let Some(item) = text.strip_prefix("GIVEN:") {
            q.given(item, ts);
        } else if let Some((item, npc)) = text.strip_prefix("OFFER:").and_then(|r| r.split_once('|')) {
            q.offered(item, npc, ts);
        } else {
            q.line(text, ts, Some("Lake Nerius"), &format!("2026-10-22 t{s}"));
        }
    }
}

#[test]
fn an_assignment_names_its_giver_and_the_talk_that_led_to_it() {
    let mut q = QuestLogs::default();
    feed(
        &mut q,
        &[
            (0, "You say, 'Hail, Nikko Canti'"),
            (0, "Nikko Canti says, 'Oi, you there! Are you the one who's been sneak thieving my fish!? Well come on now was it you or [not]?'"),
            (2, "Malkil says, 'help'"),
            (35, "You say, 'feed'"),
            (36, "Nikko Canti says, 'Would you be willing to [help] me restock my catch so that my family may eat?'"),
            (39, "You say, 'help'"),
            (39, "You have been assigned the task 'Something Fishy'."),
            (39, "Nikko Canti says, 'That's so kind of you! Here I have an old fishing pole you can use, and some bait!'"),
            // A catch updates the task with no NPC.
            (400, "Your task 'Something Fishy' has been updated."),
        ],
    );
    let v = q.served(&quest_key("Something Fishy")).unwrap();
    assert_eq!(v["giver"], json!("Nikko Canti"));
    assert_eq!(v["zone"], json!("Lake Nerius"));
    let talk = &v["steps"][0]["talk"];
    assert_eq!(talk[0], json!({ "who": "You", "text": "Hail, Nikko Canti" }));
    assert!(!talk.as_array().unwrap().iter().any(|t| t["who"] == "Malkil"), "another player's words never count");
    assert_eq!(talk.as_array().unwrap().last().unwrap()["text"], json!("That's so kind of you! Here I have an old fishing pole you can use, and some bait!"));
    assert_eq!(v["steps"][1]["kind"], json!("updated"));
    assert!(v["steps"][1].get("npc").is_none(), "a catch names no NPC");
}

#[test]
fn a_hand_in_step_gets_its_items_factions_experience_and_the_next_quest() {
    let mut q = QuestLogs::default();
    feed(
        &mut q,
        &[
            (0, "You have been assigned the task 'Something Fishy'."),
            (60, "OFFER:Defiled Fish Scales|Nikko Canti"),
            (61, "GIVEN:Defiled Fish Scales"),
            (61, "Your task 'Something Fishy' has been updated."),
            (61, "Your faction standing with Nerius Trade Association has been adjusted by 10."),
            (61, "You gain experience!"),
            (61, "You have been assigned the task 'Alchemical Solution'."),
            // A refused hand-in is no hand-in: Dorian hands the Imp Blood back.
            (290, "OFFER:Imp Blood|Ty`Klerr"),
            (291, "Ty`Klerr says, 'I have no need for this, Drywrought. You can have it back.'"),
            // Two lines of one task in a second are one step.
            (300, "OFFER:Imp Blood|Dorian G`Wyn"),
            (302, "OFFER:Putrid Bile|Dorian G`Wyn"),
            (303, "Your task 'Alchemical Solution' has been updated."),
            (303, "Dorian G`Wyn says, 'Ahh, excellent! I've got a plan that I think will work.'"),
            (303, "Your task 'Alchemical Solution' has been updated."),
            // Assigned again: a re-run, not logged twice.
            (900, "You have been assigned the task 'Something Fishy'."),
        ],
    );
    let fishy = q.served(&quest_key("Something Fishy")).unwrap();
    let last = &fishy["steps"][1];
    assert_eq!(last["npc"], json!("Nikko Canti"));
    assert_eq!(last["offered"], json!(["Defiled Fish Scales"]));
    assert_eq!(last["given"], json!(["Defiled Fish Scales"]));
    assert_eq!(last["factions"][0]["faction"], json!("Nerius Trade Association"));
    assert_eq!(last["experience"], json!(true));
    assert_eq!(last["next"], json!("Alchemical Solution"));
    assert_eq!(fishy["reruns"], json!(1));
    assert_eq!(fishy["steps"].as_array().unwrap().len(), 2);
    let alch = q.served(&quest_key("Alchemical Solution")).unwrap();
    assert_eq!(alch["giver"], json!("Nikko Canti"), "the hand-in that assigned it");
    assert_eq!(alch["steps"][1]["offered"], json!(["Imp Blood", "Putrid Bile"]));
    assert_eq!(alch["steps"].as_array().unwrap().len(), 2);
    assert_eq!(alch["npcs"], json!(["Nikko Canti", "Dorian G`Wyn"]));
}

#[test]
fn a_keyword_step_is_the_npc_that_spoke_or_the_one_that_answers() {
    let mut q = QuestLogs::default();
    feed(
        &mut q,
        &[
            (0, "You have been assigned the task 'What`s going on here?'."),
            (90, "You say, 'barriers'"),
            (90, "The Great Zultor says, 'Firstly, the Clockwork Council of Ak'Anon must throw open the doors of the tinkering art.'"),
            (91, "You say, 'timeline'"),
            (91, "Your task 'What`s going on here?' has been updated."),
            (300, "You say, 'dorian'"),
            (300, "Blergagh says, 'Dorian our best customer. Buys many plants. Dunno why, but does not [smell] like other human.'"),
            (302, "You say, 'smell'"),
            (302, "Your task 'What`s going on here?' has been updated."),
            (303, "Blergagh says, 'Ya know, rat smell like rat.'"),
        ],
    );
    let v = q.served(&quest_key("What's going on here?")).unwrap();
    assert_eq!(v["steps"][1]["npc"], json!("The Great Zultor"));
    assert_eq!(v["steps"][2]["npc"], json!("Blergagh"));
    let talk: Vec<String> = v["steps"][2]["talk"].as_array().unwrap().iter().map(|t| t["text"].as_str().unwrap().to_string()).collect();
    assert_eq!(talk.first().map(String::as_str), Some("dorian"));
    assert_eq!(talk.last().map(String::as_str), Some("Ya know, rat smell like rat."));
}
