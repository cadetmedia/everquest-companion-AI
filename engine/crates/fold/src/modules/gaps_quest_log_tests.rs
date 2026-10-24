//! The quest log against the owner's lines of 2026-10-22 (eqlog_Drywrought_oggok.txt).

use super::{quest_key, QuestLogs};
use serde_json::json;

/// Feeds `(seconds, text)` lines; an item given or offered is `GIVEN:<item>` / `OFFER:<item>|<npc>`,
/// a finished trade `TRADE:<npc>`, a zone change `ZONE:<zone>` (Lake Nerius until one).
fn feed(q: &mut QuestLogs, lines: &[(i64, &str)]) {
    let mut zone = "Lake Nerius".to_string();
    for (s, text) in lines {
        let ts = 1_787_000_000_000 + s * 1000;
        if let Some(item) = text.strip_prefix("GIVEN:") {
            q.given(item, ts);
        } else if let Some((item, npc)) = text.strip_prefix("OFFER:").and_then(|r| r.split_once('|')) {
            q.offered(item, npc, ts, Some(&zone));
        } else if let Some(npc) = text.strip_prefix("TRADE:") {
            q.trade_done(npc);
        } else if let Some(z) = text.strip_prefix("ZONE:") {
            zone = z.to_string();
        } else if text.starts_with("You gain ") && text.ends_with("experience!") {
            // A typed event (`expGain`) in the real fold, never an unparsed line.
            q.experience(ts);
        } else {
            q.line(text, ts, Some(&zone), &format!("2026-10-22 t{s}"));
        }
    }
}

/// The epoch ms `feed` stamps second `s` with.
fn at(s: i64) -> i64 {
    1_787_000_000_000 + s * 1000
}

/// A talk line's speaker and words.
fn said(t: &serde_json::Value) -> (&str, &str) {
    (t["who"].as_str().unwrap_or(""), t["text"].as_str().unwrap_or(""))
}

/// A log whose character is `Testplayer`.
fn played() -> QuestLogs {
    let mut q = QuestLogs::default();
    q.set_player(Some("Testplayer"));
    q
}

/// Unfortunate news, 2026-10-22 23:52:49-23:53:50: three letters offered a minute before the task
/// lines, a refusal said to another player in between, the trade's end after the task lines.
#[test]
fn a_hand_in_is_the_open_trade_however_long_it_stood() {
    let mut q = played();
    feed(
        &mut q,
        &[
            (0, "ZONE:The Temple of Solusek Ro"),
            (0, "You have been assigned the task 'Unfortunate news'."),
            (5, "ZONE:Lake Nerius"),
            (100, "OFFER:Exorbitant Commission|Dorian G`Wyn"),
            (103, "OFFER:A Curt Dismissal|Dorian G`Wyn"),
            (104, "OFFER:Ordination of Might|Dorian G`Wyn"),
            (141, "Dorian G`Wyn says, 'I have no need for this, Otherguy. You can have it back.'"),
            (161, "Your task 'Unfortunate news' has been updated."),
            (161, "Dorian G`Wyn says, 'Curses! ... You, however, Testplayer , you will always be welcome amongst our kind.'"),
            (161, "Your task 'Unfortunate news' has been updated."),
            (161, "Your faction standing with Nerius Trade Association has been adjusted by 200."),
            (161, "You gain experience!"),
            (161, "TRADE:Dorian G`Wyn"),
            (172, "You have completed achievement: Race Unlock - Half Dark Elves"),
        ],
    );
    let v = q.served(&quest_key("Unfortunate news")).unwrap();
    let step = &v["steps"][1];
    assert_eq!(step["npc"], json!("Dorian G`Wyn"));
    assert_eq!(step["offered"], json!(["Exorbitant Commission", "A Curt Dismissal", "Ordination of Might"]));
    assert_eq!(step["achievements"], json!(["Race Unlock - Half Dark Elves"]));
    let said = step["talk"].as_array().unwrap().iter().map(|t| t["text"].as_str().unwrap()).collect::<Vec<_>>().join(" ");
    assert!(said.contains("You, however, Soandso , you"), "the player's name is the wiki's Soandso: {said}");
    assert!(!said.contains("Testplayer"));
    assert_eq!(v["zone"], json!("The Temple of Solusek Ro"), "the start zone is where the task was assigned");
}

