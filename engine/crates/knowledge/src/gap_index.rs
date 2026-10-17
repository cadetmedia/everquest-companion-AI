//! The gaps module's index off the committed corpora — see [`fold::knowledge::GapIndex`]. Apart
//! from `lib.rs` so that file stays under its recorded size.

use fold::knowledge::GapIndex;
use serde_json::{Map, Value};

/// The item keys with their pages, every effect an item states, and the mob catalog's names.
pub(crate) fn build(items: &Map<String, Value>, mob_names: &[String]) -> GapIndex {
    let page = |k: &String, e: &Value| e["page"].as_str().unwrap_or(k).to_string();
    let item_pages = items.iter().map(|(k, e)| (k.clone(), page(k, e))).collect();
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
