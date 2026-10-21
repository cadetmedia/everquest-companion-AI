// shared/gapOffers.ts — what a merchant offered for a gap item, beside the app's Value estimate
// (owner ask, 2026-10-20: "you get the merchant sale price (based on my faction, which, if i'm ally,
// should match your calculation)").
//
// The engine keeps each distinct offer on the item's row (gaps_offers.rs): the merchant, the coin,
// the form (`per X` is one of a stack; `for the X.` is one unstackable item, so either is ONE item's
// price), and the player's last /con rung with that merchant before it, when there was one.
//
// THE ESTIMATE IS THE GAME'S VALUE LINE AT BEST STANDING: `derivedPrices` (shared/gaps.ts) from the
// instant sale on loot, base / 1.05. On the owner's log (2026-10-20), 19 of 21 items with both an
// instant sale and a merchant offer were offered that Value to the copper; the other two were a
// Crushbone Belt 1 copper under (Klok Nylsi) and a Speckled Granite Pebble at a third of it (Klok
// Lagnoz, whom the owner's cons found apprehensive, then amiable). So an offer at `ally` is checked
// against it, and an offer at any other rung is shown beside it: the app has no measured formula for
// how a lower standing (or Charisma) lowers an offer, and inventing one would be a guess.

import type { GapDetails, GapOffer } from './gaps'

/** The top /con rung, the standing the Value line and the wiki's `merchant_value` are at. */
export const BEST_STANDING = 'ally'

/** How one offer stands against the estimate. */
export type OfferCheck = 'matches' | 'differs' | 'noEstimate' | 'otherStanding' | 'noStanding' | 'nothing'

export function offerCheck(o: GapOffer, estimate: number | undefined): OfferCheck {
  if (o.copper <= 0) return 'nothing'
  if (o.standing === undefined) return 'noStanding'
  if (o.standing !== BEST_STANDING) return 'otherStanding'
  if (estimate === undefined) return 'noEstimate'
  return o.copper === estimate ? 'matches' : 'differs'
}

/** The check in words, short enough for one line under the offer. */
export function offerCheckText(o: GapOffer, estimate: number | undefined): string {
  switch (offerCheck(o, estimate)) {
    case 'nothing':
      // A free sale is not a price (MEASURED.md): a bound or worthless item says nothing of value.
      return 'pays nothing, which is no price'
    case 'noStanding':
      return 'standing unknown: /con the merchant before selling to record it'
    case 'otherStanding':
      return `at ${o.standing ?? ''}: the Value estimate is for ally, and no formula converts it`
    case 'noEstimate':
      return 'at ally: no Value estimate to compare (never sold on loot)'
    case 'matches':
      return 'at ally: matches the Value estimate'
    case 'differs':
      return 'at ally: differs from the Value estimate'
  }
}

/** `Klok Koglin: 5 silver 7 copper each · ally · Oggok · 2026-10-20 22:27:39 · 2 times`. */
export function offerText(o: GapOffer): string {
  const bits = [`${o.merchant}: ${o.coin}${o.per === true ? ' each' : ''}`]
  if (o.standing !== undefined) bits.push(o.standing)
  if (o.zone !== undefined) bits.push(o.zone)
  bits.push(o.last)
  if (o.n > 1) bits.push(`${o.n} times`)
  return bits.join(' · ')
}

/** The newest offer heard at ally that paid coin, in copper; undefined when none was. */
export function allyOfferCopper(offers: readonly GapOffer[] | undefined): number | undefined {
  return [...(offers ?? [])].reverse().find((o) => o.standing === BEST_STANDING && o.copper > 0)?.copper
}

/**
 * What a copied page writes as `merchant_value`, what a vendor pays at best standing (owner ask,
 * 2026-10-20: "enhance the COPY so that the price is automatically included"). THE RULE: an offer
 * heard at ally is the merchant's own word at that standing, so it wins over the estimate from the
 * instant sale; an offer at a lower or unknown standing is never written as the ally value (no
 * measured formula converts it), so the estimate stands, or nothing does. A `per` offer is one
 * item's price; a `for the` offer is one unstackable item's (gaps_offers.rs), so neither is divided.
 */
export function merchantValueOf(details: GapDetails, estimate: number | undefined): number | undefined {
  return allyOfferCopper(details.offers) ?? estimate
}