#[test]
fn a_finished_or_cancelled_trade_leaves_nothing_for_the_next_step() {
    let mut q = played();
    feed(
        &mut q,
        &[
            (0, "You have been assigned the task 'Call for Aid'."),
            (10, "OFFER:Fish Scales|Nikko Canti"),
            (11, "TRADE:Nikko Canti"),
            (20, "OFFER:Imp Blood|Dorian G`Wyn"),
            (25, "You have cancelled the trade."),
            (40, "You say, 'Hail, Sir Mollin'"),
            (41, "Sir Mollin says, 'Well met.'"),
            (42, "Your task 'Call for Aid' has been updated."),
        ],
    );
    let v = q.served(&quest_key("Call for Aid")).unwrap();
    let step = &v["steps"][1];
    assert!(step.get("offered").is_none(), "spent and cancelled offers are no hand-in: {step}");
    assert_eq!(step["npc"], json!("Sir Mollin"));
}

#[test]
fn a_refusal_said_to_the_player_takes_the_offer_back() {
    let mut q = played();
    feed(
        &mut q,
        &[
            (0, "You have been assigned the task 'Call for Aid'."),
            (10, "OFFER:A Curt Dismissal|Sir Mollin"),
            (11, "Sir Mollin says, 'I have no need for this, Testplayer. You can have it back.'"),
            (12, "OFFER:Plea to Freeport|Sir Mollin"),
            (13, "Your task 'Call for Aid' has been updated."),
        ],
    );
    let v = q.served(&quest_key("Call for Aid")).unwrap();
    assert_eq!(v["steps"][1]["offered"], json!(["Plea to Freeport"]));
}

/// 2026-10-22 23:48:22-23:50:22: a hail answered by an emote with a quote, the hand-in 108 s later.
#[test]
fn an_emote_with_a_quote_from_the_npc_addressed_is_its_line() {
    let mut q = played();
    feed(
        &mut q,
        &[
            (0, "You have been assigned the task 'Call for Aid'."),
            (100, "You say, 'Hail, Lord Lyfyx of Burwood'"),
            (100, "Lord Lyfyx of Burwood bows as a courtesy.  His face gleams as if tinged with red.  'Greetings, my friend.  Welcome to the Temple of Ro.'"),
            (105, "Guard Sheg smirks and shakes his head. 'That's what you get for messing with the Freeport Militia!'"),
            (208, "OFFER:Solusek Petition|Lord Lyfyx of Burwood"),
            (220, "GIVEN:Ordination of Might"),
            (220, "Your task 'Call for Aid' has been updated."),
            (220, "Lord Lyfyx of Burwood says, 'A petition for aid against some unknown evil?'"),
            (220, "TRADE:Lord Lyfyx of Burwood"),
        ],
    );
    let v = q.served(&quest_key("Call for Aid")).unwrap();
    let step = &v["steps"][1];
    assert_eq!(step["npc"], json!("Lord Lyfyx of Burwood"));
    assert_eq!(step["offered"], json!(["Solusek Petition"]));
    assert_eq!(step["given"], json!(["Ordination of Might"]));
    let talk = step["talk"].as_array().unwrap();
    assert_eq!(said(&talk[0]), ("You", "Hail, Lord Lyfyx of Burwood"), "the talk starts at the hail");
    assert_eq!(talk[0]["ms"], json!(at(100)), "each line carries its time, for log order");
    assert_eq!(step["offeredMs"], json!([at(208)]));
    assert_eq!(step["givenMs"], json!([at(220)]));
    assert!(talk.iter().any(|t| t["text"] == json!("Greetings, my friend.  Welcome to the Temple of Ro.")), "{talk:?}");
    assert!(!talk.iter().any(|t| t["text"].as_str().unwrap().contains("Freeport Militia")), "an NPC not addressed is not this step's");
}

