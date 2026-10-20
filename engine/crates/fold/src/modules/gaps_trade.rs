//! Two more Gaps checks (owner asks, 2026-10-18), beside `gaps.rs`.
//!
//! MERCHANTS THE WIKI LACKS. An NPC the log shows trading is a merchant: a price quote
//! (`Murga told you, 'That'll be 5 silver 3 copper per Tunic Pattern.'`), a purchase from it, or a
//! sale to it. It is a row unless its mobs.json record is a `{{MerchantPage}}` (`merchant`).
//!
//! FACTIONS A KILL MOVED. The game prints a kill's faction lines just BEFORE the death line, in
//! the same second (`tests/fixtures/g1-group-lifecycle.log`), so the lines read within
//! KILL_FACTION_MS before a death are that kill's. This side only records the pairs; the tab
//! checks each against the mob page's `factions`.

use crate::event::Event;
use crate::message_overlay::message_text_of;
use serde_json::{json, Value};
use std::collections::HashMap;

/// The window the kills module also joins a kill's exp line by (`KILL_EXP_JOIN_MS`).
const KILL_FACTION_MS: i64 = 2_500;

/// The merchant an event shows trading, and how: `quoted`, `bought` (from it), `sold` (to it).
pub fn merchant_of<'a>(ev: &'a Event) -> Option<(&'a str, &'static str)> {
    match ev.kind() {
        "purchase" => ev.str("npc").map(|n| (n, "bought")),
        "coin" if ev.str("source") == Some("vendor") => ev.str("npc").map(|n| (n, "sold")),
        "unknown" => message_text_of(ev.raw())
            .split_once(" told you, 'That'll be ")
            .map(|(n, _)| (n, "quoted")),
        _ => None,
    }
}

/// One faction line: the faction, the amount it stated, and whether the kill raised it.
type FactionLine<'a> = (&'a str, Option<i64>, Option<bool>);

/// `Your faction standing with X has been adjusted by -20.` → `(X, Some(-20), Some(false))`; `…
/// could not possibly get any better.` → `(X, None, Some(true))`: a capped standing states no amount
/// but still says which way the kill pushed it (review 2026-10-19: a raise was filed as lowered).
fn faction_of(text: &str) -> Option<FactionLine<'_>> {
    let rest = text.strip_prefix("Your faction standing with ")?;
    if let Some((f, by)) = rest.split_once(" has been adjusted by ") {
        let n: Option<i64> = by
            .trim_end_matches('.')
            .trim_matches(|c| c == '(' || c == ')' || c == ' ')
            .parse()
            .ok();
        return Some((f, n, n.filter(|v| *v != 0).map(|v| v > 0)));
    }
    let (f, way) = rest.split_once(" could not possibly get any ")?;
    Some((f, None, Some(way.starts_with("better"))))
}

/// One (mob, faction) pair the log showed, how often, and the zone last seen in.
struct Pair {
    mob: String,
    faction: String,
    n: u32,
    zone: String,
    /// Every amount a line stated, with how often: the page writes the most stated one, not a
    /// one-off cap-clipped hit (`Gem Choppers` 5 x369, 4 x1).
    adjusts: HashMap<i64, u32>,
    /// Which way the kill pushed it, from an amount's sign or a capped line's word.
    raised: Option<bool>,
}

impl Pair {
    /// The amount most lines stated; a tie goes to the larger hit.
    fn adjust(&self) -> Option<i64> {
        self.adjusts.iter().max_by_key(|(a, n)| (**n, a.abs())).map(|(a, _)| *a)
    }
}

#[derive(Default)]
pub struct KillFactions {
    /// Faction lines not yet claimed by a death, with when they were read.
    pending: Vec<(String, i64, Option<i64>, Option<bool>)>,
    pairs: HashMap<(String, String), Pair>,
}

impl KillFactions {
    pub fn clear(&mut self) {
        self.pending.clear();
        self.pairs.clear();
    }

    /// A faction line, held for the death that follows it.
    pub fn line(&mut self, ev: &Event) {
        if let Some((f, adjust, raised)) = faction_of(message_text_of(ev.raw())) {
            self.pending.push((f.to_string(), ev.ts(), adjust, raised));
        }
    }

