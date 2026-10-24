// eozCompare + deltaSkip + revIndex: the wiki's GitHub data pack is a check on our data, never a
// source of it, and the delta skips only a page whose newest revision we provably hold (owner,
// 2026-10-23). Fixtures only; nothing here reaches the network.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareFamily, comparePack, packRevisions, releaseDecision, wikiTitle, type OurFamily, type Pack } from '../scripts/sources/eozCompare'
import { unchangedPages, readRevisions } from '../scripts/sources/deltaSkip'
import { emptyFeed, foldRcRow } from '../scripts/sources/deltaPages'
import { recordRevs, seedRevs, sha1Hex, type RevIndex } from '../scripts/sources/revIndex'

const PACK_AT = '2026-10-23T00:25:44+00:00'

function mobs(stamp: string, revs: Record<string, number> = {}): OurFamily {
  return {
    stamp,
    pages: new Map([
      ['A cracked skeleton', { level: '5', zones: ['Lake Nerius'] }],
      ['Dorian G`Wyn', { level: '40 - 45', zones: ['Lake Nerius'] }],
      ['Only ours', { level: '1' }]
    ]),
    pageids: new Map([['A cracked skeleton', 10], ['Dorian G`Wyn', 11], ['Only ours', 12], ['Listed but dropped', 13]]),
    revs
  }
}

const npc = (wikiTitle: string, revisionId: number, more: { levelMin?: number; levelMax?: number; zone?: string } = {}) => ({ wikiTitle, revisionId, levelMin: 5, levelMax: 5, zone: 'Lake Nerius', ...more })

test('a page behind the wiki says which revision we hold and which the wiki has', () => {
  const r = compareFamily('mobs', [npc('A_cracked_skeleton', 900), npc('Dorian G`Wyn', 500, { levelMin: 40, levelMax: 45 })], mobs('2026-10-23T11:30:09Z', { 10: 800, 11: 500 }), { packBuilt: PACK_AT, diffs: () => [] })
  assert.deepEqual(r.stale, [{ title: 'A cracked skeleton', ours: 800, wiki: 900 }])
  assert.deepEqual(r.unknown, [])
})

test('with no recorded revision, a stamp after the pack means current; before it means unknown', () => {
  const rows = [npc('A cracked skeleton', 900)]
  assert.deepEqual(compareFamily('mobs', rows, mobs('2026-10-23T11:30:09Z'), { packBuilt: PACK_AT, diffs: () => [] }).unknown, [])
  assert.deepEqual(compareFamily('mobs', rows, mobs('2026-10-22T11:30:09Z'), { packBuilt: PACK_AT, diffs: () => [] }).unknown, ['A cracked skeleton'])
})

test('missing pages are split into never listed and listed-but-not-kept; ours-only pages are extra', () => {
  const r = compareFamily('mobs', [npc('Listed but dropped', 1), npc('Brand new page', 2), npc('A cracked skeleton', 3)], mobs('2026-10-23T11:30:09Z'), { packBuilt: PACK_AT, diffs: () => [] })
  assert.deepEqual(r.missingListed, ['Listed but dropped'])
  assert.deepEqual(r.missingUnlisted, ['Brand new page'])
  assert.deepEqual(r.extra, ['Dorian G`Wyn', 'Only ours'])
})

test('at the same revision, level, zone, class, slot and AC disagreements are reported, never changed', () => {
  const pack: Pack = {
    meta: { generatedAt: PACK_AT, version: 'v' },
    npcs: [npc('A cracked skeleton', 3, { levelMin: 6, levelMax: 6 }), npc('Dorian G`Wyn', 4, { levelMin: 40, levelMax: 45, zone: 'Nektropos Castle' })],
    items: [{ wikiTitle: 'Arch Mage\'s Pantaloons', revisionId: 9, classes: ['MAG'], slots: ['LEGS'], stats: { AC: 8 } }]
  }
  const items: OurFamily = {
    stamp: '2026-10-23T11:30:09Z',
    pages: new Map([['Arch Mage\'s Pantaloons', { classes: ['MAG', 'WIZ'], slot: 'LEGS', ac: 7 }]]),
    pageids: new Map(),
    revs: {}
  }
  const r = comparePack(pack, items, mobs('2026-10-23T11:30:09Z'))
  assert.deepEqual(r.mobs.fieldDiffs.map((d) => [d.title, d.field, d.pack]), [['A cracked skeleton', 'level', '6-6'], ['Dorian G`Wyn', 'zone', 'Nektropos Castle']])
  assert.deepEqual(r.items.fieldDiffs.map((d) => d.field), ['classes', 'ac'])
  assert.deepEqual(r.unchecked, ['quests', 'spells'])
})

test('the release rule: a pack built within 5 hours stands in for the delta', () => {
  assert.equal(releaseDecision(PACK_AT, '2026-10-23T05:00:00Z').deltaNeeded, false)
  assert.equal(releaseDecision(PACK_AT, '2026-10-23T05:30:00Z').deltaNeeded, true)
  assert.equal(releaseDecision(PACK_AT, '2026-10-22T23:00:00Z').deltaNeeded, true, 'a pack from the future is not trusted')
  assert.equal(wikiTitle('a_nektulos_spiderling'), 'A nektulos spiderling')
  assert.deepEqual(packRevisions([npc('A cracked skeleton', 7), npc('Nowhere', 8)], mobs('x').pageids), [[10, 7]])
})

