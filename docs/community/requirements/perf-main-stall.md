# perf-main-stall: what was asked for

Every request this branch has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-20 | owner | "review the application as a whole ... what's making it feel slow and also how we can improve that": the performance review found the first Gear visit held the main process 204 ms (every window's IPC, overlays included) and a 65 ms synchronous cache write on main. | built (gear index sliced and prewarmed 5 s after launch: lag 204 to 25 ms; the resist worker writes its own cache) |
