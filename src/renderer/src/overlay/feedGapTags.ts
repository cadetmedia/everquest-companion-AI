// feedGapTags — the Event log's Wiki Gaps marks, and the Gaps tab's Done rule over them.
//
// Three marks (engine event_feed.rs and event_feed_offer.rs):
//   * not in the app's data: "missing · screenshot it" (owner ask, 2026-10-18). On a con it is the
//     Gaps tab's own Mobs row (engine gaps_marks.rs), so the two agree (owner, 2026-10-23: "uh
//     shouldn't they agree logically?"): a row the tab serves "may be a player" reads "missing? ·
//     may be a player · screenshot it", and a name the viewer marked as a player gets no mark;
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
export const MAYBE_PLAYER_LABEL = 'missing? · may be a player · screenshot it'

const NO_PLAYERS: ReadonlySet<string> = new Set()

/** A `keep` row whose item the player marked Done: nothing left to say, so not shown. */
export function hiddenKeep(e: FeedEvent, done: ReadonlySet<string>): boolean {
  return e.kind === 'keep' && isMarkedDone(done, 'item', e.title)
}

/** The mark a row carries, or undefined for none. The engine never sets `unknown` and `needsImage`
 *  together. `players`: the names the viewer marked as players on the Gaps tab, lowercased. */
export function screenshotLabel(e: FeedEvent, done: ReadonlySet<string>, players: ReadonlySet<string> = NO_PLAYERS): string | undefined {
  if (e.kind === 'keep') return hiddenKeep(e, done) ? undefined : KEEP_LABEL
  if (e.unknown) {
    if (isMarkedDone(done, e.kind === 'con' ? 'mob' : 'item', e.title)) return undefined
    if (e.kind === 'con' && players.has(e.title.toLowerCase())) return undefined
    if (e.kind === 'con' && e.maybePlayer === true) return MAYBE_PLAYER_LABEL
    // Sold on loot is already gone: the next one is the screenshot (review 2026-10-19).
    return e.detail?.startsWith('auto-sold') === true ? 'missing · auto-sold, keep the next one' : 'missing · screenshot it'
  }
  return e.needsImage && !isMarkedDone(done, 'image', e.title) ? 'no picture · screenshot it' : undefined
}
