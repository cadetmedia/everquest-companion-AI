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
        item_pages,
        item_effects,
        mob_names: mob_names.to_vec(),
    }
}

#[cfg(test)]
mod tests {
    use super::build;
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
}
