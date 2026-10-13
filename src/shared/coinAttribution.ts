// coinAttribution.ts — A MERCHANT SALE IS CREDITED TO WHERE ITS ITEMS DROPPED. Pure.
//
// THE ASK (owner, 2026-10-13): anything looted in zone A counts toward the platinum earned per
// hour in zone A. Loot carried out of a dungeon and sold in town is the dungeon's income, and a
// zone where you only sold things did not pay that coin.
//
// HOW: the coin column names the item a merchant paid for (`coinSold`, engine
// progression_ledger.rs). At each sale, every copy of that item you looted and kept since your
// last sale of it shares the sale equally, each at its own loot time. Spread, not lumped: twenty
// sashes sold as a stack were earned over the camp, and lumping them on the last loot would read
// as a burst. A stack looted at once counts by its size. A sale with no such loot (bought and resold, or looted before the history begins)
// stays where and when it happened. Corpse coin and auto-sold loot already land where they drop.
//
// Item names join case-insensitively; the sale line is `for the <item>(s).`, the engine strips it.

import type { ProgressionSnap } from './progressionTypes'
import type { LootEvent } from './types'

const key = (item: string): string => item.trim().toLowerCase()

/** Loot you held afterwards (bags, hoard, depot): an auto-sold, destroyed or combined item never
 *  reaches a merchant. */
const kept = (ev: LootEvent): boolean =>
  ev.disposition !== 'sold' && ev.disposition !== 'destroyed' && ev.disposition !== 'combined'

type Pending = Map<string, { ts: number; n: number }[]>

/** Queue every kept loot from `from` up to `ts`; returns where it stopped. */
function queueLoot(pending: Pending, loot: readonly LootEvent[], from: number, ts: number): number {
  let li = from
  for (; li < loot.length && loot[li].ts <= ts; li++) {
    if (!kept(loot[li])) continue
    const k = key(loot[li].item)
    const row = { ts: loot[li].ts, n: loot[li].count ?? 1 }
    const at = pending.get(k)
    if (at === undefined) pending.set(k, [row])
    else at.push(row)
  }
  return li
}

/** One coin entry, credited: a sale shared by item count over the loots it paid for, or as is. */
function credit(pending: Pending, coin: { ts: number; copper: number; sold: string }): { ts: number; copper: number }[] {
  const loots = coin.sold === '' ? undefined : pending.get(key(coin.sold))
  if (loots === undefined || loots.length === 0) return [{ ts: coin.ts, copper: coin.copper }]
  pending.delete(key(coin.sold))
  // Shared by item count: a stack of two earned twice what one did.
  const items = loots.reduce((a, l) => a + l.n, 0)
  return loots.map((l) => ({ ts: l.ts, copper: (coin.copper * l.n) / items }))
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
    out.push(...credit(pending, { ts: coinTs[i], copper: snap.coinCopper?.[i] ?? 0, sold: sold[i] ?? '' }))
  }
  out.sort((a, b) => a.ts - b.ts)
  return {
    ...snap,
    coinTs: out.map((c) => c.ts),
    coinCopper: out.map((c) => c.copper),
    coinSold: out.map(() => '')
  }
}
