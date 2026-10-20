//! Which mobs the committed catalog pages without a picture — `shared/gapImages.ts imagelessByMob`,
//! keys only. The Gaps tab lists a met mob whose every page is `noImage` (scrape-wiki-files.ts
//! checks each named file against the wiki's file list); the event feed marks its con row the same
//! way, so the overlay asks for the screenshot the tab is counting (owner, 2026-10-20).

use std::collections::HashSet;

use fold::modules::consider::mob_key;
use serde::Deserialize;

/// A catalog page as this reads it: its names and whether its picture is missing. Every field may
/// be absent or null, as the TS reader allows.
#[derive(Deserialize)]
struct Page {
    name: Option<String>,
    page: Option<String>,
    #[serde(default, rename = "otherNames")]
    other_names: Option<Vec<String>>,
    #[serde(default, rename = "noImage")]
    no_image: Option<bool>,
}

#[derive(Deserialize)]
struct Catalog {
    mobs: Vec<Page>,
}

/// Every `mob_key` of a page's `|name`, title or redirect whose pages ALL lack a picture: a name
/// with one pictured page anywhere (`a goblin`, one of whose disambiguated pages has an image) is
/// left out, as the tab leaves it out. Read typed, so no drop table is built for this.
#[must_use]
pub fn imageless_keys_in(json: &str) -> HashSet<String> {
    let catalog: Catalog = serde_json::from_str(json).expect("mobs.json is not readable");
    let mut imageless = HashSet::new();
    let mut pictured = HashSet::new();
    for m in &catalog.mobs {
        let names = m
            .name
            .iter()
            .chain(&m.page)
            .chain(m.other_names.iter().flatten());
        for key in names.map(|n| mob_key(n)) {
            if m.no_image == Some(true) {
                imageless.insert(key);
            } else {
                pictured.insert(key);
            }
        }
    }
    imageless.retain(|key| !pictured.contains(key));
    imageless
}

#[cfg(test)]
mod tests {
    use super::imageless_keys_in;

    #[test]
    fn a_name_is_imageless_only_when_every_page_it_names_lacks_a_picture() {
        let keys = imageless_keys_in(
            r#"{"mobs":[
              {"page":"Basher Trak","name":"Basher Trak","noImage":true},
              {"page":"Basher Smag","name":"Basher Smag","otherNames":null,"noImage":null},
              {"page":"A goblin (Feerrott)","name":"a goblin","noImage":true},
              {"page":"A goblin (Clan RunnyEye)","name":"a goblin"},
              {"page":"A goblin caster","name":"a goblin caster","noImage":true,"otherNames":["Goblin caster"]}
            ]}"#,
        );
        let mut keys: Vec<&str> = keys.iter().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            [
                "a goblin (feerrott)",
                "a goblin caster",
                "basher trak",
                "goblin caster"
            ],
            "`a goblin` has a pictured page, so only the imageless page's own title is a key"
        );
    }

    #[test]
    fn the_committed_catalog_reads_for_its_imageless_names() {
        // The bytes parse under the typed read; which names are imageless is the data's business.
        let _ = crate::mobs::imageless_keys();
    }
}
