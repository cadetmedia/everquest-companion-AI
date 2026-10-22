// ============================================================================
// gapsAllCharacters.test.mts — the Gaps tab across every character (owner, 2026-10-19;
// docs/community/plans/2026-10-19-gaps-all-characters.md).
// ============================================================================
//
// Each character's state is its saved snapshot plus the archive segments its SAVED log does not
// hold; the characters are then joined with the archive's merge rules, each cut to the day window.
// Nothing here reads or writes a log.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { SEGMENT_VERSION, type Segment } from '../src/shared/logArchive/segment'
import {
  characterGaps,
  cutoffOf,
  gapsSince,
  isStale,
  joinCharacters,
  nameFromId,
  otherCharacters,
  otherInputs,
  ownSince,
  parseSavedGaps,
  seenByKey,
  stampKeyOf,
  SAVED_GAPS_VERSION,
  SAVED_ROWS,
  type CharacterGaps,
  type OwnGaps,
  type SavedGaps
} from '../src/shared/gapsAllCharacters'
import type { GapRow, GapsSnap } from '../src/shared/gaps'
import { deriveGaps } from '../src/shared/gapDerive'
import type { ConMet } from '../src/shared/gapImages'
import { killIndex } from '../src/shared/kills'
import { wikiPageText } from '../src/shared/wikiPage'

const sha = (s: string): string => createHash('sha256').update(s).digest('hex')

function row(domain: GapRow['domain'], name: string, count: number, last = '2026-10-10 10:00:00'): GapRow {
  return { domain, name, kinds: ['looted'], count, first: '2026-09-01 10:00:00', last, details: { samples: [] } }
}

function gaps(rows: GapRow[]): GapsSnap {
  const totals = { item: 0, mob: 0, spell: 0, merchant: 0, faction: 0, drop: 0, image: 0 }
  for (const r of rows) totals[r.domain]++
  return { rows, totals, seen: { ...totals } }
}

const run = (ts: number) => ({ count: 1, firstTs: ts, lastTs: ts, credited: 1, lastCreditedTs: ts })
const kills = (name: string, ts: number) => ({ v: 5, mobs: { [name]: { count: 1, bestTier: 0, firstTs: ts, lastTs: ts, credited: 1, display: name, tiers: { 0: run(ts) } } } })
const loot = (item: string, ts: number) => [{ ts, item, source: 'a rat' }]

function saved(character: string, head: string, state: { gaps: unknown; loot: unknown; kills: unknown }, savedAt = '2026-10-19T12:00:00.000Z'): SavedGaps {
  return {
    v: SAVED_GAPS_VERSION,
    character,
    name: nameFromId(character).name,
    server: nameFromId(character).server,
    savedAt,
    log: { headBytes: head.length, headSha256: sha(head), firstStamp: '2026-10-01 09:00:00' },
    modules: { gaps: { seq: 1, state: state.gaps }, loot: { seq: 1, state: state.loot }, kills: { seq: 1, state: state.kills } }
  }
}

interface Seg {
  id: string
  character: string
  head: string
  last: string
  first?: string
}

function segment({ id, character, head, last, first = '2026-08-01 10:00:00' }: Seg, modules: Segment['modules']): Segment {
  return {
    v: SEGMENT_VERSION,
    id,
    character,
    state: 'sealed',
    log: { bytes: 1000, sha256: sha(id), headBytes: head.length, headSha256: sha(head), firstStamp: first, lastStamp: last },
    producedBy: { app: 'test', engine: 'test' },
    archivePath: null,
    modules
  }
}

test('a saved file round-trips through the parser; a foreign or older one is refused', () => {
  const s = saved('drywrought_oggok', 'head-D', { gaps: gaps([]), loot: [], kills: kills('rat', 1) })
  assert.deepEqual(parseSavedGaps(JSON.parse(JSON.stringify(s))), s)
  assert.equal(parseSavedGaps({ ...s, v: 99 }), null)
  assert.equal(parseSavedGaps({ ...s, modules: { gaps: s.modules.gaps } }), null)
  assert.equal(parseSavedGaps(null), null)
})

