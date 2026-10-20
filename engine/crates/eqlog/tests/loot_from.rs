//! A loot line names its item and its source with " from " between them, and item names and mob
//! names can both hold " from " of their own. The lines are the real shapes; the first test's line
//! is from a real log, the others put real catalog names into the same shapes.

use eqlog::event::Ev;
use eqlog::{Clock, Parser};
use serde_json::Value;

fn parser() -> Parser {
    Parser::new(
        Clock::new(chrono_tz::America::Los_Angeles),
        None,
        Some("Primitive".to_string()),
    )
}

/// The item, the source and the disposition a line parses to.
fn loot(p: &Parser, text: &str) -> (String, Option<String>, Option<String>) {
    let mut ev = Ev::new();
    assert!(p.parse_event(&format!("[Wed Aug 19 16:21:47 2026] {text}"), 0, &mut ev));
    let v: Value = serde_json::from_str(ev.finish()).unwrap();
    assert_eq!(v["kind"], "loot", "{text}");
    let field = |k: &str| v[k].as_str().map(str::to_string);
    (
        field("item").unwrap(),
        field("source"),
        field("disposition"),
    )
}

fn item_and_source(p: &Parser, text: &str) -> (String, Option<String>) {
    let (item, source, _) = loot(p, text);
    (item, source)
}

fn pair(item: &str, source: &str) -> (String, Option<String>) {
    (item.to_string(), Some(source.to_string()))
}

#[test]
fn an_item_named_from_someone_keeps_its_whole_name() {
    let p = parser();
    assert_eq!(
        loot(
            &p,
            "You looted a Note from Eichvul from erudite traveler's corpse and sold it for free."
        ),
        (
            "Note from Eichvul".to_string(),
            Some("erudite traveler".to_string()),
            Some("sold".to_string())
        )
    );
    assert_eq!(
        item_and_source(
            &p,
            "--You have looted a Notes from the Greenmist Tome from a froglok shin knight's corpse.--"
        ),
        pair("Notes from the Greenmist Tome", "a froglok shin knight")
    );
    assert_eq!(
        item_and_source(
            &p,
            "You looted a Napkin from Crow's from Noble Dojorn's corpse and stored it in your tradeskill depot"
        ),
        pair("Napkin from Crow's", "Noble Dojorn")
    );
}

#[test]
fn a_mob_named_from_somewhere_keeps_its_whole_name() {
    let p = parser();
    assert_eq!(
        item_and_source(
            &p,
            "--You have looted a Bone Chip from a scout from zanivar's corpse.--"
        ),
        pair("Bone Chip", "a scout from zanivar")
    );
    assert_eq!(
        item_and_source(
            &p,
            "You looted a Note from Eichvul from a scout from zanivar's corpse to create a Note from Eichvul +1"
        ),
        pair("Note from Eichvul", "a scout from zanivar")
    );
}

#[test]
fn a_line_with_one_from_splits_there_as_before() {
    let p = parser();
    assert_eq!(
        item_and_source(
            &p,
            "--You have looted an Efreeti War Staff from the Hand of Veeshan's corpse.--"
        ),
        pair("Efreeti War Staff", "the Hand of Veeshan")
    );
    assert_eq!(
        item_and_source(
            &p,
            "You looted 2 Spider Silk from a giant black widow's corpse and sold it for 2 gold, 8 silver and 6 copper."
        ),
        pair("Spider Silk", "a giant black widow")
    );
    assert_eq!(
        item_and_source(&p, "--You have looted a Note from Eichvul.--"),
        ("Note from Eichvul".to_string(), None)
    );
}

fn catalog(path: &str, list: &str, field: &str) -> Vec<String> {
    let root = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../");
    let text = std::fs::read_to_string(format!("{root}{path}")).unwrap();
    let v: Value = serde_json::from_str(&text).unwrap();
    let rows: Vec<&Value> = match &v[list] {
        Value::Array(a) => a.iter().collect(),
        Value::Object(o) => o.values().collect(),
        _ => panic!("{path}: no {list}"),
    };
    rows.iter()
        .filter_map(|r| r[field].as_str().map(str::to_string))
        .collect()
}

/// Every item in the catalog parses whole off a mob with " from " in its name, and every mob in
/// the catalog parses whole under an item with " from " in its name.
#[test]
fn every_catalog_name_survives_the_other_side_holding_from() {
    let p = parser();
    let items = catalog("src/main/data/items.json", "items", "page");
    assert!(items.len() > 10_000, "{}", items.len());
    for item in &items {
        let text = format!("--You have looted a {item} from a scout from zanivar's corpse.--");
        assert_eq!(
            item_and_source(&p, &text),
            pair(item, "a scout from zanivar")
        );
    }
    let mobs = catalog("src/renderer/src/data/eqlegends/mobs.json", "mobs", "name");
    assert!(mobs.len() > 5_000, "{}", mobs.len());
    for mob in &mobs {
        let text = format!("--You have looted a Note from Eichvul from {mob}'s corpse.--");
        assert_eq!(item_and_source(&p, &text), pair("Note from Eichvul", mob));
    }
}
