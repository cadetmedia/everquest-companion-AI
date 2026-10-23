//! The gaps module's index off the committed corpora — see [`fold::knowledge::GapIndex`]. Apart
//! from `lib.rs` so that file stays under its recorded size.

use crate::names::item_key;
use fold::knowledge::GapIndex;
use serde_json::{Map, Value};

/// The item keys with their pages, every effect an item states, and the mob catalog's names.
///
/// A record's `otherNames` (the wiki redirects that land on its page) are keys of that page too:
/// `Halfling Blood` redirects to `Vial of Halfling Blood`, so a looted Halfling Blood is known (owner,
/// 2026-10-22: "no one told you to restrict it to mobs only").
pub(crate) fn build(items: &Map<String, Value>, mob_names: &[String]) -> GapIndex {
    let page = |k: &String, e: &Value| e["page"].as_str().unwrap_or(k).to_string();
    let item_pages = items
        .iter()
        .flat_map(|(k, e)| {
            let others = e["otherNames"].as_array().into_iter().flatten();
            let keys = others
                .filter_map(Value::as_str)
                .map(item_key)
                .filter(|o| !o.is_empty());
            std::iter::once(k.clone())
                .chain(keys.collect::<Vec<_>>())
                .map(move |key| (key, page(k, e)))
        })
        .collect();
    let item_effects = items
        .iter()
        .flat_map(|(k, e)| {
            let effects = e["stats"]["effects"]
                .as_array()
                .cloned()
                .unwrap_or_default();
            let page = page(k, e);
            effects.into_iter().filter_map(move |x| {
                let name = x["name"].as_str()?.trim().to_string();
                (!name.is_empty()).then(|| (name, page.clone()))
            })
        })
        .collect();
    GapIndex {
        item_notices: item_notices(items),
        mob_notices: mob_notices_in(crate::mobs::MOBS_JSON),
        item_pages,
        item_effects,
        mob_names: mob_names.to_vec(),
    }
}

/// A record's `notices` (`DNE`, `delete`, `delete: <reason>`; scripts/sources pageNotices).
fn notices_of(e: &Value) -> Vec<String> {
    let listed = e["notices"].as_array().into_iter().flatten();
    listed.filter_map(Value::as_str).map(str::to_string).collect()
}

/// Every item key, and each redirect name of the record, whose page carries a notice.
fn item_notices(items: &Map<String, Value>) -> Vec<(String, String, Vec<String>)> {
    let mut out = Vec::new();
    for (k, e) in items {
        let notices = notices_of(e);
        if notices.is_empty() {
            continue;
        }
        let page = e["page"].as_str().unwrap_or(k).to_string();
        let others = e["otherNames"].as_array().into_iter().flatten().filter_map(Value::as_str);
        for key in std::iter::once(k.clone()).chain(others.map(item_key)) {
            out.push((key, page.clone(), notices.clone()));
        }
    }
    out
}

/// Every name a mob page whose text carries a notice answers to: its `|name`, title and redirects.
fn mob_notices_in(json: &str) -> Vec<(String, String, Vec<String>)> {
    let file: Value = serde_json::from_str(json).unwrap_or(Value::Null);
    let mut out = Vec::new();
    for m in file["mobs"].as_array().into_iter().flatten() {
        let notices = notices_of(m);
        let Some(page) = m["page"].as_str().filter(|_| !notices.is_empty()) else {
            continue;
        };
        let others = m["otherNames"].as_array().into_iter().flatten().filter_map(Value::as_str);
        let names = [m["name"].as_str(), Some(page)].into_iter().flatten().chain(others);
        out.extend(names.map(|n| (n.to_string(), page.to_string(), notices.clone())));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::{build, mob_notices_in};
    use serde_json::{json, Map, Value};

    #[test]
    fn an_items_other_names_are_keys_of_its_page() {
        // Owner, 2026-10-22: Halfling Blood redirects to Vial of Halfling Blood and was a Gaps row.
        let items: Map<String, Value> = serde_json::from_value(json!({
            "vial of halfling blood": {"page": "Vial of Halfling Blood", "otherNames": ["Halfling Blood"]},
            "rusty mace": {"page": "Rusty Mace"}
        }))
        .unwrap();
        let index = build(&items, &[]);
        let pages: Vec<(&str, &str)> = index
            .item_pages
            .iter()
            .map(|(k, p)| (k.as_str(), p.as_str()))
            .collect();
        assert!(
            pages.contains(&("halfling blood", "Vial of Halfling Blood")),
            "{pages:?}"
        );
        assert!(pages.contains(&("vial of halfling blood", "Vial of Halfling Blood")));
        assert!(pages.contains(&("rusty mace", "Rusty Mace")));
        assert_eq!(pages.len(), 3);
    }

    #[test]
    fn a_page_with_a_notice_is_listed_under_every_name_it_answers_to() {
        // Owner, 2026-10-22: A Rotting Citizen opens {{delete}}{{DNE}}.
        let mobs = r#"{"mobs":[
          {"page":"A Rotting Citizen","name":"a rotting citizen","notices":["delete","DNE"],"otherNames":["Rotting Citizen"]},
          {"page":"A bat","name":"a bat"}
        ]}"#;
        let names: Vec<String> = mob_notices_in(mobs).into_iter().map(|(n, _, _)| n).collect();
        assert_eq!(names, ["a rotting citizen", "A Rotting Citizen", "Rotting Citizen"]);
        let items: Map<String, Value> = serde_json::from_value(json!({
            "old thing": {"page": "Old Thing", "notices": ["delete: No longer in game"], "otherNames": ["Older Thing"]},
            "rusty mace": {"page": "Rusty Mace"}
        }))
        .unwrap();
        let index = build(&items, &[]);
        let keys: Vec<(&str, &str)> = index.item_notices.iter().map(|(k, p, _)| (k.as_str(), p.as_str())).collect();
        assert_eq!(keys, [("old thing", "Old Thing"), ("older thing", "Old Thing")]);
        assert_eq!(index.item_notices[0].2, ["delete: No longer in game"]);
    }
}
