// useGapReady — what each Gaps row still lacks, and so whether it is Ready (shared/gapReady.ts; owner,
// 2026-10-21: "yes get the ready in here, and have it as a filter"). The pages' inputs are read once
// here for the tab, the Show: Ready filter and the overlay: the engine's sightings, the install's
// spell files, the kept item and spell windows, the saved mob pictures and the pictures already in
// the picture folders, and a new merchant page's description inputs (useMerchantExtras). Each store is live, so a kept or cleared screenshot re-renders every reader.

import { useCallback, useMemo } from 'react'
import type { GapRow, GapsSnap } from '@shared/gaps'
import { openNeeds } from '@shared/gapReady'
import type { LootEvent } from '@shared/types'
import { stillNeeded, type MobSightings, type PageExtras } from '@shared/wikiPage'
import { useSpellFacts } from '../../lib/gapSpellFacts'
import { PAGE_EXTRAS, type GapsData } from './useGapsData'
import { useItemShots, useMobPictures, useSpellShots } from './itemShotsStore'
import { useFolderPictures } from './folderPicturesStore'
import { useMerchantExtras } from './useMerchantExtras'

/** The needs never read the loot ledger (levels, points, kills), so no row scans it. */
const NO_LOOT: readonly LootEvent[] = []

export interface GapReadiness {
  /** what the pages read beside the ledgers */
  sightings: MobSightings & PageExtras
  /** the page fields still open for a row, in full; empty when Ready */
  needed: (row: GapRow) => string[]
  isReady: (row: GapRow) => boolean
}

/** What the pages read beside the ledgers, from the engine's snapshot (useGapsData). */
function sightingsOf(engine: GapsSnap | null | undefined): MobSightings & PageExtras {
  return { killFactions: engine?.killFactions, mobLocs: engine?.mobLocs, mobSpecials: engine?.mobSpecials, mobCoin: engine?.mobCoin, ownPets: engine?.ownPets, ...PAGE_EXTRAS }
}

/**
 * `spellNames`: the spells to ask the install's files about (the shown domain's, when it is Spells);
 * `shown`: the domain's rows, whose merchants' items are asked for their trades.
 */
export function useGapReady(data: Pick<GapsData, 'engine' | 'kills'>, spellNames: readonly string[], shown: readonly GapRow[]): GapReadiness {
  const spellFacts = useSpellFacts(spellNames)
  const merchant = useMerchantExtras(shown)
  const itemShots = useItemShots()
  const spellShots = useSpellShots()
  const pictures = useMobPictures()
  const folder = useFolderPictures()
  const { engine, kills } = data
  const sightings = useMemo(() => ({ ...sightingsOf(engine), spellFacts, itemShots, spellShots, ...merchant }), [engine, spellFacts, itemShots, spellShots, merchant])
  const needed = useCallback((row: GapRow) => openNeeds(row, stillNeeded(row, NO_LOOT, kills, sightings), { pictures, folder }), [kills, sightings, pictures, folder])
  const isReady = useCallback((row: GapRow) => needed(row).length === 0, [needed])
  return useMemo(() => ({ sightings, needed, isReady }), [sightings, needed, isReady])
}
