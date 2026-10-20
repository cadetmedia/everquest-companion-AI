// Factions a kill moved that the mob's wiki page does not name, and merchants the wiki lacks
// (owner asks, 2026-10-18).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { factionFix, factionGaps, factionKey, withFactionRows } from '../src/shared/gapFactions'
import { gapActions, logSaysText, pageSaysText, type GapRow, type GapsSnap } from '../src/shared/gaps'
import { groupGaps } from '../src/shared/gapGroups'
import { merchantPage, wikiPageText } from '../src/shared/wikiPage'

const catalog = [
  { page: 'A zol ghoul knight', name: 'a zol ghoul knight', factions: ['Undead Frogloks of Guk', 'Frogloks of Guk'] },
  { page: 'Murga', name: 'Murga', factions: ['Solusek Mining Co'] }
]

test('a kill faction no page of the mob lists is a row; spelling folds; a mob the data lacks keeps its faction rows', () => {
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
  // A mob the data lacks (its page newer than the scrape, owner 2026-10-20) keeps its lines to copy.
  assert.deepEqual(rows.map((r) => [r.domain, r.name, r.count]), [
    ['faction', 'Anyone (a mob the wiki lacks)', 9],
    ['faction', 'Venril Sathir (a zol ghoul knight)', 2]
  ])
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

test('the details of a faction row carry the log lines that prove it: the faction line then the kill line (owner, 2026-10-20)', () => {
  const proof = [
    '[Mon Oct 19 23:56:47 2026] Your faction standing with Grobb Merchants has been adjusted by 1.',
    '[Mon Oct 19 23:56:47 2026] You have slain a troll slayer!'
  ]
  const trolls = [{ page: 'A troll slayer', name: 'a troll slayer', factions: ['Da Bashers'] }]
  const [row] = factionGaps([{ mob: 'a troll slayer', faction: 'Grobb Merchants', n: 1, zone: 'Grobb', samples: proof }], trolls)
  assert.equal(row.name, 'Grobb Merchants (a troll slayer)')
  assert.deepEqual(row.details.samples, proof)
  const [bare] = factionGaps([{ mob: 'a troll slayer', faction: 'Grobb Merchants', n: 1, zone: 'Grobb' }], trolls)
  assert.deepEqual(bare.details.samples, [], 'an older engine serves none')
})

test('a merchant the wiki lacks copies a bare MerchantPage: name, class and zone, no items', () => {
  const text = merchantPage({ name: 'Murga', zones: ['The Feerrott'], levels: [40], points: [[-791, 173, -12]], factions: [], credited: 0, specials: [] })
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

test('a listed faction whose amount or side the log contradicts is a fix row; a capped line only checks the side', () => {
  // A Troll Slayer's page: Da Bashers (-10) to (-30) (unconfirmed), Broken Skull Clan (10).
  const cat = [{ page: 'A Troll Slayer', name: 'a troll slayer', factions: ['Da Bashers', 'Broken Skull Clan', 'Grobb Merchants', 'Ogguk Residents'], factionAmounts: ['-30..-10?', '10', '-100', '-50'] }]
  const pair = (faction: string, extra: object) => ({ mob: 'a troll slayer', faction, n: 1, zone: 'Innothule Swamp', ...extra })
  const rows = factionGaps(
    [
      pair('DaBashers', { adjust: -200, raised: false }),
      pair('Broken Skull Clan', { adjust: 30, raised: true }),
      pair('Grobb Merchants', { adjust: -100, raised: false }),
      // At min standing: no amount, side agrees: nothing to fix.
      pair('Ogguk Residents', { raised: false })
    ],
    cat
  )
  assert.deepEqual(
    rows.map((r) => [r.name, r.fix, r.pageSays]),
    [
      ['Broken Skull Clan (a troll slayer)', 'amount', '10'],
      ['DaBashers (a troll slayer)', 'amount', '-30..-10?']
    ]
  )
  assert.equal(pageSaysText('-30..-10?'), '(-10) to (-30) (unconfirmed)')
  assert.equal(logSaysText({ adjust: -200 }), '(-200)')
  const chip = gapActions(rows[1] ?? assert.fail(), 'unchecked')[0]
  assert.equal(chip?.label, 'Fix on mob page')
  assert.match(chip?.why ?? '', /lists this faction as \(-10\) to \(-30\) \(unconfirmed\); your log: \(-200\)/)
})

test('a capped line on the other side is a side fix; a guess the log matches is a confirm; no data is no fix', () => {
  assert.deepEqual(factionFix(['-50'], { raised: true }), { fix: 'side', pageSays: '-50' })
  assert.deepEqual(factionFix(['-10?'], { adjust: -10, raised: false }), { fix: 'confirm', pageSays: '-10?' })
  assert.equal(factionFix(['-30', '-10'], { adjust: -10, raised: false }), null, 'any page agreeing is enough')
  assert.equal(factionFix([], { adjust: -10 }), null)
  assert.deepEqual(factionFix(['-'], { adjust: -10, raised: false }), { fix: 'amount', pageSays: '-' })
})
