# wiki-traffic: what was asked for

What the app itself may send to eqlwiki.com. Every request this area has taken, newest at the bottom.
Read it before adding any network call; nothing listed here is removed or narrowed without the
owner's word (RULES.md, rule 19). The scrapers' traffic is DATA_REFRESH.md's; the ledger is
`../wiki-usage/README.md`.

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-26 | owner | The app never reads the wiki on its own: "the app should not be hitting the WIKI ever except (delta refresh before build, user clicks COPY on an item and it does the lookup)". The delta refresh is the repo's scripts, untouched. In the shipped app the only wiki reads left are caused by a Copy click. | built: `lookupItem`/`lookupMob` (hover cards, item dialog, mob page, con card, loot toast) answer from the committed data, the local quest sources and the cache only; `lookupItemOnCopy`/`lookupMobOnCopy` are the only doors to the wiki, opened by the Gaps tab's Copy on an item or mob row (`gapCopyLookup.ts`, which also refreshes the row's verdict); the quest Copy (`gapQuestLive.ts`) stays; the engine's miss announcements are answered from local data or left unanswered (`knowledgeMissFetch.ts`); the image handler fetches no wiki image (the app injects no fetcher: bundled, cached or GitHub-pack icons show, anything else the placeholder; on 2026-10-26 every one of the 787 icon ids in items.json is bundled). Pinned by `tests/wikiTraffic.test.mts`. The 2026-10-25 "and the wiki directly next" for icons (item-icons-pack.md) is withdrawn by this ruling; the GitHub pack stays. |