test('a character id names its character', () => {
  assert.deepEqual(nameFromId('drywrought_oggok'), { name: 'Drywrought', server: 'oggok' })
  assert.deepEqual(nameFromId('kaltinril_freeport'), { name: 'Kaltinril', server: 'freeport' })
})

test('one character: its saved snapshot with its archives, never one its saved log holds', () => {
  const live = gaps([row('item', 'Bat Wing', 2)])
  const s = saved('drywrought_oggok', 'head-D', { gaps: live, loot: loot('Bat Wing', 2000), kills: kills('rat', 2000) })
  const older = segment({ id: 'd-old', character: 'drywrought_oggok', head: 'head-old', last: '2026-09-15 10:00:00' }, {
    gaps: { seq: 1, state: gaps([row('item', 'Bat Wing', 3), row('item', 'Rat Ear', 1)]) },
    loot: { seq: 1, state: loot('Rat Ear', 1000) },
    kills: { seq: 1, state: kills('rat', 1000) }
  })
  // The saved log begins with this segment's head: the snapshot already holds those lines.
  const held = segment({ id: 'd-held', character: 'drywrought_oggok', head: 'head-D', last: '2026-09-20 10:00:00' }, { gaps: { seq: 1, state: gaps([row('item', 'Bat Wing', 50)]) } })
  const other = segment({ id: 'k-1', character: 'kaltinril_freeport', head: 'head-K', last: '2026-09-15 10:00:00' }, { gaps: { seq: 1, state: gaps([row('item', 'Cloth Cap', 1)]) } })
  const c = characterGaps('drywrought_oggok', s, [older, held, other], null)
  assert.ok(c !== null)
  assert.equal(c.archives, 1)
  const rows = (c.gaps as GapsSnap).rows
  assert.deepEqual(rows.map((r) => [r.name, r.count]), [['Bat Wing', 5], ['Rat Ear', 1]])
  assert.equal((c.loot as unknown[]).length, 2)
  assert.equal((c.kills as { mobs: Record<string, { count: number }> }).mobs.rat.count, 2)
})

test('an archive that ended before the window is left out whole', () => {
  const s = saved('drywrought_oggok', 'head-D', { gaps: gaps([row('item', 'Bat Wing', 2)]), loot: [], kills: kills('rat', 1) })
  const old = segment({ id: 'd-old', character: 'drywrought_oggok', head: 'head-old', last: '2026-07-01 10:00:00' }, { gaps: { seq: 1, state: gaps([row('item', 'Rat Ear', 1)]) } })
  const c = characterGaps('drywrought_oggok', s, [old], '2026-08-20 00:00:00')
  assert.equal(c?.archives, 0)
  assert.deepEqual((c?.gaps as GapsSnap).rows.map((r) => r.name), ['Bat Wing'])
})

test('a character known only by its archives is its archives alone; one with neither is nothing', () => {
  const a = segment({ id: 'x-1', character: 'xan_oggok', head: 'head-1', last: '2026-09-01 10:00:00' }, { gaps: { seq: 1, state: gaps([row('mob', 'a gnoll', 1)]) } })
  const b = segment({ id: 'x-2', character: 'xan_oggok', head: 'head-2', last: '2026-09-10 10:00:00', first: '2026-09-05 10:00:00' }, { gaps: { seq: 1, state: gaps([row('mob', 'a gnoll', 2)]) } })
  const c = characterGaps('xan_oggok', null, [a, b], null)
  assert.equal(c?.savedAt, null)
  assert.equal(c?.name, 'Xan')
  assert.deepEqual((c?.gaps as GapsSnap).rows.map((r) => [r.name, r.count]), [['a gnoll', 3]])
  assert.equal(characterGaps('nobody_oggok', null, [a], null), null)
})

