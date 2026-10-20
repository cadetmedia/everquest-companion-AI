# fix-combat-reading-log: what was asked for

Every request this fix has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-20 | tester (Malkil), via owner | The Combat tab shows "Reading log…" and takes a long time to load, as if re-reading the log. Owner: keep the last snapshot across visits and only say "Reading log…" when the log is really being read ("sure do that"). | built (`combatFeed.ts`: kept per world, 3 s grace for a hydrating answer after a real one, polls coalesced) |
| 2026-10-20 | owner | Find out why his machine takes so long to process a log that is small. | open: nothing on this machine records the engine's own timings in a packaged build; the tester's `errors.log` is asked for (an engine that stops answering is restarted and re-reads the whole log, which shows "Reading log…" mid-session) |
