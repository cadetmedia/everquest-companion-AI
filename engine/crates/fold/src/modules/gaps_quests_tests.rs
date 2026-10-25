// The quest facts' tests (gaps_quests.rs), kept beside it as gaps_quest_log_tests.rs is.

use super::{refused_here, said_of, task_of, QuestFacts};
use serde_json::json;

#[test]
fn the_task_and_keyword_lines_read_as_the_log_prints_them() {
    assert_eq!(
        task_of("Your task 'Alchemical Solution' has been updated."),
        Some("Alchemical Solution")
    );
    assert_eq!(
        task_of("You have been assigned the task 'Hate, Betrayal, and Trust'."),
        Some("Hate, Betrayal, and Trust")
    );
    assert_eq!(said_of("You say, 'ready'"), Some("ready"));
    assert_eq!(said_of("You say, 'Hail, Ty`Klerr'"), None);
    assert_eq!(
        said_of("You say, 'this is a whole long sentence of chat to the group'"),
        None
    );
}

/// The owner's log, 2026-10-22: Encoded Missive from Ty`Klerr, turned in to Dorian G`Wyn.
#[test]
fn a_quest_item_knows_its_giver_its_keywords_its_turn_in_and_its_quest() {
    let mut q = QuestFacts::default();
    let t = |s: i64| 1_787_000_000_000 + s * 1000;
    q.said.push_back((t(0), "Dorian".into()));
    // Ty`Klerr is shaped like a player name: her [keyword] lines make her an NPC.
    q.keyword_speakers.insert("Ty`Klerr".into());
    q.last_npc = Some(("Ty`Klerr".into(), t(10)));
    q.said.push_back((t(5), "ready".into()));
    q.said.push_back((t(8), "report".into()));
    assert!(q.given("Encoded Missive", t(11), Some("Neriak - Foreign Quarter")));
    assert!(q.task("Alchemical Solution", t(11)));
    assert!(q.offered("Encoded Missive", "Dorian G`Wyn", t(200)));
    assert!(q.trade_done("Dorian G`Wyn"), "the completed trade is the turn-in");
    assert!(
        !q.offered("Ancient Signet Ring", "Malkil", t(201)),
        "a player is no turn-in"
    );
    assert!(
        q.task("Alchemical Solution", t(206)),
        "the task line after the turn-in ties the quest to Dorian"
    );
    assert!(
        !q.task("Alchemical Solution", t(207)),
        "the same quest again changes nothing"
    );
    assert_eq!(
        serde_json::to_value(q.of("encoded missive")).unwrap(),
        json!({
            "givenBy": { "npc": "Ty`Klerr", "zone": "Neriak - Foreign Quarter", "keywords": ["Dorian", "ready", "report"] },
            "turnedInTo": [{ "npc": "Dorian G`Wyn", "n": 1 }],
            "quests": ["Alchemical Solution"]
        })
    );
    assert!(q.of("ancient signet ring").is_none());
    // Dorian took the missive just before the task line: his quest.
    assert_eq!(
        q.served(super::Domain::Mob, "dorian g'wyn"),
        Some(json!({ "quests": ["Alchemical Solution"] }))
    );
}

/// Owner's log, 2026-10-22: `Nikko Canti says, '... [help] me restock my catch ...'` then a second
/// later `You have been assigned the task 'Something Fishy'.`: Nikko's page lists the quest.
#[test]
fn an_npc_that_spoke_just_before_a_task_line_gives_that_quest() {
    let mut q = QuestFacts::default();
    let t = |s: i64| 1_787_000_000_000 + s * 1000;
    q.last_npc = Some(("Nikko Canti".into(), t(0)));
    assert!(q.task("Something Fishy", t(1)));
    assert_eq!(
        q.served(super::Domain::Mob, "nikko canti"),
        Some(json!({ "quests": ["Something Fishy"] }))
    );
    // A task line long after says nothing of him.
    q.last_npc = Some(("Guard Shilster".into(), t(100)));
    assert!(!q.task("Something Fishy", t(200)));
    assert_eq!(q.served(super::Domain::Mob, "guard shilster"), None);
}

/// 2026-10-22 23:53:30: Dorian G`Wyn handed another player's offer back beside the player's own.
#[test]
fn a_refusal_is_the_players_only_when_said_to_the_player() {
    let other = "I have no need for this, Otherguy. You can have it back.";
    let mine = "I have no need for this, Testplayer. You can have it back.";
    assert!(!refused_here(other, Some("Testplayer")));
    assert!(refused_here(mine, Some("Testplayer")));
    assert!(refused_here(other, None), "an unknown player keeps every refusal");
    assert!(!refused_here("Well met.", Some("Testplayer")));
}