test('the other characters are every saved or archived one but the attached', () => {
  const s = saved('drywrought_oggok', 'h', { gaps: gaps([]), loot: [], kills: kills('rat', 1) })
  const seg = segment({ id: 'x', character: 'xan_oggok', head: 'h2', last: '2026-09-01 10:00:00' }, {})
  const mine = segment({ id: 'k', character: 'kaltinril_freeport', head: 'h3', last: '2026-09-01 10:00:00' }, {})
  assert.deepEqual(otherCharacters([s], [seg, mine], 'kaltinril_freeport'), ['drywrought_oggok', 'xan_oggok'])
})

test('the join: rows add up across characters and each row names who saw it', () => {
  const k = { label: 'Kaltinril', gaps: gaps([row('item', 'Bat Wing', 1), row('mob', 'a gnoll', 1)]), loot: loot('Bat Wing', 3000), kills: kills('gnoll', 3000) }
  const d = { label: 'Drywrought', gaps: gaps([row('item', 'bat wing', 4)]), loot: loot('Bat Wing', 1000), kills: kills('gnoll', 1000) }
  const j = joinCharacters([k, d], null)
  assert.deepEqual(j.gaps?.rows.map((r) => [r.domain, r.name, r.count]), [['item', 'Bat Wing', 5], ['mob', 'a gnoll', 1]])
  assert.deepEqual(j.seenBy.get(seenByKey({ domain: 'item', name: 'Bat Wing' })), ['Kaltinril', 'Drywrought'])
  assert.deepEqual(j.seenBy.get(seenByKey({ domain: 'mob', name: 'a gnoll' })), ['Kaltinril'])
  assert.deepEqual(j.loot.map((e) => e.ts), [1000, 3000], 'loot back in time order')
  assert.equal(j.kills?.mobs.gnoll.count, 2)
})

test("the join cuts every character's rows to the window; loot and kills join whole", () => {
  const cut = { stamp: '2026-10-01 00:00:00', ms: 2000 }
  const k = { label: 'K', gaps: gaps([row('item', 'New', 1, '2026-10-05 00:00:00'), row('item', 'Old', 1, '2026-09-05 00:00:00')]), loot: [...loot('New', 3000), ...loot('Old', 1000)], kills: kills('rat', 1000) }
  const j = joinCharacters([k], cut)
  assert.deepEqual(j.gaps?.rows.map((r) => r.name), ['New'])
  assert.equal(j.gaps?.totals.item, 1)
  assert.deepEqual(j.loot.map((e) => e.item), ['New', 'Old'])
  assert.deepEqual(Object.keys(j.kills?.mobs ?? {}), ['rat'])
})

test('a kills shape from another build is not joined, and nothing is counted twice', () => {
  const k = { label: 'K', gaps: null, loot: [], kills: kills('rat', 1) }
  const old = { label: 'D', gaps: null, loot: [], kills: { ...kills('rat', 2), v: 4 } }
  assert.equal(joinCharacters([k, old], null).kills?.mobs.rat.count, 1)
})

test("another character's mob row the catalog now knows is dropped", () => {
  const o: CharacterGaps = { character: 'd_o', name: 'D', server: 'o', savedAt: null, archives: 0, gaps: gaps([row('mob', 'a rat', 1), row('mob', 'a zork', 1)]), loot: [], kills: null }
  const [inp] = otherInputs([o], (n) => n === 'a rat')
  assert.deepEqual((inp.gaps as GapsSnap).rows.map((r) => r.name), ['a zork'])
})

test('two characters of one name are told apart by server', () => {
  const one = (server: string): CharacterGaps => ({ character: `d_${server}`, name: 'D', server, savedAt: null, archives: 0, gaps: null, loot: [], kills: null })
  assert.deepEqual(otherInputs([one('oggok'), one('freeport')], () => false).map((i) => i.label), ['D (oggok)', 'D (freeport)'])
})

