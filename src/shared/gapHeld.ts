// shared/gapHeld.ts — "you're holding it" on an Items gap row (review C6; owner, 2026-10-19): an
// item the wiki lacks that the player holds right now needs no trip, only a screenshot of its window.
//
// TWO WITNESSES, THE POSKY RECONCILE'S (inventory/reconcile.ts): the inventory export the player
// last wrote (`/outputfile inventory`, folded by planner/ownership.ts and served as the Gear tab's
// `gearOwnership` payload) says where each copy was then; the loot the log kept after that instant
// (`computeHeldCountsAfter`, gross) has landed in the bags since, and the destroys after it come
// off. With no export there is no claim: a loot line alone cannot tell a copy still held from one
// sold to a merchant last week.
//
// One item at any tier (`+N` folds to the base, case folded): the key is `itemTierKey`, which IS the
// ownership index's key and the loot counting key (ownership.ts pins the three together). An
// `(Exaltation)` row is the gem socketed into another item, not a copy (gearOwnership.ts rule 2).

import { itemTierKey } from './itemStats'
import type { GapRow } from './gaps'
import type { OwnershipEntry, OwnershipPlace } from './planner/ownership'

/** One place and how many copies it holds. */
export interface HeldPart {
  label: string
  count: number
}

/** What the player holds of one item: in all, and by place. */
export interface GapHeld {
  total: number
  parts: HeldPart[]
  /** The export's own instant (ISO), for the chip's tooltip. */
  exportedAt: string
}

export type HeldIndex = ReadonlyMap<string, GapHeld>

/** The words for a place, in the order a player looks (on you, your bags, then the stores). */
const PLACE_WORD: Record<OwnershipPlace, string> = {
  equipped: 'worn',
  inventory: 'bags',
  bank: 'bank',
  sharedBank: 'shared bank',
  personalDepot: 'depot',
  keyring: 'keyring',
  unknown: 'unfiled'
}
const PLACE_ORDER = Object.keys(PLACE_WORD) as OwnershipPlace[]
/** Where a destroyed copy most likely came from: the bags, then the rest in reading order. */
const DESTROY_ORDER: OwnershipPlace[] = ['inventory', ...PLACE_ORDER.filter((p) => p !== 'inventory')]

type Counts = Map<OwnershipPlace, number>

/** The export's copies of one item by place, exaltation rows left out. */
function dumpCounts(rows: OwnershipEntry[1]): Counts {
  const by: Counts = new Map()
  for (const r of rows) if (!r.exaltation) by.set(r.place, (by.get(r.place) ?? 0) + r.count)
  return by
}

/** Take `n` destroyed copies off, bags first. */
function takeOff(by: Counts, n: number): void {
  let left = n
  for (const p of DESTROY_ORDER) {
    const off = Math.min(by.get(p) ?? 0, left)
    by.set(p, (by.get(p) ?? 0) - off)
    left -= off
  }
}

/**
 * Every item the player holds, keyed by `itemTierKey`. `lootSince` and `destroyedSince` are the
 * log's folds after the export's instant, on the same key (posky/heldCounts.ts); a looted copy is
 * in the bags. No export, no index.
 */
export function heldIndex(
  dump: { entries: readonly OwnershipEntry[]; loadedAt: string | null },
  lootSince: Readonly<Record<string, number>>,
  destroyedSince: Readonly<Record<string, number>> = {}
): HeldIndex {
  const out = new Map<string, GapHeld>()
  if (dump.loadedAt === null) return out
  const byKey = new Map<string, Counts>(dump.entries.map(([key, rows]) => [itemTierKey(key), dumpCounts(rows)]))
  for (const [raw, n] of Object.entries(lootSince)) {
    const key = itemTierKey(raw)
    const by: Counts = byKey.get(key) ?? new Map<OwnershipPlace, number>()
    by.set('inventory', (by.get('inventory') ?? 0) + n)
    byKey.set(key, by)
  }
  for (const [key, by] of byKey) {
    takeOff(by, destroyedSince[key] ?? 0)
    const parts = PLACE_ORDER.flatMap((p) => ((by.get(p) ?? 0) > 0 ? [{ label: PLACE_WORD[p], count: by.get(p) ?? 0 }] : []))
    const total = parts.reduce((s, p) => s + p.count, 0)
    if (total > 0) out.set(key, { total, parts, exportedAt: dump.loadedAt })
  }
  return out
}

/** An Items row's holding, at any tier and any case; undefined for another domain or none held. */
export function gapHeld(row: GapRow, index: HeldIndex): GapHeld | undefined {
  return row.domain === 'item' ? index.get(itemTierKey(row.name)) : undefined
}

/** `bags`, or `2 bags, 1 bank` when the copies are in more than one place. */
function placesText(h: GapHeld): string {
  return h.parts.length === 1 ? (h.parts[0]?.label ?? '') : h.parts.map((p) => `${String(p.count)} ${p.label}`).join(', ')
}

/** The details pane's line: `You hold 2 (bags): screenshot it for the wiki now.` */
export function heldLine(h: GapHeld): string {
  return `You hold ${String(h.total)} (${placesText(h)}): screenshot it for the wiki now.`
}

/** The row chip's tooltip: where the count comes from. */
export function heldTitle(h: GapHeld): string {
  return `You hold ${String(h.total)} (${placesText(h)}): your inventory export of ${h.exportedAt.slice(0, 10)}, plus what the log saw you loot since, less destroys.`
}
