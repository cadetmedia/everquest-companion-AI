// slayer/useSlayerController.ts — the Slayer plan's state and derivation, as one hook. The
// Achievements tab (features/achievements/) draws the counters in its own list and takes two
// bundles from here: the picks, and the zone ranking made for them.
//
// TWO PLANS ARE MADE, and they answer different questions:
//   - over EVERY open counter, to say how many zones each counter has (a counter's reach);
//   - over the PICKED counters, which is the ranking. With nothing picked the second plan is
//     the first one, so the ranking opens on "where is the most to do".
// Both read the same options, so a level cap that empties a counter's reach empties it in both.

import { useCallback, useMemo, useState } from 'react'
import type { CharacterSnap } from '@shared/characterTypes'
import { killIndex, type KillMap } from '@shared/kills'
import type { KillsSnap } from '@shared/types'
import type { ZoneShort } from '@shared/maps'
import {
  planZones,
  sortZones,
  targetReach,
  type PlanOptions,
  type PlanZone,
  type ZoneOrder
} from '@shared/slayer/slayerPlan'
import type { View } from '../../appViews'
import { useModule } from '../../lib/useModule'
// The Maps tab's own pin is the zone deep link: write the selection it persists, then switch
// tabs. MapsView reads it on mount, exactly as if the zone had been picked in its selector.
import { onPick, saveZoneSelection } from '../maps/zoneFollow'
import type { MobTarget } from '../mobs/mobTarget'
import { slayerCatalog, useSlayerData } from './slayerData'
import {
  MAX_LEVEL_KEY,
  NO_FACTION_HITS_KEY,
  OUT_OF_ERA_KEY,
  PICKS_KEY,
  ZONE_ORDER_KEY,
  counterRows,
  levelCap,
  loadFlag,
  loadMaxLevel,
  loadPicks,
  loadZoneOrder,
  nearlyDone,
  savePref,
  type CounterRow
} from './slayerRows'

/** What the app hands the tab: the two drill-downs its names link out to. */
export interface SlayerViewProps {
  onOpenMob?: (t: MobTarget) => void
  /** the app's MANUAL navigator, which is how a zone link becomes the Maps tab */
  onSelectView?: (v: View) => void
}

export interface PickBundle {
  /** every open counter the dump states, by id */
  rows: ReadonlyMap<string, CounterRow>
  picks: ReadonlySet<string>
  /** how many of the picks are counters the newest dump still lists */
  picked: number
  onSet: (ids: readonly string[], on: boolean) => void
  onPickNearlyDone: () => void
  onClear: () => void
}

export interface ZoneListBundle {
  zones: PlanZone[]
  /** the counters the ranking is for, by id, with the name each is drawn under */
  names: ReadonlyMap<string, string>
  picked: number
  maxLevel: number | null
  outOfEra: boolean
  noFactionHits: boolean
  order: ZoneOrder
  onMaxLevel: (level: number | null) => void
  onOutOfEra: (on: boolean) => void
  onNoFactionHits: (on: boolean) => void
  onOrder: (order: ZoneOrder) => void
  onOpenZone: (zone: ZoneShort) => void
  onOpenMob?: (t: MobTarget) => void
  /** every kill the log (and its archives) holds, by canonical mob name: how often each mob fell */
  kills: KillMap
}

export interface SlayerController {
  picks: PickBundle
  plan: ZoneListBundle
  /** the plan over every open counter, whatever is picked: where each counter can be worked */
  everyZone: PlanZone[]
}

/** The picks, stored on every change. */
function usePicks(): [ReadonlySet<string>, (next: ReadonlySet<string>) => void] {
  const [picks, setPicks] = useState<ReadonlySet<string>>(() => new Set(loadPicks()))
  const store = useCallback((next: ReadonlySet<string>) => {
    setPicks(next)
    savePref(PICKS_KEY, JSON.stringify([...next]))
  }, [])
  return [picks, store]
}

