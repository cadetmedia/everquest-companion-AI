//! The chains on the tutorial's shapes (eqlog_*_neriak.txt, 2026-10-23), done out of order on purpose:
//! the skulls looted before Dead Doug asked for them, the supplies errand run between the two halves of
//! the bones errand. Names of NPCs and items are the game's; the player is Testplayer.

use super::Threads;
use serde_json::Value;

fn ms(s: i64) -> i64 {
    1_787_000_000_000 + s * 1000
}

fn said(t: &mut Threads, s: i64, npc: &str, text: &str) {
    t.at(&format!("t{s}"), Some("EverQuest Legends Tutorial"));
    t.npc(npc, text, ms(s));
}

fn you(t: &mut Threads, s: i64, text: &str) {
    t.at(&format!("t{s}"), Some("EverQuest Legends Tutorial"));
    match text.strip_prefix("Hail, ") {
        Some(npc) => t.hail(npc, ms(s)),
        None => t.say(text, ms(s)),
    }
}

fn hand(t: &mut Threads, s: i64, npc: &str, items: &[&str]) {
    for i in items {
        t.offer(npc, i);
    }
    t.xp(ms(s));
    t.trade_done(npc, ms(s));
}

/// The step ids of the chain whose name starts `prefix`.
fn ids(threads: &Value, prefix: &str) -> Vec<String> {
    let t = threads.as_array().unwrap().iter().find(|t| t["name"].as_str().unwrap().starts_with(prefix)).unwrap_or_else(|| panic!("no chain {prefix}: {threads}"));
    t["steps"].as_array().unwrap().iter().map(|s| s["id"].as_str().unwrap().to_string()).collect()
}

fn tutorial() -> Threads {
    let mut t = Threads::default();
    you(&mut t, 0, "Hail, Doug");
    said(&mut t, 0, "Doug", "Hail and well met, Soandso. If you'd like to help me with a couple of errands, [let's talk]. If you've already helped my father and still need [more work], just say the word!");
    you(&mut t, 5, "let's talk");
    said(&mut t, 5, "Doug", "Let's stretch out those legs a bit. Go talk to my old man in the cave to the south.");
    you(&mut t, 9, "what else");
    you(&mut t, 12, "more work");
    said(&mut t, 12, "Doug", "Could you do just one more thing for me? Go up the stairs and check on my grandfather, the dead one.");
    // The bones first, before Dead Doug says a word about them.
    t.kill("a fragile pet", ms(20), "t20", Some("EverQuest Legends Tutorial"));
    t.loot("Fragile Pet's Skull", "a fragile pet", ms(22), "t22");
    // The supplies errand, between the two halves of the bones one.
    you(&mut t, 40, "Hail, Old Doug");
    said(&mut t, 40, "Old Doug", "Oh ho! Did my son send you ta [help] me?");
    you(&mut t, 42, "help");
    said(&mut t, 42, "Old Doug", "If you could head down there and pick up my weekly [supplies] for me, it'd be most appreciated.");
    you(&mut t, 44, "supplies");
    said(&mut t, 44, "Old Doug", "I imagine that Dougina, the merchant down at Meeks Depot, has it all packaged up for me.");
    said(&mut t, 50, "Dougina", "Welcome to my shop, Soandso. You would probably find a Decorative Mask handy.");
    t.buy("Dougina", "Package for Old Doug", ms(52), "t52");
    you(&mut t, 70, "Hail, Dead Doug");
    said(&mut t, 70, "Dead Doug", "Hail yourself! I hope you're here to [help]!");
    you(&mut t, 72, "help");
    said(&mut t, 72, "Dead Doug", "Bring me the skull from one of the more rambunctious skeletons, and another skull from one of the [fragile ones].");
    hand(&mut t, 90, "Old Doug", &["Package for Old Doug"]);
    said(&mut t, 90, "Old Doug", "Oh ho! Thank you kindly. Here, take my old boots.");
    hand(&mut t, 120, "Dead Doug", &["Fragile Pet's Skull"]);
    said(&mut t, 120, "Dead Doug", "Here, take these boots, they need a new soul!");
    t
}

#[test]
fn two_errands_done_at_once_are_two_chains_each_in_evidence_order() {
    let threads = tutorial().served();
    let supplies = ids(&threads, "Doug: let's talk");
    assert_eq!(
        supplies,
        ["greet:Doug#0", "ask:Doug:let's talk", "greet:Old Doug#1", "ask:Old Doug:help", "ask:Old Doug:supplies", "buy:Dougina:Package for Old Doug", "handin:Old Doug:Package for Old Doug"],
        "the package is bought before Old Doug asked for it, and still follows his ask"
    );
    let bones = ids(&threads, "Doug: more work");
    assert!(bones.contains(&"kill:a fragile pet".to_string()) && bones.contains(&"handin:Dead Doug:Fragile Pet's Skull".to_string()), "{bones:?}");
    let pos = |id: &str| bones.iter().position(|b| b == id).unwrap();
    // Looted at 0:22, asked for at 1:12: the ask still comes first, and the kill before its loot.
    assert!(pos("ask:Dead Doug:help") < pos("kill:a fragile pet"));
    assert!(pos("kill:a fragile pet") < pos("loot:a fragile pet:Fragile Pet's Skull"));
    assert!(pos("loot:a fragile pet:Fragile Pet's Skull") < pos("handin:Dead Doug:Fragile Pet's Skull"));
    // Neither errand carries the other's steps, an unanswered say, or the shop's patter.
    assert!(!bones.iter().any(|b| b.contains("Old Doug") || b.contains("Dougina")), "{bones:?}");
    assert!(!supplies.iter().any(|b| b.contains("Dead Doug") || b.contains("what else")), "{supplies:?}");
}

#[test]
fn each_step_says_why_it_follows() {
    let threads = tutorial().served();
    let supplies = threads.as_array().unwrap().iter().find(|t| t["name"] == "Doug: let's talk").unwrap();
    let why = |id: &str| -> Vec<String> {
        let s = supplies["steps"].as_array().unwrap().iter().find(|s| s["id"] == id).unwrap();
        s["links"].as_array().unwrap().iter().map(|l| l["detail"].as_str().unwrap().to_string()).collect()
    };
    assert!(why("ask:Old Doug:help").contains(&"said [help]".to_string()));
    assert!(why("greet:Old Doug#1").contains(&"sent to Old Doug".to_string()));
    assert!(why("buy:Dougina:Package for Old Doug").contains(&"named Dougina".to_string()));
    assert!(why("handin:Old Doug:Package for Old Doug").contains(&"Package for Old Doug, bought from Dougina".to_string()));
    let hand = supplies["steps"].as_array().unwrap().last().unwrap();
    assert_eq!(hand["experience"], true);
}
