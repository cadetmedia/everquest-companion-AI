// THE WATCH-LIST WRITES (JOS-194; owner ruling 2026-10-17) — Clear all, and a typed number that
// outlives its watch.
//
// `src/shared/respawnWatchList.ts` holds every edit a surface can make to the respawn watch list,
// and main's IPC handlers apply them to the STORED list. What this file pins is the rule all of them
// keep: a respawn the player typed is MOVED, never dropped by accident — Unwatch (single, Clear all,
// the floating window's, which are one function) sets it aside in `keptCustom`, Watch brings it
// back, and only the edit modal's way back to the calculated number throws it away. Plus the store
// normalizer's half: the kept list is bounded the way `customSec` is, and an old store loads exactly
// as it did.
//
// A WATCH IS A NAME, SO UNWATCH IS A NAME TOO (round 4, shared/respawn.ts header): removing a key
// removes the one entry for that name, which is every zone's clock for it — pinned below, because
// the tooltip that used to say so is gone.
//
// Run: `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  RESPAWN_CUSTOM_MAX_SEC,
  RESPAWN_MAX_KEPT,
  RESPAWN_MAX_WATCHES,
  normalizeRespawnPrefs,
  type RespawnPrefs,
  type RespawnRow
} from '../src/shared/respawn'
import {
  isRespawnMobKey,
  respawnClearAllText,
  respawnClearKeys,
  respawnClearPlan,
  respawnWithCustom,
  respawnWithWatch,
  respawnWithoutWatch,
  respawnWithoutWatches
} from '../src/shared/respawnWatchList'

/** A store round trip: what main would write, read back the way main reads it. */
const stored = (p: RespawnPrefs): RespawnPrefs => normalizeRespawnPrefs(JSON.parse(JSON.stringify(p)))