test('seeding: only when our stamp is after the pack, only pages without an entry, marked seeded', () => {
  const idx: RevIndex = { revs: { 10: 800 } }
  assert.equal(seedRevs(idx, [[10, 700], [11, 500]], '2026-10-22T00:00:00Z', PACK_AT), 0, 'our data is older than the pack')
  assert.equal(seedRevs(idx, [[10, 700], [11, 500]], '2026-10-23T11:30:09Z', PACK_AT), 1)
  assert.deepEqual(idx, { revs: { 10: 800, 11: 500 }, seeded: [11] })
  // A real read replaces a seed and clears its mark; a gone page leaves the index.
  recordRevs(idx, [[11, 650]], [10])
  assert.deepEqual(idx, { revs: { 11: 650 }, seeded: [] })
})

test('the delta skips a changed page only when we hold its newest revision, never a moved or logged one', () => {
  const feed = emptyFeed()
  const text = 'held text'
  foldRcRow({ type: 'edit', title: 'Same Rev', pageid: 1, revid: 101, sha1: 'x', timestamp: '2026-10-23T12:00:00Z' }, feed)
  foldRcRow({ type: 'edit', title: 'Same Text', pageid: 2, revid: 202, sha1: sha1Hex(text), timestamp: '2026-10-23T12:00:00Z' }, feed)
  foldRcRow({ type: 'edit', title: 'Changed', pageid: 3, revid: 303, sha1: 'y', timestamp: '2026-10-23T12:00:00Z' }, feed)
  foldRcRow({ type: 'edit', title: 'New Name', pageid: 4, revid: 404, sha1: sha1Hex(text), timestamp: '2026-10-23T12:00:00Z' }, feed)
  foldRcRow({ type: 'edit', title: 'Logged', pageid: 5, revid: 505, sha1: sha1Hex(text), timestamp: '2026-10-23T12:00:00Z' }, feed)
  foldRcRow({ type: 'log', title: 'Logged', logtype: 'move', timestamp: '2026-10-23T12:01:00Z' }, feed)
  foldRcRow({ type: 'edit', title: 'No Sha', pageid: 6, revid: 606, timestamp: '2026-10-23T12:00:00Z' }, feed)
  const held = new Map([
    [1, { title: 'Same Rev', rev: 101 }],
    [2, { title: 'Same Text', text: () => text }],
    [3, { title: 'Changed', rev: 300, text: () => text }],
    [4, { title: 'Old Name', text: () => text }],
    [5, { title: 'Logged', text: () => text }],
    [6, { title: 'No Sha', text: () => text }]
  ])
  const proven = unchangedPages([1, 2, 3, 4, 5, 6, 7], feed, (id) => held.get(id))
  assert.deepEqual([...proven], [[1, 101], [2, 202]])
  assert.deepEqual([...readRevisions({ pageids: new Map([['A', 1]]), revids: new Map([['A', 9], ['B', 8]]) })], [[1, 9]])
})

test('an older row of a page never leaves its revision or sha1 behind a newer one', () => {
  const feed = emptyFeed()
  foldRcRow({ type: 'edit', title: 'P', pageid: 1, revid: 2, sha1: 'new', timestamp: '2026-10-23T12:00:00Z' }, feed)
  foldRcRow({ type: 'edit', title: 'P', pageid: 1, revid: 1, sha1: 'old', timestamp: '2026-10-23T11:00:00Z' }, feed)
  assert.equal(feed.pageRev.get(1), 2)
  assert.equal(feed.pageSha1.get(1), 'new')
})

test('the cross-check folds what is one fact spelled two ways: slot lists, ALL except, zone spellings, Various', () => {
  const pack: Pack = {
    meta: { generatedAt: PACK_AT },
    npcs: [
      npc('A cracked skeleton', 3, { zone: 'Burning Wood' }),
      npc('Dorian G`Wyn', 4, { levelMin: 40, levelMax: 45, zone: 'Greater Faydark / Kelethin' })
    ],
    items: [
      { wikiTitle: 'A Broom', revisionId: 1, slots: ['PRIMARY', 'SECONDARY'], classes: ['WAR', 'RNG', 'SHD', 'BRD', 'ROG', 'NEC', 'WIZ', 'MAG', 'ENC', 'BST', 'BER'] },
      { wikiTitle: 'Odd Item', revisionId: 2, slots: ['EAR'], classes: ['WAR'] }
    ]
  }
  const items: OurFamily = {
    stamp: '2026-10-23T11:30:09Z',
    pages: new Map([
      ['A Broom', { slot: 'PRIMARY SECONDARY', classes: ['ALL except CLR PAL DRU MNK SHM'] }],
      ['Odd Item', { slot: 'NECK', classes: ['ALL'] }]
    ]),
    pageids: new Map(),
    revs: {}
  }
  const ourMobs = mobs('2026-10-23T11:30:09Z')
  ourMobs.pages.set('A cracked skeleton', { level: '5', zones: ['Burning Woods'] })
  ourMobs.pages.set('Dorian G`Wyn', { level: '40 - 45', zones: ['Various'] })
  const r = comparePack(pack, items, ourMobs)
  assert.deepEqual(r.mobs.fieldDiffs, [])
  assert.deepEqual(r.items.fieldDiffs.map((d) => [d.title, d.field]), [['Odd Item', 'classes'], ['Odd Item', 'slot']])
})
