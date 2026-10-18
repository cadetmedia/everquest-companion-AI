# log-archive: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19). Rows
before 2026-10-10 were gathered that day from agent notes and the branch history.

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-09-28 | owner | Players can clear a huge log and keep their stats (upstream #37). | built |
| 2026-10-03 | owner | Back up the owner's log before building. | done |
| 2026-10-04 | owner | Show the switch in regular builds. | built |
| 2026-10-05 | owner | Rename the switch: Summarize and archive log. | built |
| 2026-10-06 | owner | Archiving is automatic; the switch is the only thing a player touches. | built |
| 2026-10-11 | owner | The `gaps` module is captured on a Refresh and merged with the live log, so the Gaps tab counts the archived history (owner pressed Refresh and saw no change). | built (`gaps` in CAPTURED_MODULES; `mergeGaps` joins rows by domain and case-folded name, sums counts, tallies and copper, widens kinds and first/last, keeps the last three samples, recounts totals, re-caps at 500 a domain; a kept history lacking the module is refolded at launch) |
| 2026-10-16 | owner (bug hunt, 2026-10-16) | Merchant sales stopped being credited to the zone the loot came from once an archived segment was shown (the merge dropped `coinSold`). | built (`coinSold` joins the coin group, padded with '' where a side lacks it) |
| 2026-10-18 | owner | An archived log is read again automatically after an update, so a fix or a new reading (Gaps pets, AA casts, era) reaches the archived months without anyone remembering the Refresh button: "someone will have to remember to re-run this against their archive every time i fix or enhance the gaps?" (the archive recorded by test.19 still listed pets and Heroic Leap as unknown under test.26). | asked |
| 2026-10-18 | owner | After the automatic re-read of an archive, open screens show the new numbers without a restart or a wait for that data's next update ("sure, make things update"). | built (a refresh pushes the world-changed frame the screens already refetch on) |
