// The Gaps tab's narrowing and copy text, from the engine's rows (src/shared/gaps.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  charactersOff,
  derivedPrices,
  gapActions,
  parserShape,
  wikiSearchUrl,
  formatCoin,
  gapDetailsText,
  gapsAsText,
  gapsCaption,
  tallyText,
  visibleGaps,
  sortGaps,
  firstGapSortDir,
  DEFAULT_GAP_SORT,
  type GapDetails,
  type GapRow,
  type GapsSnap
} from '../src/shared/gaps'

type Where = [domain: GapRow['domain'], name: string, kinds: GapRow['kinds'], count: number]
const row = ([domain, name, kinds, count]: Where, details: Partial<GapDetails> = {}): GapRow => ({
  domain,
  name,
  kinds,
  count,
  first: '2026-10-06 18:12:26',
  last: '2026-10-10 17:48:36',
  details: { samples: [], ...details }
})

const ROWS: GapRow[] = [
  row(['item', 'Wooden Heart', ['looted'], 11], {
    zones: { entries: [{ name: 'The Southern Plains of Karana', n: 11 }], distinct: 1 },
    sources: { entries: [{ name: 'a treant', n: 11 }], distinct: 1 },
    dispositions: { entries: [{ name: 'sold', n: 9 }], distinct: 1 },
    samples: ['[Sat Oct 10 17:48:36 2026] You looted a Wooden Heart from a treant\'s corpse and sold it for free.']
  }),
  row(['item', 'Envenomed Bolt', ['crafted'], 2]),
  row(['mob', 'a fire giant warrior', ['killed', 'dropped-by'], 93], {
    drops: {
      entries: [
        { name: 'Throwing Boulder +4', n: 16 },
        { name: 'Fire Giant Toes', n: 9 }
      ],
      distinct: 13
    },
    killers: { entries: [{ name: 'you', n: 9 }], distinct: 1 }
  }),
  row(['mob', 'Cazic-Thule', ['considered', 'killed'], 20]),
  row(['spell', 'Heroic Leap', ['cast'], 958], { casters: { entries: [{ name: 'you', n: 958 }], distinct: 1 } })
]

test('visibleGaps keeps one domain in the served order and matches the query against name and kinds', () => {
  assert.deepEqual(
    visibleGaps(ROWS, 'mob', '').map((r) => r.name),
    ['a fire giant warrior', 'Cazic-Thule']
  )
  assert.deepEqual(
    visibleGaps(ROWS, 'mob', 'CAZIC').map((r) => r.name),
    ['Cazic-Thule']
  )
  assert.deepEqual(
    visibleGaps(ROWS, 'item', ' craft ').map((r) => r.name),
    ['Envenomed Bolt']
  )
  assert.deepEqual(visibleGaps(ROWS, 'spell', 'wooden'), [])
})

test('tallyText names the entries with counts and says how many a capped list left out', () => {
  assert.equal(tallyText({ entries: [{ name: 'a treant', n: 11 }], distinct: 1 }), 'a treant (11)')
  assert.equal(
    tallyText({ entries: [{ name: 'Throwing Boulder +4', n: 16 }, { name: 'Fire Giant Toes', n: 9 }], distinct: 13 }),
    'Throwing Boulder +4 (16), Fire Giant Toes (9) +11 more'
  )
})

test('gapDetailsText is the row line, then only the lists it has, then its samples, each indented', () => {
  assert.equal(
    gapDetailsText(ROWS[0]),
    [
      'Wooden Heart\tlooted\t11\t2026-10-06 18:12:26\t2026-10-10 17:48:36',
      '\taction: Check wiki',
      '\tzones: The Southern Plains of Karana (11)',
      '\tfrom: a treant (11)',
      '\tdisposed: sold (9)',
      "\tsample: [Sat Oct 10 17:48:36 2026] You looted a Wooden Heart from a treant's corpse and sold it for free."
    ].join('\n')
  )
  assert.equal(
    gapDetailsText(ROWS[2], 'hasPage'),
    [
      'a fire giant warrior\tkilled, dropped-by\t93\t2026-10-06 18:12:26\t2026-10-10 17:48:36',
      '\taction: Re-scrape',
      '\tdropped: Throwing Boulder +4 (16), Fire Giant Toes (9) +11 more',
      '\tkilled by: you (9)'
    ].join('\n')
  )
  assert.equal(
    gapDetailsText(ROWS[1]),
    ['Envenomed Bolt\tcrafted\t2\t2026-10-06 18:12:26\t2026-10-10 17:48:36', '\taction: Check wiki'].join('\n')
  )
})

