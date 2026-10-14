# fix-spells-us-column-shift: what was asked for

Every request this fix has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-13 | owner | The 2026-10-13 game patch inserted a column into spells_us.txt (between fields 52 and 75); every field read from 75 on is one off in both readers (TS spellsUsParse.ts, Rust fold spells_us.rs), so resists, debuffs, stacking and spell categories are wrong. Fix both, for old and new clients alike, and get the three tests it broke green again. | built (both readers detect the layout; matches the pre-patch parse on every shared field but one genuinely patched spell; the three tests pass; known reds removed) |
| 2026-10-13 | owner | File an upstream issue that it is broken, and offer the creator the fix as a pull request. | open |
