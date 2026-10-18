// achievements/useAchievementsController.ts — all of the Achievements tab's state and
// derivation, as one hook. The view is a render shell; the rail, the list and the plan take the
// bundles this returns.
//
// THE PLAN BELONGS TO THE KILL COUNTERS. It is offered when the list is inside a family that
// holds a counter the plan can work on, which today is the Slayer family. Everywhere else the
// list has the width to itself and draws no checkbox, because a pick with no plan beside it is a
// box that does nothing.

import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import {
  EVERYTHING,
  bookIndex,
  bookTally,
  familyHasCounter,
  finishedCounters,
  mobIndex,
  railFamilies,
  shownCount,
  visibleSections,
  type BookIndex,
  type MobIndex,
  type RailFamily,
  type Scope,
  type SortOrder,
  type Tally,
  type ZoneHere
} from '@shared/achievements/bookRows'
import { listRows, type ListRow } from '@shared/achievements/listRows'
import type { CharacterSnap } from '@shared/characterTypes'
import type { ZoneShort } from '@shared/maps'
import { countersIn, type PlanZone } from '@shared/slayer/slayerPlan'
import { zoneShortName } from '@shared/zones'
import { useModule } from '../../lib/useModule'
import type { AchievementBook } from '@shared/outputs/achievementBook'
import { MOB_CATALOG } from '../mobs/mobSearch'
import type { MobTarget } from '../mobs/mobTarget'
import { loadFlag, savePref } from '../slayer/slayerRows'
import {
  useSlayerController,
  type PickBundle,
  type SlayerViewProps,
  type ZoneListBundle
} from '../slayer/useSlayerController'
import {
  SCOPE_KEY,
  SHOW_COMPLETE_KEY,
  SHOW_OPEN_KEY,
  SORT_KEY,
  ZONE_HERE_KEY,
  loadScope,
  loadShown,
  loadSort,
  scopeIn
} from './bookPrefs'
import { useAchievementBook } from './useAchievementBook'

/** What a row needs to draw its joins and its checkbox. One object, handed down unchanged. */
export interface RowContext {
  index: BookIndex
  mobs: MobIndex
  picks: PickBundle
  /** the plan is on screen, so a counter draws its checkbox */
  pickable: boolean
  onOpenZone: (zone: ZoneShort) => void
  onOpenMob?: (t: MobTarget) => void
}

export interface RailBundle {
  families: RailFamily[]
  total: Tally
  scope: Scope
  /** the file printed completed achievements, so a tally can say how many are done */
  hasComplete: boolean
  onScope: (scope: Scope) => void
}

export interface ListBundle {
  /** the sections as one flat list: heading rows and achievement rows (listRows.ts) */
  rows: ListRow[]
  shown: number
  query: string
  open: boolean
  complete: boolean
  sort: SortOrder
  /** the "Zone I'm in" switch */
  zoneOnly: boolean
  /** the "Checked" switch: only rows with a checked counter, so they can be found and unchecked */
  pickedOnly: boolean
  /** how many checked counters the dump still lists */
  picked: number
  /** the zone the log last put the character in, by name; null before it names one */
  zoneName: string | null
  hasComplete: boolean
  onQuery: (q: string) => void
  onOpen: (on: boolean) => void
  onComplete: (on: boolean) => void
  onSort: (sort: SortOrder) => void
  onZoneOnly: (on: boolean) => void
  onPickedOnly: (on: boolean) => void
  ctx: RowContext
}

export interface AchievementsController {
  ready: boolean
  hasDump: boolean
  readAt: number | null
  rail: RailBundle
  list: ListBundle
  /** null when the list is outside the families the plan can work on */
  plan: { picks: PickBundle; zones: ZoneListBundle } | null
}

let MOBS: MobIndex | null = null

/** Built on first use: the catalog is immutable, and a session that never opens the tab pays nothing. */
function catalogMobs(): MobIndex {
  MOBS ??= mobIndex(MOB_CATALOG)
  return MOBS
}

const NO_INDEX: BookIndex = new Map()

/** No map is named '', so nothing is worked on here. */
const NOWHERE: ZoneHere = { zone: '', counters: new Set(), mobs: new Map(), outOfEra: false }

/** The stored choices, each written back on change. */
function useChoices(): Pick<
  ListBundle,
  | 'query'
  | 'open'
  | 'complete'
  | 'sort'
  | 'zoneOnly'
  | 'onQuery'
  | 'onOpen'
  | 'onComplete'
  | 'onSort'
  | 'onZoneOnly'
