//! The overlay's small rules: which domains take pushes, each domain's key, and what a pushed
//! record claims. Apart from `lib.rs` so that file stays under its recorded size.

use crate::names::item_key;
use crate::FETCHABLE_DOMAINS;
use fold::modules::consider::mob_key;
use serde_json::Value;

/// The domain as a `'static` name, or `None` for one this engine does not take pushes for.
pub(crate) fn fetchable(domain: &str) -> Option<&'static str> {
    FETCHABLE_DOMAINS
        .iter()
        .find(|known| **known == domain)
        .copied()
}

/// The overlay key for one domain — each domain's own canonical fold, never a shared one.
pub(crate) fn key_for(domain: &str, name: &str) -> String {
    if domain == "mob" {
        mob_key(name)
    } else {
        item_key(name)
    }
}

/// Did a pushed record claim a real negative? A `notFound` push is the app saying "I looked and the
/// wiki has no page" — an ANSWER, which stops the engine announcing that name again, but not a
/// `found`.
pub(crate) fn overlay_found(entry: &Value) -> bool {
    !entry["notFound"].as_bool().unwrap_or(false)
}
