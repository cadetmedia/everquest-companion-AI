// Merchant offers on a Gaps item row (owner ask, 2026-10-20): the detail lines, the check against
// the Value estimate at the offer's standing, and the copied page's merchant_value.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allyOfferCopper, merchantValueOf, offerCheck, offerCheckText, offerText } from '../src/shared/gapOffers'
import { gapDetailsText, type GapOffer, type GapRow } from '../src/shared/gaps'
import { wikiPageText } from '../src/shared/wikiPage'

const offer = (o: Partial<GapOffer>): GapOffer => ({ merchant: 'Klok Koglin', coin: '3 silver 8 copper', copper: 38, n: 1, last: '2026-10-20 22:27:39', ...o })

/** A Black Lizard Talon sold on loot for 3 silver: base 42c, Value estimate 40c (4s). */
const row = (offers?: GapOffer[], sold = true): GapRow => ({
  domain: 'item',
  name: 'Black Lizard Talon',
  kinds: ['looted', 'appraised'],
  count: 2,
  first: '',
  last: '',
  details: { samples: [], ...(sold ? { sales: { entries: [{ name: '3 silver', n: 1 }], distinct: 1 } } : {}), ...(offers ? { offers } : {}) }
})

test('an offer is checked against the Value estimate only at ally; any other standing is shown beside it', () => {
  assert.equal(offerCheck(offer({ standing: 'ally', copper: 40 }), 40), 'matches')
  assert.equal(offerCheck(offer({ standing: 'ally' }), 40), 'differs')
  assert.equal(offerCheck(offer({ standing: 'ally' }), undefined), 'noEstimate')
  assert.equal(offerCheck(offer({ standing: 'amiably' }), 40), 'otherStanding')
  assert.equal(offerCheck(offer({}), 40), 'noStanding')
  assert.equal(offerCheck(offer({ standing: 'ally', coin: 'nothing', copper: 0 }), 40), 'nothing', 'a free sale is no price')
  assert.equal(offerCheckText(offer({ standing: 'ally', copper: 40 }), 40), 'at ally: matches the Value estimate')
  assert.match(offerCheckText(offer({}), 40), /\/con the merchant/)
  assert.match(offerCheckText(offer({ standing: 'amiably' }), 40), /^at amiably: /)
})

test('an offer reads as one line: merchant, coin (each for a stack), standing, zone, when, how often', () => {
  assert.equal(
    offerText(offer({ coin: '5 silver 7 copper', per: true, standing: 'ally', zone: 'Oggok', n: 2 })),
    'Klok Koglin: 5 silver 7 copper each · ally · Oggok · 2026-10-20 22:27:39 · 2 times'
  )
  assert.equal(offerText(offer({})), 'Klok Koglin: 3 silver 8 copper · 2026-10-20 22:27:39')
})

test('the copy text lists each offer with its check', () => {
  const text = gapDetailsText(row([offer({ standing: 'ally', zone: 'Oggok' })]))
  assert.match(text, /\tvendor value: 4 silver\n/)
  assert.match(text, /\tmerchant offer: Klok Koglin: 3 silver 8 copper · ally · Oggok · 2026-10-20 22:27:39 \(at ally: differs from the Value estimate\)/)
})

test('merchant_value takes the newest ally offer over the instant-sale estimate', () => {
  const offers = [offer({ standing: 'ally', copper: 36, coin: '3 silver 6 copper' }), offer({ standing: 'ally' }), offer({ standing: 'amiably', copper: 20 })]
  assert.equal(allyOfferCopper(offers), 38, 'the newest ally offer, not the later amiable one')
  assert.equal(merchantValueOf(row(offers).details, 40), 38)
  assert.match(wikiPageText(row(offers), [], {}), /\|merchant_value = 3s 8c\n/)
  assert.match(wikiPageText(row([offer({ standing: 'ally' })], false), [], {}), /\|merchant_value = 3s 8c\n/, 'with no sale on loot too')
})

test('an offer at a lower or unknown standing, or of nothing, never stands in for the ally value', () => {
  for (const o of [offer({ standing: 'amiably' }), offer({}), offer({ standing: 'ally', coin: 'nothing', copper: 0 })]) {
    assert.match(wikiPageText(row([o]), [], {}), /\|merchant_value = 4s\n/, 'the estimate stands')
    assert.doesNotMatch(wikiPageText(row([o], false), [], {}), /merchant_value/, 'or nothing does')
  }
})
