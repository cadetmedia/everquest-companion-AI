// useAllHeld — "held" across characters (owner, 2026-10-19: "HELD should probably say 'Held by
// Drywrought'"). One character: the attached one's own export and loot (useHeld). All characters:
// every character's OWN export plus that character's loot since it, each holder named.

import { useMemo } from 'react'
import { heldIndex, joinHeld, type HeldIndex } from '@shared/gapHeld'
import type { CharacterGaps } from '@shared/gapsAllCharacters'
import type { CharacterRef, LootEvent } from '@shared/types'
import { computeDestroyedAfter, computeHeldCountsAfter } from '../posky/heldCounts'
import { useHeld } from './useHeld'

/** Another character's holdings from its own export and its saved loot after it; none without an export. */
function othersHeld(c: CharacterGaps): HeldIndex {
  const inv = c.inventory
  const at = inv?.loadedAt == null ? Number.NaN : Date.parse(inv.loadedAt)
  if (inv == null || Number.isNaN(at)) return new Map()
  const loot = Array.isArray(c.loot) ? (c.loot as LootEvent[]) : []
  return heldIndex(inv, computeHeldCountsAfter(loot, at), computeDestroyedAfter(loot, at), c.name)
}

export function useAllHeld(ownLoot: readonly LootEvent[], me: CharacterRef | null, all: { on: boolean; others: readonly CharacterGaps[] | undefined; liveLabel: string }): HeldIndex {
  const mine = useHeld(ownLoot, me, all.on ? all.liveLabel : undefined)
  return useMemo(() => (all.on && all.others !== undefined ? joinHeld([mine, ...all.others.map(othersHeld)]) : mine), [mine, all.on, all.others])
}
