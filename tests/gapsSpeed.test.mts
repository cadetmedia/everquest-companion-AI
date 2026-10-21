// The Gaps derivation is fast, and its caches change nothing (perf audit, 2026-10-20: each Gaps
// visit cost 400–500 ms of main thread). Measured before the fix on the real catalog with 30,000
// synthetic loot lines: factions 58 ms, drops 234 ms, images 44 ms, every visit. After: the
// catalog's indexes are built once per catalog (gapMemo.ts), the server-wide rule's `ties` reads
// them instead of rescanning every page per item, and the whole snapshot is kept while its inputs
// are the same objects (gapDerive.ts `lastGapsSnap`). The bounds below are generous on purpose: a
// loaded CI box must not fail them, and the old code still would on the cached revisit (which is
// asserted by identity, not by a clock).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveGaps, lastGapsSnap, type GapsMet, type GapsWiki } from '../src/shared/gapDerive'
import { memoFold, memoLast, perObject } from '../src/shared/gapMemo'
import type { GapsSnap } from '../src/shared/gaps'
import type { KillMap } from '../src/shared/kills'
import type { LootEvent } from '../src/shared/types'
import { MOB_CATALOG } from '../src/renderer/src/features/mobs/mobSearch'
import dropGroupsJson from '../src/renderer/src/data/eqlegends/dropGroups.json'

const DROPS = dropGroupsJson as unknown as { groups: GapsWiki['groups']; aliases?: GapsWiki['aliases'] }

// A fixed-seed generator: the same synthetic log every run.
let seed = 7
const rnd = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]

/** 5,000 loot lines across 2,000 catalog mobs: half listed drops, the rest group members, items many mobs drop, and one-offs. */
function syntheticLog(): { engine: GapsSnap; met: GapsMet } {
  const withDrops = MOB_CATALOG.filter((m) => (m.drops ?? []).length > 0)
  const mobs = Array.from({ length: 2000 }, () => pick(withDrops))
  const members = Object.values(DROPS.groups).flat()
  const wide = Array.from({ length: 40 }, (_, i) => `Wide Item ${String(i)}`)
  const loot: LootEvent[] = Array.from({ length: 5000 }, (_, i) => {
    const m = pick(mobs)
    const r = rnd()
    const item = r < 0.5 ? pick(m.drops ?? ['x']) : r < 0.7 ? pick(members) : r < 0.9 ? pick(wide) : `Odd Thing ${String(i % 700)}`
    return { ts: 1_700_000_000_000 + i * 1000, item, source: m.name, zone: pick(m.zones ?? ['Somewhere']) }
  })
  const itemMobs = new Map(loot.map((e) => [e.item.toLowerCase(), rnd() < 0.3 ? null : [pick(MOB_CATALOG).name]] as const))
  const kills = Object.fromEntries(mobs.map((m) => [m.name.toLowerCase(), { display: m.name, count: 3, firstTs: 1, lastTs: 2 }])) as unknown as KillMap
  const killFactions = mobs.slice(0, 1000).map((m) => ({ mob: m.name, faction: 'Some Faction', n: 2, zone: 'X', adjust: -5 }))
  const cons = mobs.slice(0, 500).map((m) => ({ mob: m.name, zone: 'Y', cons: 2, ts: 5 }))
  const engine = { rows: [], totals: {}, seen: {}, killFactions } as unknown as GapsSnap
  return { engine, met: { loot, kills, cons, itemMobs } }
}

const WIKI: GapsWiki = { catalog: MOB_CATALOG, groups: DROPS.groups, aliases: DROPS.aliases ?? {} }
/** The same wiki as new objects throughout: every per-catalog index misses, the uncached path. */
const freshWiki = (): GapsWiki => structuredClone(WIKI)

test('5,000 loot lines over 2,000 mobs derive fast, and the cached indexes give the uncached answer', () => {
  const { engine, met } = syntheticLog()
  const cold = deriveGaps(engine, met, WIKI)
  const t0 = performance.now()
  const warm = deriveGaps(engine, met, WIKI)
  const warmMs = performance.now() - t0
  // Measured 2026-10-20: about 20 ms warm. The old path rebuilt every index and rescanned the
  // catalog per server-wide candidate on every call.
  assert.ok(warmMs < 500, `warm derivation took ${warmMs.toFixed(0)} ms`)
  assert.deepEqual(warm, cold)
  assert.deepEqual(deriveGaps(engine, met, freshWiki()), cold)
  assert.ok(cold.totals.drop > 0 && cold.totals.faction > 0, 'the synthetic log reaches the drop and faction domains')
  // Each Wide Item is looted from 10+ mobs and tied by the wiki to one: the server-wide rule (and
  // its `ties`, the profile's hot spot) ran on every one of them and left it out.
  assert.equal(cold.rows.filter((r) => r.name.startsWith('Wide Item')).length, 0)
})

test('the snapshot is kept while every input is the same object, and recomputed when one changes', () => {
  const { engine, met } = syntheticLog()
  const snapOf = lastGapsSnap()
  const first = snapOf(engine, met, WIKI)
  assert.deepEqual(first, deriveGaps(engine, met, freshWiki()))
  // A revisit (a remount) with nothing new: the same snapshot, not a copy.
  assert.equal(snapOf(engine, { ...met }, WIKI), first)
  // One more loot line is a new loot array: recomputed, and equal to the uncached answer.
  const more = { ...met, loot: [...met.loot, { ts: 1_800_000_000_000, item: 'Brand New Thing', source: met.loot[0].source, zone: 'Z' }] }
  const next = snapOf(engine, more, WIKI)
  assert.notEqual(next, first)
  assert.deepEqual(next, deriveGaps(engine, more, freshWiki()))
})

test('the memo helpers: a fold remembered, an index per object, the last answer per key', () => {
  let folds = 0
  const fold = memoFold((s) => (folds++, s.toLowerCase()), 2)
  assert.equal(fold('A'), 'a')
  assert.equal(fold('A'), 'a')
  assert.equal(folds, 1)
  fold('B')
  fold('C') // the cap: the table empties and starts again, answers unchanged
  assert.equal(fold('A'), 'a')
  let builds = 0
  const sizeOf = perObject((a: readonly number[]) => (builds++, a.length))
  const arr = [1, 2]
  assert.equal(sizeOf(arr) + sizeOf(arr), 4)
  assert.equal(sizeOf([1, 2, 3]), 3)
  assert.equal(builds, 2)
  const last = memoLast<object>()
  const a = last([1, arr], () => ({}))
  assert.equal(last([1, arr], () => ({})), a)
  assert.notEqual(last([1, [1, 2]], () => ({})), a)
})

test("one domain only (the Wiki Gaps overlay's background copy) gives the full derivation's rows of that domain", () => {
  const { engine, met } = syntheticLog()
  const wiki: GapsWiki = { catalog: MOB_CATALOG, groups: DROPS.groups, aliases: DROPS.aliases ?? {} }
  const full = deriveGaps(engine, met, wiki)
  for (const only of ['faction', 'drop', 'image'] as const) {
    const one = deriveGaps(engine, met, wiki, only)
    assert.deepEqual(one.rows, full.rows.filter((r) => r.domain === only), only)
  }
  // The one-domain answer is cached apart from the full one: the key carries `only`.
  const snap = lastGapsSnap()
  const image = snap(engine, met, wiki, 'image')
  assert.notEqual(snap(engine, met, wiki), image)
  assert.equal(snap(engine, met, wiki, 'image') === image, false, 'a one-entry cache: the full answer replaced it')
})