test('the window and the stale flag', () => {
  const now = new Date(2026, 9, 19, 17, 30, 0)
  assert.equal(stampKeyOf(now), '2026-10-19 17:30:00')
  assert.equal(cutoffOf(60, now).stamp, '2026-08-20 17:30:00')
  assert.equal(isStale('2026-08-18T00:00:00.000Z', now), true)
  assert.equal(isStale('2026-08-20T12:00:00.000Z', now), false)
  const g = gaps([row('item', 'A', 1, '2026-10-01 00:00:00')])
  assert.equal(gapsSince(g, '2026-09-01 00:00:00'), g, 'nothing cut: the same object')
})

test('days back trims the one-character view the way the join trims each character (owner, 2026-10-21)', () => {
  const cut = { stamp: '2026-10-01 00:00:00', ms: 2000 }
  const own = { gaps: gaps([row('item', 'New', 1, '2026-10-05 00:00:00'), row('mob', 'an old rat', 1, '2026-09-05 00:00:00')]), loot: [...loot('New', 3000), ...loot('Old', 1000)], kills: kills('rat', 1000) }
  const cutOwn = ownSince(own, cut)
  assert.deepEqual(cutOwn.gaps.rows.map((r) => r.name), ['New'])
  assert.equal(cutOwn.gaps.totals.mob, 0)
  // Loot and kills stay whole: the rows derived from them are cut once built (see the rate test).
  assert.equal(cutOwn.loot, own.loot)
  assert.equal(cutOwn.kills, own.kills)
  // The same rows the join keeps for the attached character alone.
  assert.deepEqual(joinCharacters([{ label: 'K', ...own }], cut).gaps?.rows.map((r) => r.name), ['New'])
  // Nothing older than the cut: the rows are the same object, and no kills is no kills.
  const fresh = { gaps: gaps([row('item', 'New', 1, '2026-10-05 00:00:00')]), loot: [], kills: null }
  assert.equal(ownSince(fresh, cut).gaps, fresh.gaps)
  assert.equal(ownSince(fresh, cut).kills, null)
})

test('a save from before forage rows says so; the join keeps a forage row from a save that has them (owner report, 2026-10-21)', () => {
  // Drywrought saved by an older build: no rows marker, and its rows can hold no forage proof.
  const before = saved('drywrought_oggok', 'HEAD-D', { gaps: gaps([row('item', 'Gray Wolf Skull', 1)]), loot: [], kills: null })
  assert.equal(characterGaps('drywrought_oggok', before, [], null)?.olderRows, true)
  // The same character saved by this build: the marker is current, nothing to say.
  const forage = { ...row('item', 'Pod of Water', 3), domain: 'forage' as GapRow['domain'] }
  const after: SavedGaps = { ...saved('drywrought_oggok', 'HEAD-D', { gaps: { ...gaps([row('item', 'Gray Wolf Skull', 1)]), rows: [row('item', 'Gray Wolf Skull', 1), forage] }, loot: [], kills: null }), rows: SAVED_ROWS }
  const other = characterGaps('drywrought_oggok', after, [], null)
  assert.equal(other?.olderRows, undefined)
  // Another character live (Kaltinril, no forages), Drywrought's saved forage row joined in, seen by Drywrought.
  const live = { label: 'Kaltinril', gaps: gaps([row('item', 'Bone Chips', 1)]), loot: [], kills: null }
  const joined = joinCharacters([live, ...otherInputs(other === null ? [] : [other], () => false)], null)
  const pod = joined.gaps?.rows.find((r) => r.name === 'Pod of Water')
  assert.equal(pod?.domain, 'forage')
  // Seen by is looked up under the Items row the forage row becomes (withForageRows, gaps-item-facts).
  assert.deepEqual(joined.seenBy.get(seenByKey({ domain: 'item', name: 'Pod of Water' })), ['Drywrought'])
})

