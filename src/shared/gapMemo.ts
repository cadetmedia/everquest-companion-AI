// shared/gapMemo.ts — the Gaps derivation's caches (perf audit, 2026-10-20: each Gaps visit cost
// 400–500 ms of main thread as one long task). The profile put it in two places, both fixed here:
//
//   * FIXED-CATALOG INDEXES REBUILT ON EVERY CALL. mobs.json and dropGroups.json are ES-imported and
//     never change at runtime, yet each derivation re-walked all ~7,900 pages to build the same
//     name → drops, name → pages, name → factions maps (about 80 ms a visit). `perObject` keeps one
//     per input OBJECT in a WeakMap: the same array in, the same index out, and a test's throwaway
//     catalog is collected with its index. THE CONTRACT IS IDENTITY: a caller that edits a catalog
//     in place after deriving from it reads the stale index. Nothing does; build a new array instead.
//   * THE SAME STRING FOLDED OVER AND OVER. `itemBaseName` and `mobKey` (57 and 56 ms in the
//     profile) ran on every drop of every page, per looted item. `memoFold` remembers each input's
//     fold; the names are a bounded vocabulary (catalog names, item names, the log's mob names), and
//     the table is cleared at `cap` entries so a pathological input cannot grow it without end.
//
// `memoLast` is the third: the whole snapshot, kept across a tab's remounts while its inputs are the
// same objects (useGapsData.ts).

import { mobKey } from './mobKey'

/** A pure string fold, each input's answer remembered; the table empties itself at `cap` entries. */
export function memoFold(fold: (s: string) => string, cap = 100_000): (s: string) => string {
  const seen = new Map<string, string>()
  return (s) => {
    const hit = seen.get(s)
    if (hit !== undefined) return hit
    if (seen.size >= cap) seen.clear()
    const out = fold(s)
    seen.set(s, out)
    return out
  }
}

/** A value built from one object (a catalog, a groups table), built once per object identity. */
export function perObject<K extends object, V>(build: (k: K) => V): (k: K) => V {
  // Boxed, so a built value that is itself `undefined` still reads as built.
  const cache = new WeakMap<K, { v: V }>()
  return (k) => {
    const hit = cache.get(k)
    if (hit !== undefined) return hit.v
    const v = build(k)
    cache.set(k, { v })
    return v
  }
}

/**
 * A one-entry cache: the last answer, returned again while every value in the key is the same
 * (`Object.is`, element by element), else `build` runs and its answer replaces the last. It holds
 * one result at a time, so a changed input costs a recompute and nothing piles up.
 */
export function memoLast<R>(): (key: readonly unknown[], build: () => R) => R {
  let last: { key: readonly unknown[]; out: R } | undefined
  return (key, build) => {
    if (last?.key.length === key.length && last.key.every((k, i) => Object.is(k, key[i]))) return last.out
    const out = build()
    last = { key, out }
    return out
  }
}

/** `mobKey`, remembered: the gap modules key every catalog name and every loot line's mob with it. */
export const gapMobKey = memoFold(mobKey)
