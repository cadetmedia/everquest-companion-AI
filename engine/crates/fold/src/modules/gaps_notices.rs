//! Pages that say their subject may not be in Legends (owner, 2026-10-22: "if we've seen a mob, we
//! need to go update to remove this text that it doesn't exist in the current era"). A page opening
//! `{{DNE}}` ("NOTLEGENDS!") or `{{delete}}` ("considered for deletion") is a known page, so no
//! Items or Mobs row asks for it; but the log meeting the mob or item is proof it exists in
//! Legends, so the page is work to do. Such a meeting is filed in the Notices domain, under the page
//! with its notices, the row's lines the proof to cite when the notice comes off.
//!
//! A child of `gaps.rs` (it files through the module's own `note`), apart so that file keeps its size.

use super::{Domain, GapsModule};
use crate::event::Event;
use crate::knowledge::GapIndex;
use crate::modules::consider::mob_key;
use crate::modules::gaps_keys::item_gap_key;
use serde::Serialize;
use std::collections::HashMap;

/// What a Notices row carries beyond a row's own fields: the page, its notices, and whether the
/// log met an item or a mob there.
#[derive(Debug, Clone, Serialize)]
pub struct Noticed {
    page: String,
    notices: Vec<String>,
    subject: &'static str,
}

/// The pages with a notice, by the key each name of theirs folds to (item keys, mob keys).
#[derive(Default)]
pub struct Notices {
    items: HashMap<String, (String, Vec<String>)>,
    mobs: HashMap<String, (String, Vec<String>)>,
}

impl Notices {
    pub fn new(index: &GapIndex) -> Self {
        let fold = |list: &[(String, String, Vec<String>)], key: fn(&str) -> String| {
            list.iter().map(|(n, p, ns)| (key(n), (p.clone(), ns.clone()))).collect()
        };
        Self { items: fold(&index.item_notices, item_gap_key), mobs: fold(&index.mob_notices, mob_key) }
    }

    fn of(&self, domain: Domain, key: &str) -> Option<&(String, Vec<String>)> {
        match domain {
            Domain::Item => self.items.get(key),
            Domain::Mob => self.mobs.get(key),
            _ => None,
        }
    }
}

impl GapsModule {
    /// A known item or mob met: filed under its page in the Notices domain when that page carries a
    /// notice. True when a row changed.
    pub(super) fn noticed(&mut self, domain: Domain, key: &str, name: &str, kind: &'static str, ev: &Event) -> bool {
        let Some((page, notices)) = self.notices.of(domain, key).cloned() else {
            return false;
        };
        let row_key = format!("{}:{}", domain.as_str(), page.to_lowercase());
        let filed = self.note(Domain::Notice, row_key.clone(), name, false, kind, ev);
        let subject = domain.as_str();
        if let Some(row) = self.rows.get_mut(&(Domain::Notice, row_key)) {
            row.notice = Some(Noticed { page, notices, subject });
        }
        filed
    }
}