const PREFS: RespawnPrefs = {
  watches: [
    { key: 'a frenzied ghoul', display: 'a frenzied ghoul', customSec: 600 },
    { key: 'a wan ghoul knight', display: 'a wan ghoul knight' },
    { key: 'ghoul assassin', display: 'Ghoul Assassin', customSec: 30 }
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. UNWATCH KEEPS THE TYPED NUMBER, WATCH BRINGS IT BACK
// ─────────────────────────────────────────────────────────────────────────────

test('unwatching a mob with a typed respawn keeps the number aside', () => {
  const next = respawnWithoutWatch(PREFS, 'a frenzied ghoul')
  assert.deepEqual(
    next.watches.map((w) => w.key),
    ['a wan ghoul knight', 'ghoul assassin']
  )
  assert.deepEqual(next.keptCustom, [{ key: 'a frenzied ghoul', customSec: 600 }])
  // …and it survives the store.
  assert.deepEqual(stored(next), next)
})

test('the key is canonicalized the way the store canonicalizes it', () => {
  const next = respawnWithoutWatch(PREFS, '  A Frenzied Ghoul ')
  assert.deepEqual(next.keptCustom, [{ key: 'a frenzied ghoul', customSec: 600 }])
})

test('unwatching a mob with no typed number keeps nothing and adds no field', () => {
  const next = respawnWithoutWatch(PREFS, 'a wan ghoul knight')
  assert.equal(next.watches.length, 2)
  assert.equal('keptCustom' in next, false)
})

test('a name that is not watched is a no-op, the same value back', () => {
  assert.equal(respawnWithoutWatch(PREFS, 'a gnoll'), PREFS)
})

test('watching it again brings the typed number back and empties the kept list', () => {
  const unwatched = stored(respawnWithoutWatch(PREFS, 'a frenzied ghoul'))
  const back = respawnWithWatch(unwatched, 'a frenzied ghoul', 'a frenzied ghoul')
  assert.deepEqual(
    back.watches.find((w) => w.key === 'a frenzied ghoul'),
    { key: 'a frenzied ghoul', display: 'a frenzied ghoul', customSec: 600 }
  )
  assert.equal('keptCustom' in back, false)
  assert.deepEqual(stored(back), back)
})

test('watching a mob nobody typed a number for adds a plain watch', () => {
  const next = respawnWithWatch({ watches: [] }, 'a gnoll', 'a gnoll')
  assert.deepEqual(next, { watches: [{ key: 'a gnoll', display: 'a gnoll' }] })
})

test('watching an already-watched mob changes nothing, so it cannot overwrite the typed number', () => {
  assert.equal(respawnWithWatch(PREFS, 'a frenzied ghoul', 'a frenzied ghoul'), PREFS)
})

test('a full watch list refuses the watch AND keeps the kept number where it was', () => {
  const full: RespawnPrefs = {
    watches: Array.from({ length: RESPAWN_MAX_WATCHES }, (_, i) => ({ key: `mob ${String(i)}`, display: `mob ${String(i)}` })),
    keptCustom: [{ key: 'a gnoll', customSec: 90 }]
  }
  assert.equal(respawnWithWatch(full, 'a gnoll', 'a gnoll'), full)
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. THE EDIT MODAL: SAVE REPLACES, CLEAR FORGETS FOR GOOD
// ─────────────────────────────────────────────────────────────────────────────

test('saving a number updates the watch in place and leaves the order alone', () => {
  const next = respawnWithCustom(PREFS, 'a wan ghoul knight', 'a wan ghoul knight', 1200)
  assert.deepEqual(
    next.watches.map((w) => [w.key, w.customSec]),
    [
      ['a frenzied ghoul', 600],
      ['a wan ghoul knight', 1200],
      ['ghoul assassin', 30]
    ]
  )
})

test('the way back to the calculated number does not come back after unwatch and watch', () => {
  const cleared = respawnWithCustom(PREFS, 'a frenzied ghoul', 'a frenzied ghoul', undefined)
  assert.equal(cleared.watches.find((w) => w.key === 'a frenzied ghoul')?.customSec, undefined)
  const again = respawnWithWatch(respawnWithoutWatch(cleared, 'a frenzied ghoul'), 'a frenzied ghoul', 'a frenzied ghoul')
  assert.equal(again.watches.find((w) => w.key === 'a frenzied ghoul')?.customSec, undefined)
  assert.equal('keptCustom' in again, false)
})

test('clearing drops a kept copy too, and does not invent a watch for a mob no longer watched', () => {
  const prefs: RespawnPrefs = { watches: [], keptCustom: [{ key: 'a gnoll', customSec: 90 }] }
  const next = respawnWithCustom(prefs, 'a gnoll', 'a gnoll', undefined)
  assert.deepEqual(next, { watches: [] })
})

test('saving a number on a mob whose watch went away meanwhile watches it again (the round-7 box did)', () => {
  const prefs: RespawnPrefs = { watches: [], keptCustom: [{ key: 'a gnoll', customSec: 90 }] }
  assert.deepEqual(respawnWithCustom(prefs, 'a gnoll', 'a gnoll', 120), {
    watches: [{ key: 'a gnoll', display: 'a gnoll', customSec: 120 }]
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. CLEAR ALL
// ─────────────────────────────────────────────────────────────────────────────

test('Clear all removes exactly the given keys, as one value, and keeps their typed numbers', () => {
  const next = respawnWithoutWatches(PREFS, ['a frenzied ghoul', 'GHOUL ASSASSIN', 'a gnoll', 'a frenzied ghoul'])
  assert.deepEqual(next.watches, [{ key: 'a wan ghoul knight', display: 'a wan ghoul knight' }])
  assert.deepEqual(next.keptCustom, [
    { key: 'a frenzied ghoul', customSec: 600 },
    { key: 'ghoul assassin', customSec: 30 }
  ])
  // The same answer the single unwatch gives one key at a time — Clear all decides nothing new.
  const oneByOne = respawnWithoutWatch(respawnWithoutWatch(PREFS, 'a frenzied ghoul'), 'ghoul assassin')
  assert.deepEqual(next, oneByOne)
  // …and every one of them comes back with its number.
  const back = respawnWithWatch(respawnWithWatch(next, 'ghoul assassin', 'Ghoul Assassin'), 'a frenzied ghoul', 'a frenzied ghoul')
  assert.deepEqual(
    back.watches.map((w) => [w.key, w.customSec]),
    [
      ['a wan ghoul knight', undefined],
      ['ghoul assassin', 30],
      ['a frenzied ghoul', 600]
    ]
  )
})

test('Clear all of nothing watched is the same value back', () => {
  assert.equal(respawnWithoutWatches(PREFS, ['a gnoll']), PREFS)
})

test('the Clear all door applies the single unwatch key rule to every key, or refuses the call', () => {
  assert.deepEqual(respawnClearKeys(['a', 'b']), ['a', 'b'])
  for (const bad of [null, 'a', {}, [], ['a', ''], ['a', 7], ['x'.repeat(65)], Array(RESPAWN_MAX_WATCHES + 1).fill('a')]) {
    assert.equal(respawnClearKeys(bad), null, JSON.stringify(bad).slice(0, 40))
  }
  assert.equal(respawnClearKeys(Array(RESPAWN_MAX_WATCHES).fill('a'))?.length, RESPAWN_MAX_WATCHES)
  assert.equal(isRespawnMobKey('x'.repeat(64)), true)
  assert.equal(isRespawnMobKey('x'.repeat(65)), false)
})

const row = (zone: string, key: string): RespawnRow =>
  ({ id: `${zone}::${key}`, key, display: key, zone }) as unknown as RespawnRow

test('the plan clears what the scope shows and counts the same names it stops elsewhere', () => {
  const all = [row('guk', 'a frenzied ghoul'), row('guk', 'ghoul assassin'), row('befallen', 'a frenzied ghoul'), row('befallen', 'a gnoll')]
  const zone = respawnClearPlan(all.slice(0, 2), all)
  assert.deepEqual(zone, { keys: ['a frenzied ghoul', 'ghoul assassin'], clocks: 2, elsewhere: 1 })
  const every = respawnClearPlan(all, all)
  assert.deepEqual(every, { keys: ['a frenzied ghoul', 'ghoul assassin', 'a gnoll'], clocks: 4, elsewhere: 0 })
  assert.deepEqual(respawnClearPlan([], all), { keys: [], clocks: 0, elsewhere: 0 })
})

test('the dialog states the count and the scope, and the other zones when they are affected', () => {
  const zone = respawnClearAllText({ keys: ['a', 'b'], clocks: 2, elsewhere: 1 }, 'Guk')
  assert.equal(zone.title, 'Clear all 2 clocks in Guk?')
  assert.match(zone.body, /stops watching 2 mobs/)
  assert.match(zone.body, /also stops 1 clock for the same names in other zones/)
  assert.match(zone.body, /respawn you typed comes back/)
  const every = respawnClearAllText({ keys: ['a'], clocks: 1, elsewhere: 0 }, null)
  assert.equal(every.title, 'Clear all 1 clock in all zones?')
  assert.doesNotMatch(every.body, /other zones/)
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. THE STORE: BOUNDED LIKE customSec, AND AN OLD STORE LOADS UNCHANGED
// ─────────────────────────────────────────────────────────────────────────────

test('an old store with no kept list loads exactly as it did, with no new field', () => {
  const old = { watches: [{ key: 'a gnoll', display: 'a gnoll', customSec: 60 }], autoWiki: true }
  const read = normalizeRespawnPrefs(old)
  assert.deepEqual(read, { watches: [{ key: 'a gnoll', display: 'a gnoll', customSec: 60 }] })
  assert.equal('keptCustom' in read, false)
  assert.deepEqual(normalizeRespawnPrefs(undefined), { watches: [] })
})

test('what this build writes still reads as the same watch list to a reader that knows only watches', () => {
  const written = stored(respawnWithoutWatch(PREFS, 'a frenzied ghoul'))
  // The kept list is a SIBLING of `watches`; no watch entry grew a field an older build would drop.
  assert.deepEqual(Object.keys(written).sort(), ['keptCustom', 'watches'])
  for (const w of written.watches) assert.ok(Object.keys(w).every((k) => ['key', 'display', 'customSec'].includes(k)))
})

test('kept numbers are bounded exactly as customSec is, and keys are canonical', () => {
  const read = normalizeRespawnPrefs({
    watches: [],
    keptCustom: [
      { key: 'zero', customSec: 0 },
      { key: 'negative', customSec: -5 },
      { key: 'too long', customSec: RESPAWN_CUSTOM_MAX_SEC + 1 },
      { key: 'nan', customSec: Number.NaN },
      { key: 'string', customSec: '600' },
      { key: '', customSec: 60 },
      { customSec: 60 },
      null,
      7,
      { key: '  Round Me ', customSec: 1.4 },
      { key: 'week', customSec: RESPAWN_CUSTOM_MAX_SEC },
      { key: 'x'.repeat(80), customSec: 60 }
    ]
  })
  assert.deepEqual(read.keptCustom, [
    { key: 'round me', customSec: 1 },
    { key: 'week', customSec: RESPAWN_CUSTOM_MAX_SEC },
    { key: 'x'.repeat(64), customSec: 60 }
  ])
  assert.equal('keptCustom' in normalizeRespawnPrefs({ watches: [], keptCustom: 'nope' }), false)
})

test('a duplicate keeps its later copy, a watched name loses its kept copy, and the newest survive the cap', () => {
  const dup = normalizeRespawnPrefs({
    watches: [{ key: 'a gnoll', display: 'a gnoll' }],
    keptCustom: [
      { key: 'b', customSec: 10 },
      { key: 'a gnoll', customSec: 99 },
      { key: 'c', customSec: 20 },
      { key: 'B', customSec: 11 }
    ]
  })
  assert.deepEqual(dup.keptCustom, [
    { key: 'c', customSec: 20 },
    { key: 'b', customSec: 11 }
  ])
  const many = normalizeRespawnPrefs({
    watches: [],
    keptCustom: Array.from({ length: RESPAWN_MAX_KEPT + 5 }, (_, i) => ({ key: `mob ${String(i)}`, customSec: i + 1 }))
  })
  assert.equal(many.keptCustom?.length, RESPAWN_MAX_KEPT)
  assert.equal(many.keptCustom?.[0]?.key, 'mob 5')
  assert.equal(many.keptCustom?.at(-1)?.key, `mob ${String(RESPAWN_MAX_KEPT + 4)}`)
})

test('an unwatch past the cap drops the OLDEST kept number, never the one just set aside', () => {
  const prefs: RespawnPrefs = {
    watches: [{ key: 'newest', display: 'newest', customSec: 5 }],
    keptCustom: Array.from({ length: RESPAWN_MAX_KEPT }, (_, i) => ({ key: `mob ${String(i)}`, customSec: i + 1 }))
  }
  const next = stored(respawnWithoutWatch(prefs, 'newest'))
  assert.equal(next.keptCustom?.length, RESPAWN_MAX_KEPT)
  assert.equal(next.keptCustom?.[0]?.key, 'mob 1')
  assert.deepEqual(next.keptCustom?.at(-1), { key: 'newest', customSec: 5 })
})
