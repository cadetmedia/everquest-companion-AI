// useGapsList — the Gaps tab's list, from the engine's rows to the order on screen, in one hook so
// the tab and the Wiki Gaps overlay's publisher (GapsOverlayPublisher.tsx) run the SAME pipeline
// (owner, 2026-10-20: the overlay shows "the top 10 of whatever list they have on whatever tab they
// have showing"). The steps, in order: every character joined when All characters is on
// (useGapsData), the marked players dropped, the domain tab + search + Zone I'm in (visibleGaps),
// Show (useGapShow, Ready read by useGapReady), I have it (useHeldOnly), Hide uncertain, the Done marks unless Show done, and
// the sort.
//
// EVERY CHOICE THE LIST DEPENDS ON IS READ HERE, NOT IN THE TAB, so the publisher sees the tab's
// choices with the tab closed: the checkboxes were per-viewer prefs already; the domain tab and the
// sort order are now too (shared/gapsViewPrefs.ts); the search is kept for the session in this
// module (it used to clear on leaving the tab, and the overlay would then disagree with it).

import { useCallback, useDeferredValue, useMemo, useSyncExternalStore } from 'react'
import { firstGapSortDir, sortGaps, visibleGaps, withoutDone, withoutPlayers, type GapDomain, type GapRow, type GapSort, type GapSortKey, type GapVerdicts } from '@shared/gaps'
import { GAP_DOMAIN_KEY, GAP_SORT_KEY, gapDomainOf, gapSortOf, gapSortText } from '@shared/gapsViewPrefs'
import type { CharacterRef, CharacterSnap } from '@shared/types'
import { useModule } from '../../lib/useModule'
import { useBoolPref, useRawPref } from '../combat/useCombatPrefs'
import { useGapVerdicts } from '../../lib/gapVerdicts'
import { GAPS_DATA_DATE, PAGE_EXTRAS, useGapsData, type GapsData } from './useGapsData'
import { useDoneMarks, usePlayerList, type DoneMarks, type PlayerList } from './useDoneMarks'
import { useAllCharacters, type AllCharactersState } from './useOtherCharacters'
import { useHideUncertain, type HideUncertain } from './useHideUncertain'
import { useAllHeld } from './useAllHeld'
import { useHeldOnly, type HeldOnly } from './useHeldOnly'
import { useGapShow, type GapShowState } from './useGapShow'
import { useGapReady, type GapReadiness } from './useGapReady'
import type { HeldIndex } from '@shared/gapHeld'
import { withExtraItemRows } from '@shared/gapExtraItems'
import { useExtraItemRows } from './useExtraItemRows'

/** Where the "Zone I'm in" choice is remembered, per viewer, as the Achievements tab remembers its own. */
const ZONE_HERE_KEY = 'eq.gaps.zoneHere'
/** Where "Show done" is remembered. */
const SHOW_DONE_KEY = 'eq.gaps.showDone'
/** What a row's job reads beyond the row: which names are catalog mobs (a merchant with a page). */
const JOB_CONTEXT = { isMob: PAGE_EXTRAS.isMob }
const NO_NAMES: readonly string[] = []

// ---- the search, kept for the session ----

let query = ''
const queryListeners = new Set<() => void>()

function subscribeQuery(l: () => void): () => void {
  queryListeners.add(l)
  return () => queryListeners.delete(l)
}

function setQuery(next: string): void {
  query = next
  for (const l of [...queryListeners]) l()
}

/** The search box's text, the same in every reader in this window until the app closes. */
function useGapsQuery(): string {
  return useSyncExternalStore(subscribeQuery, () => query)
}

/** The table's order: a header click picks the column, a second flips it. Remembered per viewer. */
function useGapSort(): [GapSort, (key: GapSortKey) => void] {
  const [raw, setRaw] = useRawPref(GAP_SORT_KEY)
  const sort = useMemo(() => gapSortOf(raw), [raw])
  const onSort = useCallback(
    (key: GapSortKey) => {
      setRaw(gapSortText(sort.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: firstGapSortDir(key) }))
    },
    [sort, setRaw]
  )
  return [sort, onSort]
}

/** The domain tab on show (owner, 2026-10-20: remembered, so the overlay knows it). */
function useGapDomain(): [GapDomain, (d: GapDomain) => void] {
  const [raw, setRaw] = useRawPref(GAP_DOMAIN_KEY)
  return [gapDomainOf(raw), setRaw]
}

export interface GapsList {
  me: CharacterRef | null
  allChars: AllCharactersState
  data: GapsData
  domain: GapDomain
  setDomain: (d: GapDomain) => void
  query: string
  setQuery: (q: string) => void
  hereOnly: boolean
  setHereOnly: (on: boolean) => void
  /** the zone the log last named, whether or not Zone I'm in is on */
  current: string | null
  /** the zone the list is narrowed to: `current` with Zone I'm in on, else null */
  zone: string | null
  playerList: PlayerList
  /** the engine's rows (every domain) less the marked players; undefined until they land */
  rows: GapRow[] | undefined
  marks: DoneMarks
  showDone: boolean
  setShowDone: (on: boolean) => void
  /** what each character holds now (the held chip), every character's while All characters is on */
  holding: HeldIndex
  /** "Show" (owner, 2026-10-21): new pages, updates to pages that exist, both, or the Ready rows */
  job: GapShowState
  /** what each row still lacks, the pages' inputs with it (useGapReady) */
  readiness: GapReadiness
  /** "I have it" (owner, 2026-10-21): the Items list narrowed to what is held, and where */
  mine: HeldOnly
  sure: HideUncertain
  /** the rows on the tab, before the sort */
  visible: GapRow[]
  verdicts: GapVerdicts
  sort: GapSort
  onSort: (key: GapSortKey) => void
  /** the rows on the tab, in the tab's order */
  sorted: GapRow[]
}

