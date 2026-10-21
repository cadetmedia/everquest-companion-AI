//! The Event log's KEEP row (owner, 2026-10-20: "the moment i click the item and he offers it to
//! me, the event log pop up a row showing it"): a merchant's offer for an item the wiki data lacks
//! (the Gaps tab's Items row, by the tab's own test) appends a `keep` row on the live tail, so the
//! item is kept for its screenshot rather than sold. Short, by the owner's word ("just simply KEEP -
//! Needed on wiki"): the item and the mark, never the price or the merchant, which the Gaps row's
//! details carry. A row the player marked Done is the overlay's to hide (`doneMarksStore.ts`).
//!
//! Only an Items gap: a Drops row is fixed on the mob's page and an Images row is a mob's picture,
//! so neither needs the item in hand.

use super::{EventFeedModule, FeedEvent};
use crate::event::Event;
use crate::jsfn::item_base_name;
use crate::message_overlay::message_text_of;
use crate::modules::gaps_offers::offer_of;

impl EventFeedModule {
    /// An unparsed line that is a merchant's offer for a gap item: a `keep` row.
    pub(super) fn note_offer(&mut self, ev: &Event) {
        // No knowledge, no test: the parity construction installs none and must see no row.
        if self.knowledge.is_none() {
            return;
        }
        let Some(offer) = offer_of(message_text_of(ev.raw())) else {
            return;
        };
        if self.items.known(offer.item) {
            return;
        }
        self.append(FeedEvent {
            id: String::new(),
            kind: "keep",
            ts: ev.ts(),
            // The Gaps row's name, tier stripped, so its Done mark (`item:<name>`) matches.
            title: item_base_name(offer.item),
            detail: None,
            page: None,
            con: None,
            unknown: false,
            needs_image: false,
        });
    }
}

#[cfg(test)]
mod tests {
    use crate::event::Event;
    use crate::knowledge::{Answer, GapIndex, Knowledge, Miss, OwnLoot};
    use crate::modules::event_feed::EventFeedModule;
    use crate::EqModule;
    use serde_json::{json, Value};
    use std::sync::Arc;

    /// Knows one item; a lookup that would ask the wiki panics, since a KEEP row asks none.
    struct Corpus;

    impl Knowledge for Corpus {
        fn item(&self, _name: &str) -> Answer {
            panic!("a merchant offer must never ask a lookup that notes a miss")
        }
        fn identity_keys(&self, mob: &str) -> Vec<String> {
            vec![mob.to_lowercase()]
        }
        fn mob(&self, _name: &str, _loot: &dyn OwnLoot) -> Answer {
            panic!("a merchant offer must never ask a lookup that notes a miss")
        }
        fn known_mob(&self, _name: &str) -> bool {
            false
        }
        fn take_misses(&self) -> Vec<Miss> {
            Vec::new()
        }
        fn gap_index(&self) -> GapIndex {
            GapIndex { item_pages: vec![("bone chips".into(), "Bone Chips".into())], ..GapIndex::default() }
        }
    }

    fn offer(seq: i64, text: &str) -> String {
        let raw = format!("[Tue Oct 20 22:27:39 2026] Klok Koglin told you, 'I'll give you {text}");
        json!({ "kind": "unknown", "seq": seq, "ts": 1_792_000_000_000_i64 + seq, "raw": raw }).to_string()
    }

    fn rows(feed: &EventFeedModule) -> Vec<Value> {
        feed.snapshot()["state"].as_array().cloned().unwrap_or_default()
    }

    #[test]
    fn an_offer_for_a_gap_item_is_a_keep_row_at_once_and_a_known_item_or_a_quote_is_none() {
        let mut feed = EventFeedModule::new();
        feed.install_knowledge(&(Arc::new(Corpus) as Arc<dyn Knowledge>));
        let lines = [
            offer(1, "1 platinum 1 gold 4 silver 3 copper for the Fungus Spores.'"),
            offer(2, "2 silver per Bone Chips'"),
            offer(3, "absolutely nothing for the Noble's Robes +4.'"),
            json!({ "kind": "unknown", "seq": 4, "ts": 1, "raw": "[Tue Oct 20 22:14:15 2026] Outrider Zarulm told you, 'That'll be 2 platinum for the Fungus Spores.'" }).to_string(),
        ];
        for line in &lines {
            feed.on_event(&Event::from_json(line).expect("an event"), true);
        }
        let shown: Vec<Value> = rows(&feed).iter().map(|r| json!([r["kind"], r["title"], r["detail"]])).collect();
        assert_eq!(
            Value::Array(shown),
            json!([["keep", "Fungus Spores", null], ["keep", "Noble's Robes", null]]),
            "the item and the mark only, tier stripped as the Gaps row names it"
        );
    }

    #[test]
    fn a_historical_offer_or_one_with_no_knowledge_installed_is_no_row() {
        let mut feed = EventFeedModule::new();
        let line = offer(1, "3 copper per Rat Ear'");
        feed.on_event(&Event::from_json(&line).expect("an event"), true);
        assert!(rows(&feed).is_empty(), "no knowledge, no test");
        feed.install_knowledge(&(Arc::new(Corpus) as Arc<dyn Knowledge>));
        feed.on_event(&Event::from_json(&line).expect("an event"), false);
        assert!(rows(&feed).is_empty(), "the feed admits only the live tail");
    }
}
