// Factions a kill moved that the mob's wiki page does not name, and merchants the wiki lacks
// (owner asks, 2026-10-18).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { factionGaps, factionKey, withFactionRows } from '../src/shared/gapFactions'
import { gapActions, type GapRow, type GapsSnap } from '../src/shared/gaps'
import { groupGaps } from '../src/shared/gapGroups'
import { merchantPage, wikiPageText } from '../src/shared/wikiPage'

const catalog = [
  { page: 'A zol ghoul knight', name: 'a zol ghoul knight', factions: ['Undead Frogloks of Guk', 'Frogloks of Guk'] },
  { page: 'Murga', name: 'Murga', factions: ['Solusek Mining Co'] }
]

test('a kill faction no page of the mob lists is a row; spelling folds and unknown mobs are left out', () => {
  assert.equal(factionKey(' Solusek Mining Co. '), factionKey('Solusek Mining Co'))
  assert.equal(factionKey('the Ebon Mask'), factionKey('Ebon Mask'))
  const rows = factionGaps(
    [
      { mob: 'a zol ghoul knight', faction: 'Undead Frogloks of Guk', n: 4, zone: 'Lower Guk' },
      { mob: 'a zol ghoul knight', faction: 'Venril Sathir', n: 2, zone: 'Lower Guk' },
      { mob: 'Murga', faction: 'Solusek Mining Co.', n: 1, zone: '' },
      { mob: 'a mob the wiki lacks', faction: 'Anyone', n: 9, zone: '' }
    ],
    catalog
  )
  assert.deepEqual(rows.map((r) => [r.domain, r.name, r.count]), [['faction', 'Venril Sathir (a zol ghoul knight)', 2]])
  const snap: GapsSnap = { rows: [], totals: { item: 0, mob: 0, spell: 0, merchant: 0, faction: 0 }, seen: { item: 0, mob: 0, spell: 0, merchant: 0, faction: 0 }, killFactions: [{ mob: 'a zol ghoul knight', faction: 'Venril Sathir', n: 2, zone: 'Lower Guk' }] }
  assert.equal(withFactionRows(snap, catalog).totals.faction, 1)
})

test('a faction row copies the bullet for its mob page and points at that page; it groups under its mob', () => {
  const [row] = factionGaps([{ mob: 'a zol ghoul knight', faction: 'Venril Sathir', n: 2, zone: 'Lower Guk' }], catalog)
  assert.equal(wikiPageText(row, [], {}), '* [[Venril Sathir]]\n')
  const [action] = gapActions(row, 'unchecked')
  assert.equal(action.label, 'Edit mob page')
  assert.equal(action.href, 'https://eqlwiki.com/index.php?title=A_zol_ghoul_knight&action=edit')
  const shape = groupGaps([row], []).map((e) => (e.kind === 'zone' ? e.zone : e.kind === 'mob' ? `  ${e.mob}` : `    ${e.row.name}`))
  assert.deepEqual(shape, ['Lower Guk', '  a zol ghoul knight', '    Venril Sathir (a zol ghoul knight)'])
})

test('a merchant the wiki lacks copies a bare MerchantPage: name, class and zone, no items', () => {
  const text = merchantPage({ name: 'Murga', zones: ['The Feerrott'], levels: [40], points: [[-791, 173, -12]], factions: [] })
  assert.ok(text.startsWith('{{Classic Era}}\n{{MerchantPage\n\n| imagefilename     = npc_murga.png\n'), text)
  for (const line of ['| class             = [[Merchant]]\n', '| location          = (-791, 173)\n', '| items_sold = \n']) {
    assert.ok(text.includes(line), line)
  }
  assert.match(text, /\n\[\[Category:The Feerrott\]\]\n$/)
  const row: GapRow = {
    domain: 'merchant',
    name: 'Murga',
    kinds: ['quoted'],
    count: 1,
    first: '',
    last: '',
    details: { samples: [], zones: { entries: [{ name: 'The Feerrott', n: 1 }], distinct: 1 } }
  }
  assert.match(wikiPageText(row, [], {}), /\{\{MerchantPage/)
})
