# item-hover-cards: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19). Earlier
asks are on the branch's BRANCHES.md row; this list starts on 2026-10-12.

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-12 | owner | Regression: the Overview's recent drops lost their icons for ordinary items (Arrow) after the probe stopped fetching full records for non-notable items; the icon must come from the marks batch for every row. | fixed (icon read off the batched marks store by item name, knowledge id as fallback; no extra lookups; and the Overview asks the store for its own rows' raw spellings, since the probe sends one per counting key and a +N tier it did not send never landed) |
| 2026-10-16 | owner (bug hunt, 2026-10-16) | A notable pickup's callout was lost when another item was looted while its probe was in flight. | built (the in-flight probe's result is kept) |
