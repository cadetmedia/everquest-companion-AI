// usePageSightings — what Copy wiki page and the "needs" list read beside the ledgers: the engine's
// kill factions, mob points, specials and coin, the wiki's spellings (PAGE_EXTRAS), the install's spell
// facts for the spells on screen (owner, 2026-10-19), and a new merchant page's description inputs
// for the merchants on screen (useMerchantExtras; owner, 2026-10-23). Apart from GapsView, its size bar.

import { useMemo } from 'react'
import type { GapDomain, GapRow, GapsSnap } from '@shared/gaps'
import type { MerchantExtras } from '@shared/gapMerchantDescription'
import { useSpellFacts } from '../../lib/gapSpellFacts'
import { useMerchantExtras } from './useMerchantExtras'
import { PAGE_EXTRAS } from './useGapsData'

const NO_NAMES: readonly string[] = []
const NO_ROWS: readonly GapRow[] = []
/** The names of the rows on screen. */
const spellNamesOf = (rows: readonly GapRow[]): string[] => rows.map((r) => r.name)

/** What the pages read beside the ledgers, from the engine's snapshot (useGapsData). */
function sightingsOf(engine: GapsSnap | null | undefined, spellFacts: ReturnType<typeof useSpellFacts>, merchant: MerchantExtras) {
  return { killFactions: engine?.killFactions, mobLocs: engine?.mobLocs, mobSpecials: engine?.mobSpecials, mobCoin: engine?.mobCoin, ownPets: engine?.ownPets, ...PAGE_EXTRAS, spellFacts, ...merchant }
}

export function usePageSightings(engine: GapsSnap | null | undefined, domain: GapDomain, visible: readonly GapRow[]): ReturnType<typeof sightingsOf> {
  const spellNames = useMemo(() => (domain === 'spell' ? spellNamesOf(visible) : NO_NAMES), [domain, visible])
  const spellFacts = useSpellFacts(spellNames)
  const merchant = useMerchantExtras(domain === 'mob' || domain === 'merchant' ? visible : NO_ROWS)
  return useMemo(() => sightingsOf(engine, spellFacts, merchant), [engine, spellFacts, merchant])
}