/** With the tab closed, the overlay's copy takes the game's new data at most this often. */
const BACKGROUND_HOLD_MS = 15_000

/**
 * `background` is the overlay's publisher with the tab closed (owner, 2026-10-20: every tab click
 * took 500 ms while it re-derived the whole list on every push): only the shown domain is derived,
 * and the game's data is taken every 15 s. Done marks, filters and the domain still apply at once.
 */
export function useGapsList(opts: { background?: boolean } = {}): GapsList {
  const charSnap = useModule<CharacterSnap>('character')
  // All characters (owner, 2026-10-19): every character's saved Gaps joined in, within a day window.
  const me = charSnap?.character ?? null
  const allChars = useAllCharacters(me)
  const [domain, setDomain] = useGapDomain()
  // Days back trims every view (owner, 2026-10-21), the one-character list too.
  const engineData = useGapsData(allChars.all, opts.background === true ? { only: domain, holdMs: BACKGROUND_HOLD_MS, cut: allChars.cut } : { cut: allChars.cut })
  // An item a character holds right now needs only a screenshot (review C6; owner, 2026-10-19): each
  // character's own export plus ITS loot since, named per holder while All characters is on.
  const holding = useAllHeld(engineData.ownLoot, me, allChars)
  // Items no log line names (owner, 2026-10-22: a store purchase): held in an export or captured,
  // with no wiki page, are Items rows too, in the one snapshot every view reads.
  const viewer = useMemo(() => ({ me: me?.name ?? null, all: allChars.all !== null }), [me, allChars.all])
  const extra = useExtraItemRows(engineData.snap?.rows, holding, viewer)
  const data = useMemo(() => (engineData.snap && extra.length > 0 ? { ...engineData, snap: withExtraItemRows(engineData.snap, extra) } : engineData), [engineData, extra])
  const shownQuery = useGapsQuery()
  // "Zone I'm in" (owner ask, 2026-10-17): only what was named where you stand, every tier of it.
  const [hereOnly, setHereOnly] = useBoolPref(ZONE_HERE_KEY, false)
  const current = charSnap?.zone ?? null
  const zone = hereOnly ? current : null
  // Mobs rows the player marked as players are gone for good (owner, 2026-10-19).
  const playerList = usePlayerList()
  const snap = data.snap
  const rows = useMemo(() => (snap ? withoutPlayers(snap.rows, playerList.players) : undefined), [snap, playerList.players])
  const marks = useDoneMarks(new Date().toISOString().slice(0, 10), GAPS_DATA_DATE)
  const [showDone, setShowDone] = useBoolPref(SHOW_DONE_KEY, false)
  // The list follows the query a beat behind the keystroke, so typing never waits on a filter.
  const deferredQuery = useDeferredValue(shownQuery)
  const inDomain = useMemo(() => visibleGaps(rows ?? [], domain, deferredQuery, zone), [rows, domain, deferredQuery, zone])
  // "Show" (owner, 2026-10-21): new pages, updates or both; then "I have it", what the player holds.
  // Ready (owner, 2026-10-21): nothing left to capture; the install's spell files asked for the domain's spells.
  const spellNames = useMemo(() => (domain === 'spell' ? inDomain.map((r) => r.name) : NO_NAMES), [domain, inDomain])
  const readiness = useGapReady(data, spellNames)
  const job = useGapShow(inDomain, JOB_CONTEXT, readiness.isReady)
  const mine = useHeldOnly(job.rows, holding, domain)
  // "Hide uncertain" (owner, 2026-10-19): rows the tab is not sure are gaps, hidden on request.
  const sure = useHideUncertain(mine.rows)
  const visible = useMemo(() => (showDone ? [...sure.rows] : withoutDone(sure.rows, marks.done)), [sure.rows, showDone, marks.done])
  // What the caches already say about the rows on screen: `unchecked` until the answer lands.
  const verdicts = useGapVerdicts(domain, visible)
  const [sort, onSort] = useGapSort()
  // The table and Copy list read the same order, so a copied list matches what is on screen.
  const sorted = useMemo(() => sortGaps(visible, sort, verdicts), [visible, sort, verdicts])
  // prettier-ignore
  return { me, allChars, data, domain, setDomain, query: shownQuery, setQuery, hereOnly, setHereOnly, current, zone, playerList, rows, marks, showDone, setShowDone, holding, job, readiness, mine, sure, visible, verdicts, sort, onSort, sorted }
}
