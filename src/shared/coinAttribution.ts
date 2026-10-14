// coinAttribution.ts — A MERCHANT SALE IS CREDITED TO WHERE ITS ITEMS DROPPED. Pure.
//
// THE ASK (owner, 2026-10-13): anything looted in zone A counts toward the platinum earned per
// hour in zone A. Loot carried out of a dungeon and sold in town is the dungeon's income, and a
// zone where you only sold things did not pay that coin.
//
// HOW: the coin column names the item a merchant paid for (`coinSold`, engine
// progression_ledger.rs). Each sale credits ONE pending loot of that item, the oldest you looted
// and kept and have not yet sold (first in, first out), at that loot's time; only that loot leaves
// the queue. Selling three swords one at a time credits all three to where they dropped (owner
// lead, 2026-10-13). A loot that was a stack (count > 1) is one entry, consumed whole by one sale.
// A sale with no such loot (bought and resold, or looted before the history begins) stays where
// and when it happened. Corpse coin and auto-sold loot already land where they drop.
//
// Item names join case-insensitively; the sale line is `for the <item>(s).`, the engine strips it.

import type { ProgressionSnap } from './progressionTypes'
import type { LootEvent } from './types'

const key = (item: string): string => item.trim().toLowerCase()

/** Loot you held afterwards (bags, hoard, depot): an auto-sold, destroyed or combined item never
 *  reaches a merchant. */
const kept = (ev: LootEvent): boolean =>
  ev.disposition !== 'sold' && ev.disposition !== 'destroyed' && ev.disposition !== 'combined'

type Pending = Map<string, number[]>

/** Queue every kept loot from `from` up to `ts`; returns where it stopped. */
function queueLoot(pending: Pending, loot: readonly LootEvent[], from: number, ts: number): number {
  let li = from
  for (; li < loot.length && loot[li].ts <= ts; li++) {
    if (!kept(loot[li])) continue
    const k = key(loot[li].item)
    const at = pending.get(k)
    if (at === undefined) pending.set(k, [loot[li].ts])
    else at.push(loot[li].ts)
  }
  return li
}

/** One coin entry, credited: a sale moved whole to the oldest pending loot it paid for, or as is. */
function credit(pending: Pending, coin: { ts: number; copper: number; sold: string }): { ts: number; copper: number } {
  const loots = coin.sold === '' ? undefined : pending.get(key(coin.sold))
  const oldest = loots?.shift()
  return { ts: oldest ?? coin.ts, copper: coin.copper }
}

/**
 * The snapshot with every merchant sale moved to the loot it paid for, the coin columns re-sorted
 * by time. Returns `snap` itself when there is nothing to move, so a memo keyed on it holds.
 */
export function attributeSales(snap: ProgressionSnap, loot: readonly LootEvent[]): ProgressionSnap {
  const coinTs = snap.coinTs ?? []
  const sold = snap.coinSold ?? []
  if (!sold.some((s) => s !== '')) return snap
  const pending: Pending = new Map()
  const out: { ts: number; copper: number }[] = []
  let li = 0
  for (let i = 0; i < coinTs.length; i++) {
    li = queueLoot(pending, loot, li, coinTs[i])
    out.push(credit(pending, { ts: coinTs[i], copper: snap.coinCopper?.[i] ?? 0, sold: sold[i] ?? '' }))
  }
  out.sort((a, b) => a.ts - b.ts)
  return {
    ...snap,
    coinTs: out.map((c) => c.ts),
    coinCopper: out.map((c) => c.copper),
    coinSold: out.map(() => '')
  }
}
