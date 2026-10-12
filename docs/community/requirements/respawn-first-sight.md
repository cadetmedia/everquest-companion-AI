# respawn-first-sight: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-11 | owner | The respawn estimate measures from a mob's death to its first sighting afterwards, not to its next death, so the fight no longer rides in the timer (Hoptor Thaggelum: 570 s true, 634 s shown). | built (`first_seen_ts` in `respawn.rs`; death to next death only when nothing named it; Hoptor 569 s, arch magus 568, reanimated hand 590) |
| 2026-10-11 | owner | Any true sign in the log that the mob is back up ends the respawn gap and stops a running countdown: it casts, it attacks, something attacks it, someone hails it, it speaks. | built (`respawn_seen.rs`: swings, casts, cons, heals, a kill by it, emotes, pet says, `says` and `Hail` lines; the UP label keys off the same sighting; unwatched mobs excepted, free-text emotes not read) |
