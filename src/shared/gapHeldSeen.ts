// shared/gapHeldSeen.ts — a held item stays a row once an export showed it (owner, 2026-10-22: "so it
// destroyed it from my need to update the wiki just because i turned it in? that makes no sense ...
// doesn't mean it's now suddenly in the wiki"). Plea to Freeport was only ever in the inventory
// export; turned in to Sir Mollin, the next export no longer listed it, and its row vanished while the
// wiki still had no page.
//
// So each held item the wiki data has no page for is REMEMBERED (name, holder, the first and the last
// export that listed it, its slots; renderer localStorage, heldSeenStore.ts) and served after it
// leaves the export (turned in, sold, banked elsewhere, destroyed) until the wiki data knows the item
// (the unknown-items check, main/gapUnknownItems.ts) or the player marks it Done. Its row says when it
// was last held.

import { itemTierKey } from './itemStats'
import type { HeldIndex } from './gapHeld'
import { heldCandidates, logStamp, type ExtraItem } from './gapExtraItems'
import type { GapRow } from './gaps'

/** One held item an export listed, by holder. */
export interface HeldSeen {
  name: string
  /** The holder; the attached character's name. */
  who: string
  /** The first and the last export that listed it (ISO). */
  first: string
  last: string
  slots: string[]
}

/** The newest this many are kept: an item a day for most of a year. */
export const HELD_SEEN_KEEP = 300

const keyOf = (s: Pick<HeldSeen, 'name' | 'who'>): string => `${s.who.toLowerCase()}|${itemTierKey(s.name)}`

/** The remembered items, read back from storage; anything malformed dropped. */
export function heldSeenOf(parsed: unknown): HeldSeen[] {
  if (!Array.isArray(parsed)) return []
  const ok = (s: Partial<HeldSeen>): s is HeldSeen =>
    typeof s.name === 'string' && typeof s.who === 'string' && typeof s.first === 'string' && typeof s.last === 'string' && Array.isArray(s.slots)
  return (parsed as Partial<HeldSeen>[]).filter(ok)
}

/**
 * What the exports show now of the items the wiki data lacks (`unknown`, the export's spellings), one
 * per holder: `me` names the holder the one-character index leaves unnamed.
 */
export function heldSightings(index: HeldIndex, unknown: ReadonlySet<string>, me: string): HeldSeen[] {
  const out: HeldSeen[] = []
  for (const holders of index.values()) {
    for (const h of holders) {
      if (h.exported === undefined || !unknown.has(h.exported.name)) continue
      out.push({ name: h.exported.name, who: h.who ?? me, first: h.exportedAt, last: h.exportedAt, slots: h.exported.slots })
    }
  }
  return out
}

/** The list with the sightings merged in: a known item keeps its first export, moves its last; the newest `keep`. */
export function withHeldSeen(list: readonly HeldSeen[], seen: readonly HeldSeen[], keep = HELD_SEEN_KEEP): HeldSeen[] {
  const by = new Map(list.map((s) => [keyOf(s), s]))
  for (const s of seen) {
    const had = by.get(keyOf(s))
    by.set(keyOf(s), had === undefined ? s : { ...had, last: s.last > had.last ? s.last : had.last, first: s.first < had.first ? s.first : had.first, slots: s.slots })
  }
  return [...by.values()].sort((a, b) => b.last.localeCompare(a.last)).slice(0, keep)
}

/** Whether the list changed: an item new to it, or one with a new last export. */
export function heldSeenChanged(list: readonly HeldSeen[], seen: readonly HeldSeen[]): boolean {
  const by = new Map(list.map((s) => [keyOf(s), s]))
  return seen.some((s) => by.get(keyOf(s))?.last !== s.last)
}

/**
 * The remembered items no export lists now, as `held` witnesses: still a row while the wiki data lacks
 * the item (`unknown`), saying when it was last held. `who`: only that holder's (the one-character
 * view); every holder's with All characters.
 */
export function rememberedExtras(list: readonly HeldSeen[], index: HeldIndex, unknown: ReadonlySet<string>, who?: string): ExtraItem[] {
  return list
    .filter((s) => (who === undefined || s.who.toLowerCase() === who.toLowerCase()) && unknown.has(s.name) && !index.has(itemTierKey(s.name)))
    .map((s) => ({
      name: s.name,
      kind: 'held' as const,
      at: s.last,
      first: s.first,
      count: 0,
      samples: [`${s.who}: last held ${logStamp(s.last)} in ${s.slots.join(', ')}; not in the latest inventory export (turned in, sold, banked or destroyed)`]
    }))
}

/** Who is looking: the attached character, and whether every character's rows are shown. */
export interface ExtraViewer {
  me: string | null
  all: boolean
}

/** The names main is asked about: the export's own, and the remembered ones this view shows that no row names; one per line. */
export function askedNames(holding: HeldIndex, rows: readonly GapRow[], remembered: readonly HeldSeen[], viewer: ExtraViewer): string {
  const named = new Set(rows.filter((r) => r.domain === 'item').map((r) => itemTierKey(r.name)))
  const mine = (who: string): boolean => viewer.all || who.toLowerCase() === (viewer.me ?? '').toLowerCase()
  const kept = remembered.filter((s) => mine(s.who) && !named.has(itemTierKey(s.name))).map((s) => s.name)
  return [...new Set([...heldCandidates(holding, rows), ...kept])].sort((a, b) => a.localeCompare(b)).join('\n')
}