// Days back chooses rows only; the derived rows read whole loot and kills, then the window cuts them (useGapsData).
const DAY = 86_400_000
const NOW = new Date(2026, 9, 21, 12, 0, 0)
const CUT = cutoffOf(60, NOW)
const noRows = (): GapsSnap => ({ rows: [], totals: { item: 0, mob: 0, spell: 0, merchant: 0 }, seen: {} })
const shownWith = (own: OwnGaps, cons: ConMet[], catalog: readonly Record<string, unknown>[]): GapsSnap => {
  const cut = ownSince(own, CUT)
  return gapsSince(deriveGaps(cut.gaps, { loot: cut.loot, kills: cut.kills?.mobs ?? {}, cons }, { catalog: catalog as never, groups: {}, aliases: {} }), CUT.stamp)
}

test("days back keeps a drop's rate whole: corpses over kills of the whole log, never the window's drops over all kills", () => {
  // 20 kills of a skeleton, 10 at 90 days back and 10 at 10 days back; every corpse dropped Bone Chips.
  const old = NOW.getTime() - 90 * DAY
  const recent = NOW.getTime() - 10 * DAY
  const lootOf = (from: number) => Array.from({ length: 10 }, (_, i) => ({ ts: from + i * 60_000, item: 'Bone Chips', source: 'a skeleton', zone: 'Befallen' }))
  const loot = [...lootOf(old), ...lootOf(recent)]
  const last = recent + 9 * 60_000
  const kills = { v: 5, mobs: { 'a skeleton': { display: 'a skeleton', count: 20, bestTier: -1, firstTs: old, lastTs: last, credited: 20, tiers: { '-1': { count: 20, firstTs: old, lastTs: last } } } } }
  const own: OwnGaps = { gaps: noRows(), loot, kills: kills as never }
  const row = shownWith(own, [], [{ name: 'a skeleton', page: 'A skeleton', drops: ['Rusty Dagger'], zones: ['Befallen'] }]).rows.find((r) => r.domain === 'drop')
  assert.equal(row?.count, 20)
  assert.match(wikiPageText(row!, ownSince(own, CUT).loot, killIndex(kills.mobs as never)), /\[Overall: ~100%\]/)
})

test('days back leaves out a Factions row and an Images row the log last met before the window', () => {
  const old = NOW.getTime() - 200 * DAY
  const kills = { v: 5, mobs: { 'a gnoll': { display: 'a gnoll', count: 3, bestTier: -1, firstTs: old, lastTs: old, credited: 3, tiers: {} } } }
  const engine = { ...noRows(), killFactions: [{ mob: 'a gnoll', faction: 'Sabertooths of Blackburrow', n: 3, zone: 'Blackburrow', adjust: -5, raised: false }] }
  const catalog = [{ name: 'a gnoll', page: 'A gnoll', zones: ['Blackburrow'], factions: [] }, { name: 'a kobold', page: 'A kobold', zones: ['Blackburrow'], noImage: true }]
  const own: OwnGaps = { gaps: engine as never, loot: [], kills: kills as never }
  const conOld: ConMet = { mob: 'a kobold', zone: 'Blackburrow', cons: 2, ts: old }
  const domainsOf = (cons: ConMet[], cut: boolean): string[] => (cut ? shownWith(own, cons, catalog) : deriveGaps(engine as never, { loot: [], kills: kills.mobs as never, cons }, { catalog: catalog as never, groups: {}, aliases: {} })).rows.map((r) => `${r.domain}:${r.name}`)
  // Without a window both rows stand; with it, neither was met since.
  assert.deepEqual(domainsOf([conOld], false).map((d) => d.split(':')[0]), ['faction', 'image'])
  assert.deepEqual(domainsOf([conOld], true), [])
  // Met again inside the window, the image row is back.
  assert.deepEqual(domainsOf([{ ...conOld, ts: NOW.getTime() - DAY }], true), ['image:a kobold'])
})
