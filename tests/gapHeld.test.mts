// "You're holding it" on an Items gap row (review C6; owner, 2026-10-19): the inventory export says
// where each copy was, the log's loot since it lands in the bags, its destroys come off. Fixtures only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gapHeld, heldIndex, heldLine, heldTitle } from '../src/shared/gapHeld'
import type { GapRow } from '../src/shared/gaps'
import type { OwnershipEntry, OwnershipRow } from '../src/shared/planner/ownership'
import type { LootEvent } from '../src/shared/types'
import { computeDestroyedAfter, computeHeldCountsAfter } from '../src/renderer/src/features/posky/heldCounts'

const row = (name: string, domain: GapRow['domain'] = 'item'): GapRow => ({ domain, name, kinds: ['looted'], count: 1, first: '', last: '', details: { samples: [] } })
const own = (key: string, place: OwnershipRow['place'], count: number, extra: Partial<OwnershipRow> = {}): OwnershipRow =>
  ({ key, name: key, rawName: key, place, location: '', count, section: 'Location', exaltation: false, containment: 'top', itemId: 0, line: 1, ...extra }) as OwnershipRow
const EXPORTED = '2026-10-19T12:00:00.000Z'
const AT = Date.parse(EXPORTED)

test('an item in the export is held, at any tier and any case, with its places in reading order', () => {
  const entries: OwnershipEntry[] = [['glowing stone', [own('glowing stone', 'bank', 1), own('glowing stone', 'inventory', 2, { tier: 3 })]]]
  const index = heldIndex({ entries, loadedAt: EXPORTED }, {})
  for (const name of ['Glowing Stone', 'GLOWING STONE +3', 'glowing stone +1']) {
    const held = gapHeld(row(name), index)
    assert.equal(held?.total, 3, name)
  }
  const held = gapHeld(row('Glowing Stone'), index)
  assert.ok(held)
  assert.equal(heldLine(held), 'You hold 3 (2 bags, 1 bank): screenshot it for the wiki now.')
  assert.match(heldTitle(held), /inventory export of 2026-10-19/)
})

test('one place reads as the place alone; the line is the owner example', () => {
  const index = heldIndex({ entries: [['rat ear', [own('rat ear', 'inventory', 2)]]], loadedAt: EXPORTED }, {})
  const held = gapHeld(row('Rat Ear'), index)
  assert.ok(held)
  assert.equal(heldLine(held), 'You hold 2 (bags): screenshot it for the wiki now.')
})

test('loot after the export lands in the bags; destroys after it come off the bags first', () => {
  const loot = [
    { item: 'Rat Ear +2', source: 'a rat', ts: AT - 1000 },
    { item: 'Rat Ear', source: 'a rat', ts: AT + 1000 },
    { item: 'rat ear +1', source: 'a rat', ts: AT + 2000, count: 2 },
    { item: 'Bat Wing', source: 'a bat', ts: AT + 3000, disposition: 'sold' },
    { item: 'Snake Scale', source: 'a snake', ts: AT + 4000 },
    { item: 'Snake Scale', ts: AT + 5000, disposition: 'destroyed' }
  ] as LootEvent[]
  const entries: OwnershipEntry[] = [['rat ear', [own('rat ear', 'bank', 1)]]]
  const index = heldIndex({ entries, loadedAt: EXPORTED }, computeHeldCountsAfter(loot, AT), computeDestroyedAfter(loot, AT))
  assert.equal(heldLine(gapHeld(row('Rat Ear'), index) ?? assert.fail()), 'You hold 4 (3 bags, 1 bank): screenshot it for the wiki now.')
  // Auto-sold on loot never reached the bags; looted then destroyed is gone.
  assert.equal(gapHeld(row('Bat Wing'), index), undefined)
  assert.equal(gapHeld(row('Snake Scale'), index), undefined)
})

test('no export is no claim; an exaltation row is the gem, not a copy; another domain is never held', () => {
  const loot = [{ item: 'Rat Ear', source: 'a rat', ts: 5 }] as LootEvent[]
  assert.equal(heldIndex({ entries: [], loadedAt: null }, computeHeldCountsAfter(loot, 0)).size, 0)
  const entries: OwnershipEntry[] = [['golden efreeti boots', [own('golden efreeti boots', 'equipped', 1, { exaltation: true })]]]
  const index = heldIndex({ entries, loadedAt: EXPORTED }, {})
  assert.equal(gapHeld(row('Golden Efreeti Boots'), index), undefined)
  const rats = heldIndex({ entries: [['a rat', [own('a rat', 'inventory', 1)]]], loadedAt: EXPORTED }, {})
  assert.equal(gapHeld(row('a rat', 'mob'), rats), undefined)
})
