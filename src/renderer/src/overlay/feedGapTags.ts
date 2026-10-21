// feedGapTags — the Event log's Wiki Gaps marks, and the Gaps tab's Done rule over them.
//
// Three marks (engine event_feed.rs and event_feed_offer.rs):
//   * not in the app's data: "missing · screenshot it" (owner ask, 2026-10-18);
//   * a mob whose wiki pages have no picture: "no picture · screenshot it" (owner ask, 2026-10-20);
//   * a `keep` row, a merchant's offer for an item the wiki lacks (owner ask, 2026-10-20: "the
//     moment i click the item and he offers it to me, the event log pop up a row showing it"). The
//     owner asked it short ("just simply KEEP - Needed on wiki"): the item and the mark, no price,
//     no merchant; those are on the Gaps row's details.
// A row the player marked Done on the Gaps tab asks for nothing (owner, 2026-10-20: "if i've marked
// it done, don't tell me it needs a screenshot still"), and a Done `keep` row, which is only its
// mark, is not shown at all.

import type { FeedEvent } from '@shared/types'
import { isMarkedDone } from '../features/gaps/doneMarksStore'

export const KEEP_LABEL = 'KEEP · needed on wiki'

/** A `keep` row whose item the player marked Done: nothing left to say, so not shown. */
export function hiddenKeep(e: FeedEvent, done: ReadonlySet<string>): boolean {
  return e.kind === 'keep' && isMarkedDone(done, 'item', e.title)
}

/** The mark a row carries, or undefined for none. The engine never sets `unknown` and `needsImage` together. */
export function screenshotLabel(e: FeedEvent, done: ReadonlySet<string>): string | undefined {
  if (e.kind === 'keep') return hiddenKeep(e, done) ? undefined : KEEP_LABEL
  if (e.unknown) {
    if (isMarkedDone(done, e.kind === 'con' ? 'mob' : 'item', e.title)) return undefined
    // Sold on loot is already gone: the next one is the screenshot (review 2026-10-19).
    return e.detail?.startsWith('auto-sold') === true ? 'missing · auto-sold, keep the next one' : 'missing · screenshot it'
  }
  return e.needsImage && !isMarkedDone(done, 'image', e.title) ? 'no picture · screenshot it' : undefined
}
