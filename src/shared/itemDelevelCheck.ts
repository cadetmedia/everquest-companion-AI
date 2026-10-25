// itemDelevelCheck.ts — the proof of a +0 block (itemDelevel.ts): scaled forward again by the app's own
// `scaleStatBlock` at the state the numbers came to, it must give the window's numbers back. Parsed
// both sides with the wiki's statsblock parser (itemStats.ts `parseStatsBlock`), so the check also
// covers how the lines were written, not only the arithmetic.

import { parseStatsBlock, type ItemStatBlock } from './itemStats'
import { normalizeStatKey, scaleStatBlock, type ItemUpgradeState } from './itemUpgrade'

const numberIn = (v: string | number | undefined): number | undefined => {
  if (typeof v === 'number' || v === undefined) return v
  const m = /-?\d+(?:\.\d+)?/.exec(v)
  return m === null ? undefined : Number(m[0])
}

/** The numbers a block states, by key (`STR`, `SV_FIRE`, `AC`, `DMG`, `WEIGHT`, ...), with the key as written. */
function numbersOf(b: ItemStatBlock): Map<string, { n: number; label: string }> {
  const out = new Map<string, { n: number; label: string }>()
  const put = (k: string, label: string, v: string | number | undefined): void => {
    const n = numberIn(v)
    if (n !== undefined) out.set(k, { n, label })
  }
  for (const st of [...b.stats, ...b.saves]) put(normalizeStatKey(st.key), st.key, st.value)
  put('AC', 'AC', b.ac)
  put('DMG', 'DMG', b.dmg)
  put('BACKSTAB', 'BACKSTAB', b.backstab)
  put('WEIGHT', 'WT', b.weight)
  put('RANGE', 'Range', b.range)
  return out
}

/** The keys whose forward value differs from the window's, at the state that misses fewest. */
function missesAt(from: ItemStatBlock, want: ReadonlyMap<string, { n: number; label: string }>, s: ItemUpgradeState): string[] {
  const got = numbersOf(scaleStatBlock(from, s))
  // Only what both sides state: a `?` left for the player scales to nothing, and the upgrade's own
  // lines (its SV VOID, a weapon's Accuracy) were taken off the window's side.
  return [...want].filter(([k, v]) => got.has(k) && got.get(k)?.n !== v.n).map(([, v]) => v.label)
}

/**
 * The numbers of `read` (the window's block, the upgrade's own lines off) that `base` does not give
 * back when scaled forward at the best of `states`, by their key as written; empty when it gives them all.
 */
export function roundTripMisses(base: string, read: string, states: readonly ItemUpgradeState[]): string[] {
  const from = parseStatsBlock(base)
  const want = numbersOf(parseStatsBlock(read))
  let best: string[] | undefined
  for (const s of states) {
    const m = missesAt(from, want, s)
    if (best === undefined || m.length < best.length) best = m
    if (best.length === 0) break
  }
  return best ?? []
}