    /// A death: the faction lines just before it are its kill's. True when a pair was recorded.
    pub fn death(&mut self, mob: &str, ts: i64, zone: Option<&str>) -> bool {
        let mut any = false;
        for (faction, at, adjust, raised) in std::mem::take(&mut self.pending) {
            if ts - at > KILL_FACTION_MS {
                continue;
            }
            let key = (mob.to_lowercase(), faction.to_lowercase());
            let pair = self.pairs.entry(key).or_insert_with(|| Pair {
                mob: mob.to_string(),
                faction,
                n: 0,
                zone: String::new(),
                adjusts: HashMap::new(),
                raised: None,
            });
            pair.n += 1;
            pair.zone = zone.unwrap_or_default().to_string();
            if let Some(a) = adjust {
                *pair.adjusts.entry(a).or_default() += 1;
            }
            pair.raised = raised.or(pair.raised);
            any = true;
        }
        any
    }

    /// `[{mob, faction, n, zone, adjust?, raised?}]`, by mob then faction.
    pub fn serve(&self) -> Value {
        let mut pairs: Vec<&Pair> = self.pairs.values().collect();
        pairs.sort_by(|a, b| a.mob.cmp(&b.mob).then_with(|| a.faction.cmp(&b.faction)));
        let rows = pairs.iter().map(|p| {
            let mut row = json!({ "mob": p.mob, "faction": p.faction, "n": p.n, "zone": p.zone });
            if let Some(a) = p.adjust() {
                row["adjust"] = json!(a);
                row["raised"] = json!(a > 0);
            } else if let Some(r) = p.raised {
                row["raised"] = json!(r);
            }
            row
        });
        Value::Array(rows.collect())
    }
}

#[cfg(test)]
mod tests {
    use super::{merchant_of, KillFactions};
    use crate::event::Event;

    fn ev(json: &str) -> Event<'static> {
        Event::from_json(json).expect("a JSON object")
    }

    fn line(text: &str, ts: i64) -> Event<'static> {
        ev(&format!(
            r#"{{"kind":"unknown","ts":{ts},"seq":1,"raw":"[Wed Jul 29 01:23:12 2026] {text}"}}"#
        ))
    }

    #[test]
    fn a_quote_a_purchase_and_a_sale_each_name_a_merchant() {
        let quote = line(
            "Murga told you, 'That'll be 5 silver 3 copper per Tunic Pattern.'",
            1,
        );
        assert_eq!(merchant_of(&quote), Some(("Murga", "quoted")));
        let bought = ev(
            r#"{"kind":"purchase","npc":"Klok Koglin","item":"Bread","ts":1,"seq":1,"raw":"x"}"#,
        );
        assert_eq!(merchant_of(&bought), Some(("Klok Koglin", "bought")));
        let sold =
            ev(r#"{"kind":"coin","source":"vendor","npc":"Zok Zribb","ts":1,"seq":1,"raw":"x"}"#);
        assert_eq!(merchant_of(&sold), Some(("Zok Zribb", "sold")));
        assert_eq!(merchant_of(&line("Soandso tells you, 'hi'", 1)), None);
    }

    #[test]
    fn faction_lines_just_before_a_death_are_its_kill_and_older_ones_are_not() {
        let mut k = KillFactions::default();
        k.line(&line(
            "Your faction standing with Undead Frogloks of Guk has been adjusted by -20.",
            1_000,
        ));
        k.line(&line(
            "Your faction standing with Frogloks of Guk could not possibly get any better.",
            1_000,
        ));
        assert!(k.death("a zol ghoul knight", 1_500, Some("Lower Guk")));
        k.line(&line(
            "Your faction standing with Turn-in Faction has been adjusted by 10.",
            2_000,
        ));
        assert!(
            !k.death("a rat", 60_000, None),
            "a faction line a minute old is no kill's"
        );
        let served = k.serve();
        let pairs: Vec<(&str, &str)> = served
            .as_array()
            .expect("an array")
            .iter()
            .map(|p| {
                (
                    p["mob"].as_str().unwrap_or(""),
                    p["faction"].as_str().unwrap_or(""),
                )
            })
            .collect();
        assert_eq!(
            pairs,
            vec![
                ("a zol ghoul knight", "Frogloks of Guk"),
                ("a zol ghoul knight", "Undead Frogloks of Guk")
            ]
        );
        assert_eq!(served[1]["adjust"], -20, "the amount a line stated is kept");
        assert!(served[0].get("adjust").is_none(), "a capped line states none");
        assert_eq!(served[0]["raised"], true, "but a capped better is a raise");
        assert_eq!(served[1]["raised"], false);
    }
}
