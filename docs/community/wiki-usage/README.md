# Wiki usage ledger

Every request this project sends to eqlwiki.com, so it can be audited (owner, 2026-10-23: "i want to
audit and make sure we are not using it more than we need to"; "he doesn't care for what reason we
hit the EQLWiki, so i want to track it all"). Every request names the fork in its User-Agent:
`everquest-companion/0.1 (+https://github.com/kaltinril/everquest-companion)`.

## What writes here

- **Every script run** that talks to a wiki (`scrape-*`, `scrape-delta.mts`, `fetch-wiki-images.mts`,
  anything through `scripts/sources/wikiApi.ts` or `deltaApi.ts`): one line per run, appended at the
  run's end by `scripts/sources/wikiLedger.ts`, with the same summary printed to the console.
- **Ad-hoc reads** by people and agents: `npx tsx scripts/wiki-call.mts --reason "<why>" action=...`.
  Use it instead of curl or a browser fetch for any wiki read during development; it needs a reason.
- **By hand**, only for calls made before this existed (`backfilled: true`, `approx: true` where the
  time or size is estimated).

A run writes into the checkout it runs in. Commit the new lines to `main_community_rules` with the
run's data (DATA_REFRESH.md, step 5). `WIKI_LEDGER=<path>` writes elsewhere; `WIKI_LEDGER=off`
writes nothing; tests (a stubbed fetch, nothing sent) never write.

The app's own requests (item and mob lookups, images, the Gaps quest Copy) cannot reach this file
on a player's machine: they go to `wiki-requests.jsonl` in that install's userData, one line a
request, and the session's total is logged at quit (`src/main/wikiUsage.ts`).

## A line

```json
{"at":"…","started":"…","script":"scrape-delta.mts","args":"--spell-titles","reason":"…",
 "requests":31,"retries":0,"errors":0,"bytes":2400000,"ms":15000,
 "hosts":{"eqlwiki.com":31},"byKind":{"query/recentchanges":{"n":3,"bytes":…},"query/revisions":{"n":28,"bytes":…}},
 "statuses":{"200":31}}
```

`requests` counts every attempt, retries included. `bytes` is the response bodies as received.

## The audit

`npx tsx scripts/wiki-usage.mts` prints the totals by script, by month and by kind of request.

## Before the ledger

Runs before 2026-10-23 are not in it. Their counts are in the commit messages of the data they
produced (`Delta scrape <date> (... pages)` on local-data-refresh) and in DATA_REFRESH.md (the
2026-10-18 full scrape, the 2026-10-21 redirect list: 19 requests). The 2026-10-10 development
incident (~46 requests, WORKFLOW.md "TRAP") is backfilled as one approximate line.