> & { scope: Scope; onScope: (scope: Scope) => void } {
  const [scope, setScope] = useState(() => loadScope())
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(() => loadShown(SHOW_OPEN_KEY))
  const [complete, setComplete] = useState(() => loadShown(SHOW_COMPLETE_KEY))
  const [sort, setSort] = useState(() => loadSort())
  const [zoneOnly, setZoneOnly] = useState(() => loadFlag(ZONE_HERE_KEY))
  return {
    scope,
    query,
    open,
    complete,
    sort,
    zoneOnly,
    onQuery: setQuery,
    onScope: useCallback((next: Scope) => {
      setScope(next)
      savePref(SCOPE_KEY, JSON.stringify(next))
    }, []),
    onOpen: useCallback((on: boolean) => {
      setOpen(on)
      savePref(SHOW_OPEN_KEY, on ? '1' : '0')
    }, []),
    onComplete: useCallback((on: boolean) => {
      setComplete(on)
      savePref(SHOW_COMPLETE_KEY, on ? '1' : '0')
    }, []),
    onSort: useCallback((next: SortOrder) => {
      setSort(next)
      savePref(SORT_KEY, next)
    }, []),
    onZoneOnly: useCallback((on: boolean) => {
      setZoneOnly(on)
      savePref(ZONE_HERE_KEY, on ? '1' : '0')
    }, [])
  }
}

/** The zone filter for this zone: the counters the plan over every counter places here, read
 *  under the plan's era switch. */
function zoneHere(zone: ZoneShort, everyZone: readonly PlanZone[], outOfEra: boolean): ZoneHere {
  return { zone, counters: countersIn(everyZone, zone), mobs: catalogMobs(), outOfEra }
}

function shownIn(book: AchievementBook | null, scope: Scope): Scope {
  return book === null ? EVERYTHING : scopeIn(book, scope)
}

export function useAchievementsController(props: SlayerViewProps): AchievementsController {
  const { book, readAt, ready } = useAchievementBook()
  const finished = useMemo(() => (book === null ? [] : finishedCounters(book)), [book])
  const slayer = useSlayerController(props, finished)
  const choices = useChoices()
  const { open, complete, sort, zoneOnly } = choices
  // Not stored: a list that opens on "only what is checked" would read as empty next session.
  const [pickedOnly, setPickedOnly] = useState(false)
  // THE QUERY IS DEFERRED (owner ask, 2026-10-11: no lag): the box echoes the keystroke at once,
  // and the list follows on the render React fits in after it.
  const query = useDeferredValue(choices.query)
  const zoneName = useModule<CharacterSnap>('character')?.zone ?? null

  const index = useMemo(() => (book === null ? NO_INDEX : bookIndex(book)), [book])
  const families = useMemo(() => (book === null ? [] : railFamilies(book)), [book])
  const total = useMemo(() => bookTally(index), [index])
  const scope = useMemo(() => shownIn(book, choices.scope), [book, choices.scope])
  // ON WITH NO KNOWN ZONE, THE FILTER KEEPS NOTHING: the switch says "here", and an empty list with
  // the switch's own note says why, where a full list would read as every row being here.
  const here = useMemo((): ZoneHere | null => {
    if (!zoneOnly) return null
    const zone = zoneShortName(zoneName)
    return zone === null ? NOWHERE : zoneHere(zone, slayer.everyZone, slayer.plan.outOfEra)
  }, [zoneOnly, zoneName, slayer.everyZone, slayer.plan.outOfEra])
  const pickable = useMemo(
    () => book !== null && familyHasCounter(book, scope.family),
    [book, scope.family]
  )
  const picked = pickable && pickedOnly ? slayer.picks.picks : null
  const sections = useMemo(
    () =>
      book === null
        ? []
        : visibleSections(book, index, { scope, query, open, complete, sort, here, picked }),
    [book, index, scope, query, open, complete, sort, here, picked]
  )
  const rows = useMemo(() => listRows(sections), [sections])
  const hasComplete = total.done > 0
  // ONE OBJECT FOR AS LONG AS NOTHING IN IT CHANGES: the rows are memoized on it (AchievementRow).
  const { onOpenMob } = props
  const ctx = useMemo(
    (): RowContext => ({
      index,
      mobs: catalogMobs(),
      picks: slayer.picks,
      pickable,
      onOpenZone: slayer.plan.onOpenZone,
      ...(onOpenMob === undefined ? {} : { onOpenMob })
    }),
    [index, slayer.picks, pickable, slayer.plan.onOpenZone, onOpenMob]
  )

  return {
    ready,
    hasDump: book !== null,
    readAt,
    rail: { families, total, scope, hasComplete, onScope: choices.onScope },
    list: {
      ...choices,
      rows,
      shown: shownCount(sections),
      zoneName,
      hasComplete,
      pickedOnly,
      picked: slayer.picks.picked,
      onPickedOnly: setPickedOnly,
      ctx
    },
    plan: pickable ? { picks: slayer.picks, zones: slayer.plan } : null
  }
}
