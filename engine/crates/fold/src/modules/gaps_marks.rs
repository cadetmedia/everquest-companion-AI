//! The Event log's mark on a con, decided by the Gaps tab's own Mobs rows (owner, 2026-10-23: "why
//! are some things showing on the mobs that are missing from the wiki, but not on the events log?",
//! then "uh shouldn't they agree logically? that's odd").
//!
//! One decision, not two rules that happen to line up. The Gaps module files the con first (it is
//! registered before the event feed), then reads its own rows for the name and writes the answer
//! into a slot both modules hold; the feed's con row for the same event (the same seq) carries it:
//!
//!   * a Mobs row with no page: `unknown`, and `maybePlayer` beside it exactly when the tab serves
//!     the row "may be a player" (a one-word name only hailed or conned, not yet shown an NPC by an
//!     answered hail, a revisit, a con above the player cap or an NPC target line, gaps_players.rs);
//!   * no row: no mark. A known player, a name a chat, `/who`, group or `Targeted (Player)` line
//!     withdrew, a pet, a mount, familiar or warder, the player's own name: the tab files none of
//!     them, so the feed marks none of them;
//!   * a name the catalog knows whose pages have no picture: `needsImage`, as before.
//!
//! A redirect's row (`viaRedirect`) is a row to check, not a missing page: it marks nothing more than
//! a known name does. A mark that appears later for a feed row already shown is not drawn back onto
//! it; the next con carries it.
//!
//! A child of `gaps.rs`, apart so that file keeps its size.

use super::{Domain, GapRow, GapsModule};
use crate::event::Event;
use crate::knowledge::Knowledge;
use crate::modules::consider::mob_key;
use crate::modules::gaps_names::owner_of_pet;
use crate::modules::resist::world::is_player_shaped_name;
use serde::Serialize;
use std::cell::Cell;
use std::rc::Rc;

/// A feed row's screenshot marks, flattened into the row as the overlay reads them
/// (`src/renderer/src/overlay/feedGapTags.ts`). Absent rather than false when off.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct FeedMarks {
    /// The item or mob is in none of the app's data: a reminder to screenshot it for the wiki
    /// (owner ask, 2026-10-18). On a con, the Gaps tab has a Mobs row for it.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub unknown: bool,
    /// Beside `unknown` on a con: the Gaps tab serves the row "may be a player" (owner, 2026-10-23).
    #[serde(rename = "maybePlayer", skip_serializing_if = "std::ops::Not::not")]
    pub maybe_player: bool,
    /// The mob's wiki pages exist but none has a picture (the Gaps tab's Images row): screenshot
    /// it (owner, 2026-10-20). Never beside `unknown`, which wins.
    #[serde(rename = "needsImage", skip_serializing_if = "std::ops::Not::not")]
    pub needs_image: bool,
}

/// The slot the Gaps module writes each con's marks into, with the con's seq, and the event feed
/// reads for the same event. One `Rc`, cloned into both at registration (`crate::registered`).
pub type ConMarks = Rc<Cell<Option<(i64, FeedMarks)>>>;

/// The marks the Gaps module wrote for this event, or none: no knowledge, or no Gaps module beside.
#[must_use]
pub fn marks_for(slot: &ConMarks, seq: i64) -> FeedMarks {
    match slot.get() {
        Some((at, marks)) if at == seq => marks,
        _ => FeedMarks::default(),
    }
}

impl GapsModule {
    /// A Gaps module that tells the event feed holding the same slot what each con is.
    #[must_use]
    pub fn sharing(con_marks: ConMarks) -> Self {
        Self {
            con_marks,
            ..Self::default()
        }
    }

    /// Whether the catalog knows the name, and the name a Mobs row for it is filed under: an unknown
    /// mob's pet is filed under the mob (`gaps_names.rs`).
    pub(super) fn filed_as<'a>(&self, k: &dyn Knowledge, name: &'a str) -> (bool, &'a str) {
        let known = self.mob_names.known(k, name);
        (known, if known { name } else { owner_of_pet(name) })
    }

    /// The tab's "may be a player": a one-word name only hailed or conned that the log has not yet
    /// shown to be an NPC (`gaps_players.rs`).
    pub(super) fn maybe_player(&self, row: &GapRow) -> bool {
        let only_met = row.kinds.iter().all(|k| *k == "hailed" || *k == "considered");
        only_met && is_player_shaped_name(&row.name) && !self.who.is_npc(&row.name)
    }

    /// The marks a con of `name` carries, read off the rows as they stand after the con was filed.
    pub(super) fn con_marks_of(&self, name: &str) -> FeedMarks {
        let Some(k) = self.knowledge.as_deref() else {
            return FeedMarks::default();
        };
        let (known, filed) = self.filed_as(k, name);
        match self.rows.get(&(Domain::Mob, mob_key(filed))) {
            Some(row) if row.via_redirect.is_none() => FeedMarks {
                unknown: true,
                maybe_player: self.maybe_player(row),
                needs_image: false,
            },
            _ => FeedMarks {
                needs_image: known && self.mob_names.needs_image(k, name),
                ..FeedMarks::default()
            },
        }
    }

    /// A /con: a mob met, maybe placed by a `/loc`, the standing a later offer from it carries, and
    /// then, by the rows as they now stand, the marks the Event log draws on it.
    pub(super) fn considered(&mut self, ev: &Event) -> bool {
        let Some(mob) = ev.str("mob") else {
            return false;
        };
        self.standings.con(mob, ev.str("faction"));
        self.stock.conned(mob, ev.int("level"), ev.str("faction"));
        let zone = self.zone.clone();
        let placed = self.mob_locs.target(mob, ev.ts(), zone.as_deref());
        let filed = placed | self.met(mob, false, ev);
        self.con_marks.set(Some((ev.seq(), self.con_marks_of(mob))));
        filed
    }
}

#[cfg(test)]
#[path = "gaps_marks_tests.rs"]
mod tests;
