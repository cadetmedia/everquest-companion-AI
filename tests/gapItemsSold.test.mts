// A new merchant page's items_sold (owner, 2026-10-23: "why doesn't our merchant page show items
// sold?"), in the cached merchant pages' own form; prices only when every item was quoted at ally.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ddpCoin, itemsSoldBlock } from '../src/shared/gapItemsSold'
import { wikiPageText } from '../src/shared/wikiPage'
import type { GapRow } from '../src/shared/gaps'

test('a price is the wiki\'s ddp coin, zero parts left out', () => {
  assert.equal(ddpCoin(104_999), '104pp 9gp 9sp 9cp')
  assert.equal(ddpCoin(209), '2gp 9cp')
  assert.equal(ddpCoin(1_049), '1pp 4sp 9cp')
})

test('every item quoted at ally: each line carries its price, padded as the cache pads it, and the block says the standing', () => {
  const block = itemsSoldBlock([{ item: "Jeweler's Kit", copper: 1_049 }, { item: 'Platinum Bar', copper: 104_999 }])
  assert.equal(
    block,
    // `{{:Jeweler's Kit}}` is 18 characters and `{{:Platinum Bar}}` 17: each padded to 40.
    `<ul><li> {{:Jeweler's Kit}}${' '.repeat(22)}<span class='ddp'>(1pp 4sp 9cp)</span>
</li><li> {{:Platinum Bar}}${' '.repeat(23)}<span class='ddp'>(104pp 9gp 9sp 9cp)</span>
</li></ul>
Prices at Ally.`
  )
})

test('an item with no ally quote takes every price off, and a merchant that sold nothing leaves the field open', () => {
  assert.equal(itemsSoldBlock([{ item: "Cat's Eye Agate", copper: 209 }, { item: 'Malachite' }]), "<ul><li> {{:Cat's Eye Agate}}\n</li><li> {{:Malachite}}\n</li></ul>")
  assert.equal(itemsSoldBlock([]), '')
})

test('Copy wiki page writes the merchant row\'s items under items_sold', () => {
  const row = { domain: 'merchant', name: 'Mindiinya N`Zar', kinds: ['quoted'], count: 2, first: '', last: '', details: { samples: [] }, itemsSold: [{ item: "Cat's Eye Agate" }, { item: 'Malachite' }] } as GapRow
  const text = wikiPageText(row, [], {})
  assert.ok(text.includes("| items_sold = \n\n<ul><li> {{:Cat's Eye Agate}}\n</li><li> {{:Malachite}}\n</li></ul>\n"), text)
  const bare = wikiPageText({ ...row, itemsSold: undefined } as GapRow, [], {})
  assert.ok(bare.includes('| items_sold = \n'), 'nothing quoted, the field stays open')
})
