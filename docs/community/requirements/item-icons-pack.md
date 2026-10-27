# item-icons-pack: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-25 | owner | Item icons are not read from the player's EQ install: "no, we should not read from the data of the install, try to get them from the WIKI Github first, and the wiki directly next. either way should cache it." Build and app both; the pack checked against its sha256; GitHub not counted as wiki requests. | built; the wiki leg withdrawn 2026-10-26 (owner: the app never reads the wiki on its own, wiki-traffic.md): an icon neither bundled, cached nor in the pack shows the placeholder |
| 2026-10-26 | owner | The app downloads no icons at run time, not even from the GitHub pack: "We should only pull in the icons we need during development and deltas scraping right?" The delta scrape's `fetch-wiki-images` (pack first, then the wiki) bundles every icon the item data names. | built (`itemIconPack.ts` removed; an icon neither bundled nor cached shows the placeholder) |
| 2026-10-26 | owner | The build step uses the GitHub pack only for icons the bundle is missing: "We only need the pack for updates we are missing". | built (`scripts/sources/packIcons.ts`: no missing icon, no GitHub request) |
