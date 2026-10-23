//! An item record's `otherNames` (the wiki redirects that land on its page) as keys of that record,
//! for [`crate::Corpus`]'s item answers (owner, 2026-10-22: `Halfling Blood` is `Vial of Halfling
//! Blood`). Apart from `lib.rs`, which sits at its recorded size.

use crate::names::item_key;
use serde_json::{Map, Value};
use std::collections::HashMap;

/// Each record's `otherNames` under [`item_key`] → that record's own key, where the name is no key
/// of its own (a redirect never displaces a record).
pub(crate) fn other_name_keys(items: &Map<String, Value>) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for (own, e) in items {
        for other in e["otherNames"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
        {
            let k = item_key(other);
            if !k.is_empty() && !items.contains_key(&k) {
                out.entry(k).or_insert_with(|| own.clone());
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::other_name_keys;
    use serde_json::json;

    #[test]
    fn a_wiki_redirect_to_an_item_page_answers_for_the_item_but_never_displaces_another() {
        // Owner, 2026-10-22: Halfling Blood redirects to Vial of Halfling Blood.
        let items = serde_json::from_value(json!({
            "vial of halfling blood": {"page": "Vial of Halfling Blood", "otherNames": ["Halfling Blood", "Rusty Mace"]},
            "rusty mace": {"page": "Rusty Mace"}
        }))
        .unwrap();
        let keys = other_name_keys(&items);
        assert_eq!(
            keys.get("halfling blood").map(String::as_str),
            Some("vial of halfling blood")
        );
        assert_eq!(keys.get("rusty mace"), None);
        assert_eq!(keys.len(), 1);
    }
}
