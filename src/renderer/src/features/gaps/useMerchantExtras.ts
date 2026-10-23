// useMerchantExtras — what a new merchant page's description reads beside its row
// (shared/gapMerchantDescription.ts): the trades of the items the rows sold (asked of main), and the
// player's own characters, whose names a hail answer quotes as `____`. One object while nothing
// changed, so the page builders' memos hold.

import { useMemo } from 'react'
import type { GapRow } from '@shared/gaps'
import { itemsSoldOf } from '@shared/gapItemsSold'
import type { MerchantExtras } from '@shared/gapMerchantDescription'
import { useItemTrades } from '../../lib/gapItemTrades'
import { useOwnCharacterNames } from './useOwnCharacters'

const NO_NAMES: readonly string[] = []

/** Every item the rows sold, each once; the same empty array when none did. */
function soldNames(rows: readonly GapRow[]): readonly string[] {
  const names = new Set<string>()
  for (const r of rows) for (const s of itemsSoldOf(r)) names.add(s.item)
  return names.size === 0 ? NO_NAMES : [...names]
}

export function useMerchantExtras(rows: readonly GapRow[]): MerchantExtras {
  const names = useMemo(() => soldNames(rows), [rows])
  const itemTrades = useItemTrades(names)
  const ownNames = useOwnCharacterNames()
  return useMemo(() => ({ itemTrades, ownNames }), [itemTrades, ownNames])
}
