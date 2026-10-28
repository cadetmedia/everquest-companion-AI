# buff-durations: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the buff and
debuff timer lengths; nothing listed here is removed or narrowed without the owner's word
(RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-27 | AnQueth, fork issue #4 | Whirl Till You Hurl's timer shows 24 s when the spin lasts 7.5 s (Color Skew likely the same). Times should come from the log, not the spell data, and be editable. | built (per-spell choice on the Buffs tab's Durations table) |
| 2026-10-27 | owner | For issue #4: an option to calculate a spell's duration from the logs, and an option to override it by hand. | built (edit button by each estimate: Automatic, From my log = median of the last five clean casts with no wiki floor, or Set it myself; `buffTrust.durations`, engine `buffs_overrides.rs`) |
