//! Names known only through a wiki redirect (owner, 2026-10-22: "redirect safeguard: if we can somehow
//! protect against this without cause OTHER issues sure"). A redirect makes its name known, but a
//! redirect can be wrong: `Halfling Blood` was sent to `Vial of Halfling Blood`, a different item, so
//! a missing page went unnoticed. A name the log met that the data knows ONLY through a redirect that
//! is more than a respelling (`gaps_keys::same_name`) is filed in its own domain with the page the
//! redirect sends it to (`viaRedirect`): a row to check once in game, marked done, never silent.
//! A name with a record of its own is never one.
//!
//! A child of `gaps.rs` (it files through the module's own `note`), apart so that file keeps its size.

use super::{Domain, GapsModule};
use crate::event::Event;

impl GapsModule {
    /// File a name known only through a redirect to `page`, as a row to check. True when a row changed.
    pub(super) fn redirected(&mut self, domain: Domain, key: String, name: &str, page: String, kind: &'static str, ev: &Event) -> bool {
        let filed = self.note(domain, key.clone(), name, false, kind, ev);
        if let Some(row) = self.rows.get_mut(&(domain, key)) {
            row.via_redirect = Some(page);
        }
        filed
    }
}
