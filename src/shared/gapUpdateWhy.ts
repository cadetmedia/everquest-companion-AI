// shared/gapUpdateWhy.ts — why an "Update page" row is an update (owner, 2026-10-25: "it would be nice
// to know WHY we have an update"): what the existing page lacks or gets wrong, in the words its own
// chip already uses (`gapActions` `why`), so the tag's tooltip and the details say the same thing.
// Every update kind goes through the chips: a faction, a drop, a picture, a notice, a redirect, a
// quest the wiki has, and whatever later kinds give their own chip (an item page lacking a forage
// zone, on gaps-item-facts). A trader the catalog has as a mob has no chip of its own for that, so
// its reason is written here. Apart from gaps.ts and gapJob.ts, which sit at their size bars.

import { gapActions, type GapActionContext, type GapActionKind, type GapRow, type GapVerdict } from './gaps'
import { gapJob } from './gapJob'
import { shownName } from './gapEdits'

/** Chips that are no reason the page needs an edit: our data's own lag, a parser leftover. */
const NOT_A_PAGE_CHANGE: ReadonlySet<GapActionKind> = new Set<GapActionKind>(['rescrape', 'fixParser'])

/**
 * The reasons an update row's page needs an edit, one per chip; none for a new-page row. The verdict
 * matters to no update kind (it words the new-page chips), so it may be left as unchecked.
 */
export function updateWhy(row: GapRow, verdict: GapVerdict = 'unchecked', ctx: GapActionContext = {}): string[] {
  if (gapJob(row, ctx) !== 'update') return []
  if (row.domain === 'merchant' && row.viaRedirect === undefined) {
    return [`The wiki has a page for ${shownName(row)} as a mob, not as a merchant: it lacks the merchant layout.`]
  }
  return gapActions(row, verdict, ctx)
    .filter((a) => !NOT_A_PAGE_CHANGE.has(a.kind) && a.why !== '')
    .map((a) => a.why)
}