test('gapActions says what to do: one chip for the verdict or the suggestion, plus Fix parser for a leftover shape', () => {
  const plain = row(['item', 'Wooden Heart', ['looted'], 11])
  assert.deepEqual(
    gapActions(plain, 'unchecked').map((a) => [a.kind, a.label, a.href]),
    [['checkWiki', 'Check wiki', 'https://eqlwiki.com/index.php?search=Wooden%20Heart']]
  )
  assert.deepEqual(gapActions(plain, 'noPage').map((a) => [a.kind, a.href]), [['addToWiki', undefined]])
  assert.deepEqual(gapActions(plain, 'hasPage').map((a) => [a.kind, a.href]), [['rescrape', undefined]])
  const suggested = row(['item', 'Teir`Dal Arcane Insignia', ['looted'], 107])
  suggested.suggest = { name: "Tier'Dal Arcane Insignia", page: "Tier'Dal Arcane Insignia", distance: 1 }
  const fix = gapActions(suggested, 'noPage')
  assert.deepEqual(fix.map((a) => a.kind), ['fixTitle'], 'the suggestion outranks the verdict')
  assert.equal(fix[0].href, "https://eqlwiki.com/Tier'Dal_Arcane_Insignia")
  assert.match(fix[0].why, /Tier'Dal Arcane Insignia/)
  for (const name of ['Efreeti Belt from Reward Chest', 'Spell: Invisibility vs. Undead', 'Shiny Thing*']) {
    const acts = gapActions(row(['item', name, ['looted'], 1]), 'unchecked')
    assert.deepEqual(acts.map((a) => a.kind), ['checkWiki', 'fixParser'], name)
    assert.ok(acts[1].why.includes(parserShape(name) ?? '!'), name)
  }
  assert.equal(parserShape('Wooden Heart'), null)
  assert.equal(wikiSearchUrl(" Lyssa's Horn "), "https://eqlwiki.com/index.php?search=Lyssa's%20Horn")
})

test('the sale-on-loot and paid lists print with the discount caveat in the word', () => {
  const sold = row(['item', 'Spider Legs', ['looted', 'bought'], 3], {
    sales: { entries: [{ name: '7 copper', n: 2 }], distinct: 1 },
    salesCopper: 14,
    paid: { entries: [{ name: '5 platinum 2 gold', n: 1 }], distinct: 1 },
    paidCopper: 5200
  })
  assert.equal(
    gapDetailsText(sold),
    [
      'Spider Legs\tlooted, bought\t3\t2026-10-06 18:12:26\t2026-10-10 17:48:36',
      '\taction: Check wiki',
      '\tsold on loot (discounted): 7 copper (2)',
      '\tvendor value: 1 silver · base price: 1 silver',
      '\tpaid: 5 platinum 2 gold (1)'
    ].join('\n')
  )
})

test('a near-miss suggestion is the second line of the copy text, after the row line', () => {
  const r = row(['item', 'Teir`Dal Arcane Insignia', ['looted'], 107], {
    sources: { entries: [{ name: 'a Teir`Dal rogue', n: 107 }], distinct: 1 }
  })
  r.suggest = { name: "Tier'Dal Arcane Insignia", page: "Tier'Dal Arcane Insignia", distance: 1 }
  assert.equal(
    gapDetailsText(r),
    [
      'Teir`Dal Arcane Insignia\tlooted\t107\t2026-10-06 18:12:26\t2026-10-10 17:48:36',
      "\tprobably: Tier'Dal Arcane Insignia (1 character off)",
      '\taction: Fix wiki title',
      '\tfrom: a Teir`Dal rogue (107)'
    ].join('\n')
  )
  assert.equal(charactersOff(2), '2 characters off')
})

test('derivedPrices reads the real prices behind an instant sale, to the copper of the screenshots', () => {
  const sold = (coin: string) => ({ samples: [], sales: { entries: [{ name: coin, n: 1 }], distinct: 1 } })
  // Gold Ring: sells instantly for 857c, the loot window's Value shows 1,143c, base 1,200c.
  assert.deepEqual(derivedPrices(sold('8 gold 5 silver 7 copper')), { sale: 857, base: 1200, vendorValue: 1143 })
  // Jade Earring: 3,214c instantly, Value 4,286c, base 4,500c.
  assert.deepEqual(derivedPrices(sold('3 platinum 2 gold 1 silver 4 copper')), { sale: 3214, base: 4500, vendorValue: 4286 })
  assert.equal(derivedPrices({ samples: [] }), null, 'no sale, nothing derived')
  assert.equal(derivedPrices(sold('free')), null, 'a free sale is no price')
})

test('formatCoin writes the denominations that are there, and 0 copper for nothing', () => {
  assert.equal(formatCoin(1143), '1 platinum 1 gold 4 silver 3 copper')
  assert.equal(formatCoin(4500), '4 platinum 5 gold')
  assert.equal(formatCoin(7), '7 copper')
  assert.equal(formatCoin(0), '0 copper')
})

test('gapsAsText is the header then every row with its details', () => {
  assert.equal(
    gapsAsText(visibleGaps(ROWS, 'spell', '')),
    ['Name\tSeen as\tTimes\tFirst\tLast', 'Heroic Leap\tcast\t958\t2026-10-06 18:12:26\t2026-10-10 17:48:36', '\taction: Check wiki', '\tcast by: you (958)'].join('\n')
  )
  assert.equal(gapsAsText([]), 'Name\tSeen as\tTimes\tFirst\tLast')
})

test('gapsCaption reads the totals and the denominator, and an absent domain reads as zero', () => {
  const snap: GapsSnap = {
    rows: ROWS,
    totals: { item: 29, mob: 76, spell: 34 },
    seen: { item: 611, mob: 468, spell: 428 }
  }
  assert.equal(gapsCaption(snap, 'mob'), '76 of 468 names')
  const bare = { rows: [], totals: {}, seen: {} } as unknown as GapsSnap
  assert.equal(gapsCaption(bare, 'item'), '0 of 0 names')
})

// ---- every column sorts (owner, 2026-10-13) ----

test('the default sort is the engine order, most mentioned first', () => {
  const rows = [row(['item', 'B', ['looted'], 2]), row(['item', 'A', ['looted'], 9])]
  assert.deepEqual(sortGaps(rows, DEFAULT_GAP_SORT).map((r) => r.name), ['A', 'B'])
})

test('name sorts A to Z ignoring case, and back', () => {
  const rows = [row(['item', 'bat wing', ['looted'], 1]), row(['item', 'Apple', ['looted'], 1]), row(['item', 'Cog', ['looted'], 1])]
  assert.deepEqual(sortGaps(rows, { key: 'name', dir: 'asc' }).map((r) => r.name), ['Apple', 'bat wing', 'Cog'])
  assert.deepEqual(sortGaps(rows, { key: 'name', dir: 'desc' }).map((r) => r.name), ['Cog', 'bat wing', 'Apple'])
})

test('dates sort by time, and a tie keeps the engine order', () => {
  const a = { ...row(['item', 'A', ['looted'], 1]), last: '2026-10-12 09:00:00' }
  const b = { ...row(['item', 'B', ['looted'], 1]), last: '2026-10-13 01:00:00' }
  const c = { ...row(['item', 'C', ['looted'], 1]), last: '2026-10-12 09:00:00' }
  assert.deepEqual(sortGaps([a, b, c], { key: 'last', dir: 'desc' }).map((r) => r.name), ['B', 'A', 'C'])
})

test('To do sorts by the action a row needs', () => {
  const add = row(['item', 'X', ['looted'], 1])
  const check = row(['item', 'Y', ['looted'], 1])
  const sorted = sortGaps([check, add], { key: 'todo', dir: 'asc' }, { X: 'noPage', Y: 'unchecked' })
  assert.deepEqual(sorted.map((r) => r.name), ['X', 'Y'])
})

test('a first click puts counts and dates biggest first, text A to Z', () => {
  assert.equal(firstGapSortDir('count'), 'desc')
  assert.equal(firstGapSortDir('last'), 'desc')
  assert.equal(firstGapSortDir('name'), 'asc')
})
