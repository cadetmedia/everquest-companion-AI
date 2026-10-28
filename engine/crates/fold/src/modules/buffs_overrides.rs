//! The player's per-spell duration choices (fork issue #4) — the one input to the estimator that the
//! log did not produce.
//!
//! The automatic estimate is the DB floor raised to the longest recent cycle. That is right for a
//! buff an AA or focus extends, and wrong whenever one odd cycle runs long: a reporter's Whirl Till
//! You Hurl read 24 s against a 7.5 s spin, with no way to correct it. So per spell line the player
//! may choose:
//!
//!   * `log`   — the MEDIAN of their own recent clean cycles, with no DB floor. A median, because
//!               the point of choosing it is to stop one outlier deciding the bar. With no clean
//!               cycle yet there is nothing to take a median of, and the automatic estimate stands.
//!   * `fixed` — exactly the number they typed.
//!
//! A choice is about the SPELL, so it applies to every caster of that line; `log` still reads each
//! caster's own cycles, because those are separate measurements.
//!
//! Arrives inside the `buffTrust` define (`durations`), which replaces the whole set every push.

use crate::modules::buffs_shapes::percentile;
use serde_json::Value;
use std::collections::HashMap;

/// The longest duration a choice may state: the engine's own sample ceiling.
const MAX_FIXED_MS: i64 = crate::modules::buffs_shapes::MAX_SAMPLE_MS;

/// One spell line's choice.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DurationOverride {
    /// The median of the caster's recent clean cycles.
    Log,
    /// Exactly this many ms.
    Fixed(i64),
}

/// The `durations` object of a `buffTrust` payload, read. Anything unreadable is skipped: a bad
/// entry must not cost the player their other choices. Absent means none.
pub fn parse_overrides(payload: &Value) -> HashMap<String, DurationOverride> {
    let mut out = HashMap::new();
    let Some(map) = payload.get("durations").and_then(Value::as_object) else {
        return out;
    };
    for (key, entry) in map {
        let choice = match entry.get("mode").and_then(Value::as_str) {
            Some("log") => Some(DurationOverride::Log),
            Some("fixed") => entry
                .get("ms")
                .and_then(Value::as_i64)
                .filter(|&ms| ms > 0 && ms <= MAX_FIXED_MS)
                .map(DurationOverride::Fixed),
            _ => None,
        };
        if let Some(choice) = choice {
            out.insert(key.clone(), choice);
        }
    }
    out
}

/// The median of a clean window, rounded to the ms, or `None` for an empty one.
pub fn window_median_ms(clean_window: &[i64]) -> Option<i64> {
    if clean_window.is_empty() {
        return None;
    }
    let mut sorted = clean_window.to_vec();
    sorted.sort_unstable();
    Some(percentile(&sorted, 0.5).round() as i64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_both_modes_and_skips_what_it_cannot() {
        let got = parse_overrides(&json!({ "durations": {
            "whirl till you hurl": { "mode": "fixed", "ms": 7500 },
            "color skew": { "mode": "log" },
            "bad mode": { "mode": "sometimes" },
            "zero": { "mode": "fixed", "ms": 0 },
            "no number": { "mode": "fixed" }
        }}));
        assert_eq!(got.len(), 2);
        assert_eq!(
            got.get("whirl till you hurl"),
            Some(&DurationOverride::Fixed(7500))
        );
        assert_eq!(got.get("color skew"), Some(&DurationOverride::Log));
    }

    #[test]
    fn no_durations_means_none() {
        assert!(parse_overrides(&json!({ "externals": [] })).is_empty());
    }

    #[test]
    fn the_median_ignores_one_long_outlier() {
        assert_eq!(
            window_median_ms(&[7_000, 24_000, 8_000, 7_500, 7_800]),
            Some(7_800)
        );
        assert_eq!(window_median_ms(&[]), None);
    }
}
