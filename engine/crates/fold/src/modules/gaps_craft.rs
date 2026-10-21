//! How the player came by an item beyond loot and purchase: the zone it was foraged in and the
//! tradeskill that made it (owner ask, 2026-10-20: every fact the game gives goes on the copied
//! wiki page; `plans/2026-10-20-gaps-item-page-facts.md`). A forage files its zone apart from the
//! row's `zones` (every way it came), so the page's `|foraged` names only forage zones.
//!
//! A combine's line never names its tradeskill, but a skill-up printed in the same second does.
//! Measured on the owner's logs (2026-10-20, 612 combines): on a success the skill-up comes
//! FIRST (`You have become better at Jewelry Making! (4)`, then `You have fashioned the items
//! together to create something new: Silver Malachite Ring.`); on a failure it comes AFTER
//! (`You lacked the skills to fashion Silver Malachite Ring.`, then the skill-up). Either order
//! pairs, by the log's own second; 36 of 45 crafted items carried one. A combine with no skill-up
//! (past trivial) names no tradeskill, and none is guessed.

use super::{Domain, GapsModule};
use crate::event::Event;
use crate::modules::gaps_keys::item_gap_key;
use crate::modules::gaps_players::forage_of;

impl GapsModule {
    /// `itemReceived`: a combine's success (`via` fashioned), or an item received.
    pub(super) fn received(&mut self, ev: &Event) -> bool {
        match (ev.str("via"), ev.str("item")) {
            (Some("fashioned"), Some(name)) => self.combine(name, "crafted", ev),
            _ => self.item(ev, "received"),
        }
    }

    /// The item lines the parser leaves unknown, a forage and two combine shapes: `Some(filed)`
    /// when `text` is one.
    pub(super) fn item_line(&mut self, text: &str, ev: &Event) -> Option<bool> {
        if let Some(item) = forage_of(text) {
            return Some(self.foraged(item, ev));
        }
        if let Some(item) = alternate_product_of(text) {
            return Some(self.combine(item, "crafted", ev));
        }
        failed_combine_of(text).map(|item| self.combine(item, "failed-combine", ev))
    }

    /// A forage: the row filed (`record` counted the zone among `zones`), then the zone apart.
    fn foraged(&mut self, item: &str, ev: &Event) -> bool {
        let filed = self.item_named(item, "foraged", ev);
        let row = self.rows.get_mut(&(Domain::Item, item_gap_key(item)));
        if let (true, Some(row), Some(zone)) = (filed, row, self.zone.as_deref()) {
            row.details.foraged(zone);
        }
        filed
    }

    /// A combine of `name`, made or failed, filed under `kind`; a tradeskill tick of the same
    /// second goes on its row. A known item's combine is paired too, so its tick is not taken for
    /// the next one's.
    fn combine(&mut self, name: &str, kind: &'static str, ev: &Event) -> bool {
        let filed = self.item_named(name, kind, ev);
        let key = item_gap_key(name);
        match self.combines.combined(ev.ts(), key.clone()) {
            Some(skill) => self.tradeskill_of(&key, &skill) | filed,
            None => filed,
        }
    }

    /// A tradeskill tick: the tradeskill of the combine of its second, when that came first.
    pub(super) fn skill_up(&mut self, ev: &Event) -> bool {
        let Some(skill) = ev.str("skill").filter(|s| is_tradeskill(s)) else {
            return false;
        };
        match self.combines.skill_up(ev.ts(), skill) {
            Some(key) => self.tradeskill_of(&key, skill),
            None => false,
        }
    }

    fn tradeskill_of(&mut self, key: &str, skill: &str) -> bool {
        let Some(row) = self.rows.get_mut(&(Domain::Item, key.to_string())) else {
            return false;
        };
        row.details.tradeskill(skill);
        true
    }
}

/// The skills a combine raises: the classic tradeskills, as the client prints them. Any other
/// skill-up in the same second (a Kick mid-combine) is not a combine's.
const TRADESKILLS: [&str; 11] = [
    "Alchemy",
    "Baking",
    "Blacksmithing",
    "Brewing",
    "Fletching",
    "Jewelry Making",
    "Make Poison",
    "Pottery",
    "Research",
    "Tailoring",
    "Tinkering",
];