/** The plan's options, stored on every change. The level cap follows the character until set. */
function usePlanOptions(): {
  opts: PlanOptions
  onMaxLevel: (level: number | null) => void
  onOutOfEra: (on: boolean) => void
  onNoFactionHits: (on: boolean) => void
} {
  const own = useModule<CharacterSnap>('character')?.level?.level
  const [stored, setStored] = useState(() => loadMaxLevel())
  const [outOfEra, setOutOfEra] = useState(() => loadFlag(OUT_OF_ERA_KEY))
  const [noFactionHits, setNoFactionHits] = useState(() => loadFlag(NO_FACTION_HITS_KEY))
  const maxLevel = levelCap(stored, own)
  const opts = useMemo(
    () => ({ maxLevel, outOfEra, noFactionHits }),
    [maxLevel, outOfEra, noFactionHits]
  )
  const onMaxLevel = useCallback((level: number | null) => {
    setStored(level)
    savePref(MAX_LEVEL_KEY, level === null ? '' : String(level))
  }, [])
  const onOutOfEra = useCallback((on: boolean) => {
    setOutOfEra(on)
    savePref(OUT_OF_ERA_KEY, on ? '1' : '0')
  }, [])
  const onNoFactionHits = useCallback((on: boolean) => {
    setNoFactionHits(on)
    savePref(NO_FACTION_HITS_KEY, on ? '1' : '0')
  }, [])
  return { opts, onMaxLevel, onOutOfEra, onNoFactionHits }
}

function withSet(picks: ReadonlySet<string>, ids: readonly string[], on: boolean): Set<string> {
  const next = new Set(picks)
  for (const id of ids) {
    if (on) next.add(id)
    else next.delete(id)
  }
  return next
}

/** Every open counter with its reach, and the plan over all of them. */
function useAllCounters(opts: PlanOptions): { rows: CounterRow[]; zones: PlanZone[] } {
  const { record } = useSlayerData()
  return useMemo(() => {
    if (record === null) return { rows: [], zones: [] }
    const targets = counterRows(record, new Map()).map((r) => r.target)
    const zones = planZones(slayerCatalog(), targets, opts)
    return { rows: counterRows(record, targetReach(zones)), zones }
  }, [record, opts])
}

export function useSlayerController(props: SlayerViewProps): SlayerController {
  const { onOpenMob, onSelectView } = props
  const [picks, setPicks] = usePicks()
  const { opts, onMaxLevel, onOutOfEra, onNoFactionHits } = usePlanOptions()
  const all = useAllCounters(opts)

  const picked = useMemo(() => all.rows.filter((r) => picks.has(r.id)), [all.rows, picks])
  const [order, setOrder] = useState(() => loadZoneOrder())
  const zones = useMemo(() => {
    const plan =
      picked.length === 0 ? all.zones : planZones(slayerCatalog(), picked.map((r) => r.target), opts)
    return sortZones(plan, order)
  }, [all.zones, picked, opts, order])
  const onOrder = useCallback((next: ZoneOrder) => {
    setOrder(next)
    savePref(ZONE_ORDER_KEY, next)
  }, [])
  const killSnap = useModule<KillsSnap>('kills')
  const kills = useMemo(() => killIndex(killSnap?.mobs ?? {}), [killSnap])
  const names = useMemo(
    () => new Map(all.rows.map((r) => [r.id, r.counter.achievement])),
    [all.rows]
  )
  const rows = useMemo(() => new Map(all.rows.map((r) => [r.id, r])), [all.rows])
  const onOpenZone = useCallback(
    (zone: ZoneShort) => {
      saveZoneSelection(onPick(zone))
      onSelectView?.('maps')
    },
    [onSelectView]
  )

  // One bundle for as long as the picks and the counters stand: the achievement rows are memoized
  // on the context that carries it (features/achievements/AchievementRow.tsx).
  const pickBundle = useMemo(
    (): PickBundle => ({
      rows,
      picks,
      picked: picked.length,
      onSet: (ids, on) => {
        setPicks(withSet(picks, ids, on))
      },
      onPickNearlyDone: () => {
        setPicks(new Set(nearlyDone(all.rows)))
      },
      onClear: () => {
        setPicks(new Set())
      }
    }),
    [rows, picks, picked.length, all.rows, setPicks]
  )

  return {
    picks: pickBundle,
    plan: {
      zones,
      names,
      picked: picked.length,
      maxLevel: opts.maxLevel,
      outOfEra: opts.outOfEra,
      noFactionHits: opts.noFactionHits,
      order,
      onMaxLevel,
      onOutOfEra,
      onNoFactionHits,
      onOrder,
      onOpenZone,
      kills,
      ...(onOpenMob === undefined ? {} : { onOpenMob })
    },
    everyZone: all.zones
  }
}
