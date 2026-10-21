# fix-engine-read-latency: what was asked for

Every request this fix has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-20 | owner | Find where the app is slow and fix it without losing accuracy ("look at ways to maintain accuracy but be efficient"; "why is there ANY delay at all?"): engine reads waited up to a 25 ms nap each, one connection served them in turn, and identical reads from several windows each went to the engine. | built (nap wakes on an ask; no snapshot clone; identical in-flight reads shared) |
