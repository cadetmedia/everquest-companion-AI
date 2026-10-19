//! Where a mob stands (owner ask, 2026-10-18), for the Gaps tab's mob page `|location`. A player
//! who `/loc`s beside a mob and cons or hails it has said where it is:
//!
//! ```text
//! [Sun Oct 18 20:02:54 2026] Your Location is -790.65, 173.39, -12.01
//! [Sun Oct 18 20:02:56 2026] You say, 'Hail, a scout from zanivar'
//! ```
//!
//! EQ Legends writes the `/loc` line to the log (the owner's, 2026-10-18). A con or a hail takes
//! the `/loc` read within LOC_PAIR_MS before it, else the next one within LOC_PAIR_MS after; each
//! distinct point is kept per mob, rounded, in `/loc`'s own order, which is the wiki's.

use crate::event::Event;
use crate::message_overlay::message_text_of;
use serde_json::{json, Value};
use std::collections::HashMap;

/// LOC, hail, LOC is a few seconds' work; a con from across the zone a minute later is not.
const LOC_PAIR_MS: i64 = 10_000;
/// Points nearer than this are one spawn point.
const SAME_POINT: f64 = 10.0;

/// `Your Location is -790.65, 173.39, -12.01` → the three numbers.
fn loc_of(text: &str) -> Option<[f64; 3]> {
    let rest = text
        .strip_prefix("Your Location is ")?
        .trim_end_matches('.');
    let n: Vec<f64> = rest
        .split(',')
        .filter_map(|p| p.trim().parse().ok())
        .collect();
    (n.len() == 3).then(|| [n[0], n[1], n[2]])
}

/// `You say, 'Hail, a scout from zanivar'` → the name hailed.
fn hail_of(text: &str) -> Option<&str> {
    text.strip_prefix("You say, 'Hail, ")?.strip_suffix('\'')
}

struct Spot {
    mob: String,
    zone: String,
    points: Vec<[f64; 3]>,
}

#[derive(Default)]
pub struct MobLocs {
    last_loc: Option<(i64, [f64; 3])>,
    /// A con or hail waiting for the `/loc` after it.
    pending: Option<(String, i64)>,
    spots: HashMap<String, Spot>,
}

impl MobLocs {
    pub fn clear(&mut self) {
        *self = Self::default();
    }

    /// An unparsed line: a `/loc` (which may place a waiting target) or a hail. True when a point was kept.
    pub fn line(&mut self, ev: &Event, zone: Option<&str>) -> bool {
        let text = message_text_of(ev.raw());
        if let Some(p) = loc_of(text) {
            self.last_loc = Some((ev.ts(), p));
            return match self.pending.take() {
                Some((mob, at)) if ev.ts() - at <= LOC_PAIR_MS => self.record(&mob, p, zone),
                _ => false,
            };
        }
        hail_of(text).is_some_and(|mob| self.target(mob, ev.ts(), zone))
    }

    /// A con or a hail of `mob`: the `/loc` just before it, else the next one.
    pub fn target(&mut self, mob: &str, ts: i64, zone: Option<&str>) -> bool {
        match self.last_loc {
            Some((at, p)) if ts - at <= LOC_PAIR_MS => self.record(mob, p, zone),
            _ => {
                self.pending = Some((mob.to_string(), ts));
                false
            }
        }
    }

    fn record(&mut self, mob: &str, p: [f64; 3], zone: Option<&str>) -> bool {
        let spot = self
            .spots
            .entry(mob.to_lowercase())
            .or_insert_with(|| Spot {
                mob: mob.to_string(),
                zone: String::new(),
                points: Vec::new(),
            });
        spot.zone = zone.unwrap_or_default().to_string();
        let near = |q: &[f64; 3]| (q[0] - p[0]).hypot(q[1] - p[1]) < SAME_POINT;
        if spot.points.iter().any(near) {
            return false;
        }
        spot.points.push(p.map(f64::round));
        true
    }

    /// `[{mob, zone, points: [[y, x, z], …]}]`, by mob.
    pub fn serve(&self) -> Value {
        let mut spots: Vec<&Spot> = self.spots.values().collect();
        spots.sort_by(|a, b| a.mob.cmp(&b.mob));
        Value::Array(
            spots
                .iter()
                .map(|s| json!({ "mob": s.mob, "zone": s.zone, "points": s.points }))
                .collect(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::MobLocs;
    use crate::event::Event;

    fn line(text: &str, ts: i64) -> Event<'static> {
        Event::from_json(&format!(
            r#"{{"kind":"unknown","ts":{ts},"seq":1,"raw":"[Sun Oct 18 20:02:54 2026] {text}"}}"#
        ))
        .expect("json")
    }

    #[test]
    fn loc_hail_loc_places_the_mob_and_a_far_off_con_does_not() {
        let mut m = MobLocs::default();
        m.line(
            &line("Your Location is -790.65, 173.39, -12.01", 0),
            Some("The Feerrott"),
        );
        assert!(m.line(
            &line("You say, 'Hail, a scout from zanivar'", 2_000),
            Some("The Feerrott")
        ));
        m.line(
            &line("Your Location is -790.65, 173.39, -12.01", 4_000),
            Some("The Feerrott"),
        );
        assert!(
            !m.target("a scout from zanivar", 6_000, Some("The Feerrott")),
            "the same point is kept once"
        );
        assert!(!m.target("a far mob", 120_000, None), "no /loc near it");
        assert!(
            m.line(&line("Your Location is 10.4, -20.6, 1", 125_000), None),
            "the next /loc places it"
        );
        let served = m.serve();
        assert_eq!(served[1]["mob"], "a scout from zanivar");
        assert_eq!(
            served[1]["points"],
            serde_json::json!([[-791.0, 173.0, -12.0]])
        );
        assert_eq!(served[0]["points"], serde_json::json!([[10.0, -21.0, 1.0]]));
    }
}