#[test]
fn a_quest_first_seen_mid_way_states_no_start_zone() {
    let mut q = played();
    feed(&mut q, &[(0, "Your task 'Something Fishy' has been updated.")]);
    let v = q.served(&quest_key("Something Fishy")).unwrap();
    assert!(v["zone"].is_null());
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
    assert_eq!(said(&talk[0]), ("You", "Hail, Nikko Canti"));
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
            (291, "Ty`Klerr says, 'I have no need for this, Testplayer. You can have it back.'"),
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
    // Assigned in the second of Something Fishy's hand-in: chained from it, with no giver or start
    // zone of its own; Nikko's talk and the hand-in stay on Something Fishy's step.
    let alch = q.served(&quest_key("Alchemical Solution")).unwrap();
    assert_eq!(alch["chainedFrom"], json!("Something Fishy"));
    assert!(alch["giver"].is_null() && alch["zone"].is_null(), "{alch}");
    assert!(alch["steps"][0].get("offered").is_none() && alch["steps"][0].get("talk").is_none());
    assert_eq!(alch["steps"][1]["offered"], json!(["Imp Blood", "Putrid Bile"]));
    assert_eq!(alch["steps"][1]["lines"], json!(2), "two task lines in one second are one step of two lines");
    assert_eq!(alch["steps"].as_array().unwrap().len(), 2);
    assert_eq!(alch["npcs"], json!(["Dorian G`Wyn"]));
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

/// 2026-10-22 23:50:22, the owner's log in this order: the petition's hand-in updates Call for Aid,
/// pays faction and experience, assigns Unfortunate news, then Lord Lyfyx answers. All of it is Call
/// for Aid's last step; Unfortunate news is chained from it, with no giver or start zone of its own.
#[test]
fn a_task_assigned_by_another_quests_hand_in_is_chained_from_it() {
    let mut q = played();
    feed(
        &mut q,
        &[
            (0, "You have been assigned the task 'Call for Aid'."),
            (100, "ZONE:The Temple of Solusek Ro"),
            (100, "You say, 'Hail, Lord Lyfyx of Burwood'"),
            (208, "OFFER:Solusek Petition|Lord Lyfyx of Burwood"),
            (220, "GIVEN:Ordination of Might"),
            (220, "Your task 'Call for Aid' has been updated."),
            (220, "Your faction standing with Nerius Trade Association has been adjusted by 150."),
            (220, "You gain experience!"),
            (220, "You have been assigned the task 'Unfortunate news'."),
            (220, "Lord Lyfyx of Burwood says, 'A petition for aid against some unknown evil?'"),
            (220, "TRADE:Lord Lyfyx of Burwood"),
        ],
    );
    let aid = q.served(&quest_key("Call for Aid")).unwrap();
    let last = &aid["steps"][1];
    assert_eq!(last["next"], json!("Unfortunate news"));
    assert_eq!(last["experience"], json!(true));
    assert_eq!(last["factions"][0]["faction"], json!("Nerius Trade Association"));
    let talk: Vec<_> = last["talk"].as_array().unwrap().iter().map(said).collect();
    assert_eq!(talk.last(), Some(&("Lord Lyfyx of Burwood", "A petition for aid against some unknown evil?")));
    let news = q.served(&quest_key("Unfortunate news")).unwrap();
    assert_eq!(news["chainedFrom"], json!("Call for Aid"));
    assert!(news["giver"].is_null() && news["zone"].is_null(), "{news}");
    let first = &news["steps"][0];
    assert!(first.get("npc").is_none() && first.get("talk").is_none() && first.get("given").is_none(), "{first}");
}

#[test]
fn a_zone_change_ends_an_open_trade() {
    let mut q = played();
    feed(
        &mut q,
        &[
            (0, "You have been assigned the task 'Call for Aid'."),
            (10, "OFFER:Plea to Freeport|Sir Mollin"),
            (20, "ZONE:North Freeport"),
            (40, "You say, 'Hail, Guard Jup'"),
            (41, "Guard Jup says, 'Move along.'"),
            (42, "Your task 'Call for Aid' has been updated."),
        ],
    );
    let step = &q.served(&quest_key("Call for Aid")).unwrap()["steps"][1];
    assert!(step.get("offered").is_none(), "{step}");
    assert_eq!(step["npc"], json!("Guard Jup"));
}

/// The EverQuest Legends Tutorial, 2026-10-23 (owner: "i need to be able to force a quest
/// association"): Doug gives errands with no task line at all. His visit is served whole, once, the
/// player's name written Soandso; chat on a channel and a player's say never join it.
#[test]
fn a_visit_no_task_line_claims_is_served_for_the_player_to_name() {
    let mut q = played();
    let hello = "Hail and well met, Testplayer. If you'd like to help me with a couple of errands, [let's talk].";
    let errand = "Let's stretch out those legs a bit. Go talk to my old man in the cave to the south.";
    feed(
        &mut q,
        &[
            (0, "ZONE:EverQuest Legends Tutorial"),
            (0, "You say, 'Hail, Doug'"),
            (0, &format!("Doug says, '{hello}'")),
            (2, "Steelriver tells General:2, 'i dont want to be a cleric'"),
            (50, "You say, 'Hail, Doug'"),
            (50, &format!("Doug says, '{hello}'")),
            (57, "You say, 'let's talk'"),
            (58, &format!("Doug says, '{errand}'")),
            (60, "Bacon says, 'hi all'"),
        ],
    );
    let talks = q.served_talks();
    assert_eq!(talks.len(), 1, "one visit: the second hail is inside it");
    let v = serde_json::to_value(talks[0]).unwrap();
    assert_eq!(v["npc"], "Doug");
    assert_eq!(v["zone"], "EverQuest Legends Tutorial");
    assert_eq!(v["id"], format!("Doug@{}", at(0)));
    let lines: Vec<(&str, &str)> = v["talk"].as_array().unwrap().iter().map(said).collect();
    assert_eq!(
        lines,
        vec![
            ("You", "Hail, Doug"),
            ("Doug", "Hail and well met, Soandso. If you'd like to help me with a couple of errands, [let's talk]."),
            ("You", "let's talk"),
            ("Doug", errand),
        ]
    );
}

/// A visit a task step falls in is that quest's already; a zone change ends a visit, so the next hail
/// opens another.
#[test]
fn a_visit_with_a_task_step_in_it_is_claimed_and_a_zone_change_ends_one() {
    let mut q = played();
    feed(
        &mut q,
        &[
            (0, "You say, 'Hail, Nikko Canti'"),
            (0, "Nikko Canti says, 'Would you be willing to [help] me restock my catch?'"),
            (3, "You say, 'help'"),
            (4, "You have been assigned the task 'Something Fishy'."),
            (4, "Nikko Canti says, 'That's so kind of you!'"),
            (30, "ZONE:Nektulos Forest"),
            (40, "You say, 'Hail, a Nektulos ranger'"),
            (40, "a Nektulos ranger says, 'Well met.'"),
            (50, "ZONE:Lake Nerius"),
            (60, "You say, 'Hail, a Nektulos ranger'"),
        ],
    );
    let ids: Vec<String> = q.served_talks().iter().map(|e| serde_json::to_value(e).unwrap()["id"].as_str().unwrap_or("").to_string()).collect();
    assert_eq!(ids, vec![format!("a Nektulos ranger@{}", at(40)), format!("a Nektulos ranger@{}", at(60))]);
}
