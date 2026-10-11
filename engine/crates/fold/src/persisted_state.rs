//! The app's persisted knowledge, as [`crate::Registry::seed_persisted`] takes it. Apart from `lib.rs` so
//! that file stays under its recorded size.

/// The app's persisted knowledge, already parsed — what [`crate::Registry::seed_persisted`] puts back.
///
/// Deliberately not a field of [`crate::ClusterDeps`]: `registered()` is what the parity runner, the bench
/// arm and every test call, so a seed field there would be a door a file could walk through into
/// the world the oracle records. The seed arrives after construction, from the one caller handed a
/// `stateDir` — the same rule `install_knowledge` follows.
///
/// Both halves are default-empty, and an empty seed is not the same act as no seed: the
/// `begin_source` half still runs, because naming this fold's own bucket is right either way.
#[derive(Debug, Default)]
pub struct PersistedState {
    /// `<userData>/resist-ledger.json`'s buckets, the shipped baseline's already refused.
    pub resist: Vec<crate::modules::resist::ledger_file::LedgerSource>,
    /// `<userData>/message-overlay.json`'s buckets, keyed by the source that produced them. The key
    /// travels with the counts because merging two origins under one key would put the fold's own
    /// output back in the pile it is seeded from, and the totals double.
    pub overlay: Vec<(String, Vec<crate::message_overlay::SeedMessage>)>,
}