pub fn is_tradeskill(skill: &str) -> bool {
    TRADESKILLS.contains(&skill)
}

/// `You have fashioned the items together to create alternate product: Bottle.` → the item: a
/// combine's by-product, a shape the parser's success line does not read.
pub fn alternate_product_of(text: &str) -> Option<&str> {
    let item = text
        .strip_prefix("You have fashioned the items together to create alternate product: ")?
        .strip_suffix('.')?;
    (!item.is_empty()).then_some(item)
}

/// `You lacked the skills to fashion Silver Malachite Ring.` → the item: a failed combine, which
/// still names a recipe's product.
pub fn failed_combine_of(text: &str) -> Option<&str> {
    let item = text.strip_prefix("You lacked the skills to fashion ")?.strip_suffix('.')?;
    (!item.is_empty()).then_some(item)
}

/// The last tradeskill tick and the last combine, each waiting for the other in its second.
#[derive(Default)]
pub struct Combines {
    skill: Option<(i64, String)>,
    combine: Option<(i64, String)>,
}

impl Combines {
    pub fn clear(&mut self) {
        *self = Self::default();
    }

    /// A tradeskill tick at `ts`: the item key of a combine in the same second that came first.
    pub fn skill_up(&mut self, ts: i64, skill: &str) -> Option<String> {
        if let Some((at, key)) = self.combine.take() {
            if at == ts {
                return Some(key);
            }
        }
        self.skill = Some((ts, skill.to_string()));
        None
    }

    /// A combine of `key` at `ts`: the tradeskill of a tick in the same second that came first.
    pub fn combined(&mut self, ts: i64, key: String) -> Option<String> {
        if let Some((at, skill)) = self.skill.take() {
            if at == ts {
                return Some(skill);
            }
        }
        self.combine = Some((ts, key));
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_tick_pairs_with_the_combine_of_its_second_in_either_order() {
        let mut c = Combines::default();
        assert_eq!(c.skill_up(1000, "Jewelry Making"), None);
        assert_eq!(c.combined(1000, "ring".into()).as_deref(), Some("Jewelry Making"));
        // A failure prints its tick after the line.
        assert_eq!(c.combined(5000, "ring".into()), None);
        assert_eq!(c.skill_up(5000, "Jewelry Making").as_deref(), Some("ring"));
    }

    #[test]
    fn a_tick_in_another_second_names_nothing() {
        let mut c = Combines::default();
        c.skill_up(1000, "Brewing");
        assert_eq!(c.combined(2000, "bog juice".into()), None);
        assert_eq!(c.skill_up(9000, "Brewing"), None);
    }

    /// The real parser, on the owner's lines: the two shapes reach the gaps module as `unknown`
    /// (where `unparsed` reads them), the success line and the tick as their own kinds.
    #[test]
    fn the_real_parser_hands_over_each_line_as_the_module_reads_it() {
        use eqlog::event::{Ev, Kind};
        let parser = eqlog::parser_for("Drywrought", eqlog::Tz::UTC);
        let kind = |text: &str| {
            let mut ev = Ev::new();
            assert!(parser.parse_event(&format!("[Sat Aug 15 00:15:14 2026] {text}"), 1, &mut ev));
            ev.payload().kind()
        };
        assert_eq!(kind("You lacked the skills to fashion Silver Malachite Ring."), Kind::Unknown);
        assert_eq!(kind("You have fashioned the items together to create alternate product: Bottle."), Kind::Unknown);
        assert_eq!(kind("You have fashioned the items together to create something new: Silver Malachite Ring."), Kind::ItemReceived);
        assert_eq!(kind("You have become better at Jewelry Making! (4)"), Kind::SkillUp);
    }

    #[test]
    fn the_two_combine_shapes_the_parser_leaves() {
        assert_eq!(
            alternate_product_of("You have fashioned the items together to create alternate product: Bottle."),
            Some("Bottle")
        );
        assert_eq!(failed_combine_of("You lacked the skills to fashion Silver Malachite Ring."), Some("Silver Malachite Ring"));
        assert!(is_tradeskill("Jewelry Making") && !is_tradeskill("Kick"));
    }
}