/// Owner, 2026-10-23: "if i cancel the trade or the npc says i don't want these it shouldn't
/// [count]" (the Innothule Swamp mushrooms: 46 offers to Forager Grikk and a fallen froglok, each
/// handed back with `I have no need for this`; 8 trades on the log were cancelled).
#[test]
fn a_refused_or_cancelled_offer_is_no_turn_in_and_a_completed_one_is() {
    let mut q = QuestFacts::default();
    q.set_player(Some("Testplayer"));
    let t = |s: i64| 1_787_000_000_000 + s * 1000;
    let turned_in = |q: &QuestFacts, item: &str| q.of(item).and_then(|f| serde_json::to_value(f).ok()?.get("turnedInTo").cloned());
    // Four mushrooms in one trade, each handed back.
    for (i, item) in ["Spore Mushroom", "Huge Mushroom Head", "Spore Mushroom", "Multi-Colored Fungus"].iter().enumerate() {
        assert!(q.offered(item, "a fallen froglok", t(i as i64)));
    }
    for i in 0..4 {
        assert!(q.refused("a fallen froglok", t(5 + i)));
    }
    assert!(!q.trade_done("a fallen froglok"), "every offer was handed back");
    assert_eq!(turned_in(&q, "spore mushroom"), None);
    assert_eq!(turned_in(&q, "huge mushroom head"), None);
    // A trade the player called off.
    assert!(q.offered("Spore Mushroom", "Forager Grikk", t(60)));
    assert!(q.offered("Vial of Swamp Water", "Forager Grikk", t(62)));
    assert!(q.cancelled(), "a cancel takes the open offers back");
    assert_eq!(turned_in(&q, "vial of swamp water"), None);
    // A completed trade stands, and a later cancel does not reach back into it.
    assert!(q.offered("Fresh Fish", "Nikko Canti", t(100)));
    assert_eq!(turned_in(&q, "fresh fish"), None, "not before its trade completes");
    assert!(q.trade_done("Nikko Canti"));
    assert!(!q.cancelled(), "nothing open to take back");
    assert_eq!(turned_in(&q, "fresh fish"), Some(json!([{ "npc": "Nikko Canti", "n": 1 }])));
}

/// The owner's log, 2026-10-19: `You offered 1 Pod of Water to a fallen froglok.` then `A fallen froglok
/// says, 'I have no need for this, ...'` — the line opens on the name with a capital, the offer does not.
#[test]
fn a_refusal_opening_on_a_capitalised_article_takes_the_offer_back() {
    let mut q = QuestFacts::default();
    q.set_player(Some("Testplayer"));
    let t = |s: i64| 1_787_000_000_000 + s * 1000;
    assert!(q.offered("Pod of Water", "a fallen froglok", t(0)));
    assert!(q.refused("A fallen froglok", t(1)));
    assert!(!q.trade_done("a fallen froglok"));
    assert!(q.of("pod of water").and_then(|f| serde_json::to_value(f).ok()?.get("turnedInTo").cloned()).is_none());
}

/// Review E4 (an offer is not an acceptance), the owner's log 2026-10-12 19:34:43: `You offered 1
/// Runnyeye Warbeads to Diggins.` then `You must turn in all quest items at once in order to complete
/// this quest.` and no `You complete the trade with Diggins.`: the item was never turned in.
#[test]
fn an_offer_whose_trade_never_completes_is_no_turn_in() {
    let mut q = QuestFacts::default();
    let t = |s: i64| 1_787_000_000_000 + s * 1000;
    // Diggins is shaped like a player name: his [member of 628] line makes him an NPC.
    q.keyword_speakers.insert("Diggins".into());
    assert!(q.offered("Runnyeye Warbeads", "Diggins", t(0)));
    assert!(q.of("runnyeye warbeads").is_none(), "an open offer is no fact yet");
    // Six minutes later another trade completes with Diggins: the stale offer is gone, not counted.
    assert!(q.offered("Bone Chips", "Diggins", t(360)));
    assert!(q.trade_done("Diggins"));
    assert!(q.of("runnyeye warbeads").is_none());
    assert_eq!(
        serde_json::to_value(q.of("bone chips")).unwrap(),
        json!({ "turnedInTo": [{ "npc": "Diggins", "n": 1 }] })
    );
    // A completed trade with another NPC never closes this one's offers.
    assert!(q.offered("Snake Fang", "Vlad Sterovich", t(400)));
    assert!(!q.trade_done("Diggins"));
    assert!(q.of("snake fang").is_none());
}
