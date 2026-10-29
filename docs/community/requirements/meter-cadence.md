# meter-cadence: what was asked for

How often the damage and healing meters refresh. Newest at the bottom. Read it before changing
`src/renderer/src/features/combat/combatPoll.ts`; nothing here is removed or narrowed without the
owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-26 | performance review | Combat reads at one a second per window in a fight (was up to four), to cut renderer CPU. | built (optimization pass 2) |
| 2026-10-28 | owner | "we need to bump the dps overlay back up to 4 times a second instead of once" | built: a meter overlay's ping may pull its next read to 250 ms after the last (`OVERLAY_PING_GAP_MS`), four reads a second on main's 4 Hz ping; the fallback poll and the Combat tab and Overview stay at one a second. |
