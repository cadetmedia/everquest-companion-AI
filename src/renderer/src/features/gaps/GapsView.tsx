// THE GAPS TAB — names the log mentions that the app's wiki data has no record of (owner ask,
// 2026-10-11): a diagnostics list, so the gaps can be fixed in the scrape or on the wiki.
//
// The engine's `gaps` module (engine/crates/fold/src/modules/gaps.rs) checks every item looted,
// received, bought or crafted, every mob looted, killed, considered or hailed, and every spell cast
// against the committed data, without ever asking the app to fetch. It serves one row per unknown
// name, most mentioned first, 500 per domain at most; useGapsData joins the domains derived here.
// The domain toggle and the search box narrow those rows in shared/gaps.ts; "Copy list" puts the
// visible rows on the clipboard as tab-separated text.

import { type JSX, useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Box, Button, Checkbox, CircularProgress, FormControlLabel, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import {
  DEFAULT_GAP_SORT,
  GAP_DOMAINS,
  GAP_DOMAIN_HELP,
  GAP_DOMAIN_LABELS,
  GAP_SHOWN_NOUN,
  firstGapSortDir,
  gapsAsText,
  gapsCaption,
  hiddenBy,
  sortGaps,
  visibleGaps,
  withoutDone,
  withoutPlayers,
  type GapDomain,
  type GapRow,
  type GapSort,
  type GapSortKey,
  type GapsSnap
} from '@shared/gaps'
import type { CharacterSnap } from '@shared/types'
import { stillNeeded, wikiPageText } from '@shared/wikiPage'
import { useModule } from '../../lib/useModule'
import { Tooltip } from '../../lib/Tooltip'
import { useBoolPref } from '../combat/useCombatPrefs'
import { copyText } from '../../lib/clipboard'
import { useGapVerdicts } from '../../lib/gapVerdicts'
import { useSpellFacts } from '../../lib/gapSpellFacts'
import GapsTable from './GapsTable'
import { GAPS_DATA_DATE, PAGE_EXTRAS, useGapsData } from './useGapsData'
import { useDoneMarks, usePlayerList } from './useDoneMarks'
import { useHeld } from './useHeld'
import { useHideUncertain, type HideUncertain } from './useHideUncertain'
import { useGrouping } from './useGrouping'
import GroupHeaderControls from './GroupHeaderControls'

// One line (owner, 2026-10-11): the how is in the module header, not on the page. Since 2026-10-18
// the line says what the chosen domain's rows are (GAP_DOMAIN_HELP).
const CLICK_HINT = 'Click a row for where it was seen.'

/** Where the "Zone I'm in" choice is remembered, per viewer, as the Achievements tab remembers its own. */
const ZONE_HERE_KEY = 'eq.gaps.zoneHere'
/** Where "Show done" is remembered. */
const SHOW_DONE_KEY = 'eq.gaps.showDone'
const CHIP_CONTEXT = { dataDate: GAPS_DATA_DATE, isMob: PAGE_EXTRAS.isMob }
const NO_NAMES: readonly string[] = []
/** The names of the rows on screen. */
const spellNamesOf = (rows: readonly GapRow[]): string[] => rows.map((r) => r.name)

/** A small checkbox with a caption, the tab's toolbar control. */
function Pref({ label, checked, onChange, testId, disabled }: { label: string; checked: boolean; onChange: (on: boolean) => void; testId: string; disabled?: boolean }): JSX.Element {
  return (
    <FormControlLabel
      sx={{ mr: 0 }}
      control={<Checkbox size="small" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} sx={{ p: 0.5 }} data-testid={testId} />}
      label={<Typography variant="caption">{label}</Typography>}
    />
  )
}

/** "Zone I'm in (<zone>)", the Achievements tab's control: only the rows seen in that place, any tier. */
function ZoneHere({ zone, checked, onChange }: { zone: string | null; checked: boolean; onChange: (on: boolean) => void }): JSX.Element {
  return (
    <Tooltip title={zone === null ? 'The log has not named a zone yet. Zone once and this fills in.' : `Only what was seen in ${zone} or another tier of it.`}>
      <span>
        <Pref label={zone === null ? "Zone I'm in" : `Zone I'm in (${zone})`} checked={checked} onChange={onChange} disabled={zone === null} testId="gaps-zone-here" />
      </span>
    </Tooltip>
  )
}

/** "Hide uncertain": the rows whose very existence as a gap is in doubt (shared/gaps.ts `uncertainGap`). */
function HideUncertainBox({ state }: { state: HideUncertain }): JSX.Element {
  return (
    <Tooltip title="Hides the rows the tab is not sure are gaps at all: one-word names you only hailed or conned that may be players.">
      <span>
        <Pref label="Hide uncertain" checked={state.hide} onChange={state.setHide} testId="gaps-hide-uncertain" />
      </span>
    </Tooltip>
  )
}

/** "Copy list", and how many rows the last press copied. */
function CopyList({ onCopy, disabled, copied }: { onCopy: () => void; disabled: boolean; copied: number | null }): JSX.Element {
  return (
    <>
      {copied !== null && (
        <Typography variant="caption" color="success.main">
          Copied {copied} rows
        </Typography>
      )}
      <Button size="small" variant="outlined" startIcon={<ContentCopyIcon />} onClick={onCopy} disabled={disabled} data-testid="gaps-copy">
        Copy list
      </Button>
    </>
  )
}

function DomainToggle({
  snap,
  domain,
  zone,
  onPick,
  hidden
}: {
  snap: GapsSnap
  domain: GapDomain
  zone: string | null
  onPick: (d: GapDomain) => void
  /** rows the player hid, left out of each count */
  hidden: (row: GapRow) => boolean
}): JSX.Element {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={domain}
      onChange={(_e, next: GapDomain | null) => {
        if (next !== null) onPick(next)
      }}
      data-testid="gaps-domain"
    >
      {GAP_DOMAINS.map((d) => (
        <ToggleButton key={d} value={d} sx={{ textTransform: 'none', px: 1.5 }}>
          <Stack alignItems="flex-start">
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {GAP_DOMAIN_LABELS[d]}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {gapsCaption(snap, d, zone, hidden)}
            </Typography>
          </Stack>
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}

/** How many rows are shown of how many, and what narrows them. */
function ShownLine({
  counts,
  domain,
  zone,
  tail = ''
}: {
  counts: { visible: number; held: number; served: number; hidden: number; uncertain: number }
  domain: GapDomain
  zone: string | null
  tail?: string
}): JSX.Element {
  const { visible, held, served, hidden, uncertain } = counts
  return (
    <Typography variant="caption" color="text.secondary" data-testid="gaps-shown">
      Showing {visible} of {held} {GAP_SHOWN_NOUN[domain]}
      {zone !== null ? `, seen in ${zone} or another tier of it` : ''}
      {hidden > 0 ? `, ${hidden} marked done hidden` : ''}
      {uncertain > 0 ? `, ${uncertain} uncertain hidden` : ''}
      {held > served ? ` (the engine serves the ${served} most mentioned)` : ''}
      {tail}. Wiki data from {GAPS_DATA_DATE}.
    </Typography>
  )
}

export default function GapsView(): JSX.Element {
  const { snap, engine, loot, kills } = useGapsData()
  const [domain, setDomain] = useState<GapDomain>('item')
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState<number | null>(null)
  // "Zone I'm in" (owner ask, 2026-10-17): only what was named where you stand, every tier of it.
  const [hereOnly, setHereOnly] = useBoolPref(ZONE_HERE_KEY, false)
  const charSnap = useModule<CharacterSnap>('character')
  const current = charSnap?.zone ?? null
  const zone = hereOnly ? current : null
  // Mobs rows the player marked as players are gone for good (owner, 2026-10-19).
  const playerList = usePlayerList()
  const rows = useMemo(() => (snap ? withoutPlayers(snap.rows, playerList.players) : undefined), [snap, playerList.players])
  const marks = useDoneMarks(new Date().toISOString().slice(0, 10), GAPS_DATA_DATE)
  const [showDone, setShowDone] = useBoolPref(SHOW_DONE_KEY, false)
  // The list follows the query a beat behind the keystroke, so typing never waits on a filter.
  const deferredQuery = useDeferredValue(query)
  const inDomain = useMemo(() => visibleGaps(rows ?? [], domain, deferredQuery, zone), [rows, domain, deferredQuery, zone])
  // "Hide uncertain" (owner, 2026-10-19): rows the tab is not sure are gaps, hidden on request.
  const sure = useHideUncertain(inDomain)
  const visible = useMemo(() => (showDone ? [...sure.rows] : withoutDone(sure.rows, marks.done)), [sure.rows, showDone, marks.done])
  const hiddenRow = useMemo(() => hiddenBy(marks.done, showDone, sure.hide), [marks.done, showDone, sure.hide])
  // What the caches already say about the rows on screen: `unchecked` until the answer lands.
  const verdicts = useGapVerdicts(domain, visible)
  const [sort, setSort] = useState<GapSort>(DEFAULT_GAP_SORT)
  const onSort = useCallback((key: GapSortKey) => {
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: firstGapSortDir(key) }))
  }, [])
  // The table and Copy list read the same order, so a copied list matches what is on screen.
  const sorted = useMemo(() => sortGaps(visible, sort, verdicts), [visible, sort, verdicts])
  // What the pages read beside the ledgers: each kill's factions, each mob's points, the wiki's spellings.
  // A spell page fills from the install's spell files (owner, 2026-10-19): asked for the spells on screen.
  const spellNames = useMemo(() => (domain === 'spell' ? spellNamesOf(visible) : NO_NAMES), [domain, visible])
  const spellFacts = useSpellFacts(spellNames)
  const sightings = useMemo(
    () => ({ killFactions: engine?.killFactions, mobLocs: engine?.mobLocs, mobSpecials: engine?.mobSpecials, mobCoin: engine?.mobCoin, ...PAGE_EXTRAS, spellFacts }),
    [engine, spellFacts]
  )
  const pageText = useCallback((row: GapRow) => wikiPageText(row, loot, kills, sightings), [loot, kills, sightings])
  const needed = useCallback((row: GapRow) => stillNeeded(row, loot, kills, sightings), [loot, kills, sightings])
  // "Group by zone, then mob" (owner ask, 2026-10-18), its heading order and its folds (useGrouping).
  const group = useGrouping(sorted, loot)
  // An item the player holds right now needs only a screenshot (review C6; owner, 2026-10-19).
  const holding = useHeld(loot, charSnap?.character ?? null)

  if (!snap) return <CircularProgress size={20} />

  const copy = async (): Promise<void> => {
    const ok = await copyText(gapsAsText(sorted, verdicts))
    setCopied(ok ? visible.length : null)
  }
  const held = snap.totals[domain] ?? 0
  const served = visibleGaps(rows ?? [], domain, '').length
  const hidden = sure.rows.length - visible.length

  return (
    // A full-height column whose last child, the table box, is the page's only scroller (GapsTable).
    <Stack spacing={2} data-testid="gaps-view" sx={{ height: '100%', minHeight: 0 }}>
      <Typography variant="body2" color="text.secondary">
        {GAP_DOMAIN_HELP[domain]} {CLICK_HINT}
      </Typography>
      {/* Two rows (owner, 2026-10-20: "put search and all the values after that on the next row
          instead of next to the tabs"): the domains alone, then what narrows them, Copy list last. */}
      <DomainToggle snap={snap} domain={domain} zone={zone} onPick={setDomain} hidden={hiddenRow} />
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField
          size="small"
          label="Search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setCopied(null)
          }}
          sx={{ minWidth: 220 }}
          slotProps={{ htmlInput: { 'data-testid': 'gaps-search' } }}
        />
        <ZoneHere
          zone={current}
          checked={hereOnly}
          onChange={(on) => {
            setHereOnly(on)
            setCopied(null)
          }}
        />
        <Pref label="Group by zone, then mob" checked={group.grouped} onChange={group.setGrouped} testId="gaps-grouped" />
        <Pref label="Show done" checked={showDone} onChange={setShowDone} testId="gaps-show-done" />
        <HideUncertainBox state={sure} />
        <Box sx={{ flexGrow: 1 }} />
        <CopyList onCopy={() => void copy()} disabled={visible.length === 0} copied={copied} />
      </Stack>
      <ShownLine counts={{ visible: visible.length, held, served, hidden, uncertain: sure.hidden }} domain={domain} zone={zone} />
      <GapsTable
        entries={group.entries}
        verdicts={verdicts}
        sort={sort}
        onSort={onSort}
        pageText={pageText}
        needed={needed}
        done={marks.done}
        onDone={marks.toggle}
        onPlayer={playerList.mark}
        holding={holding}
        chipContext={CHIP_CONTEXT}
        hiddenByFilter={held > 0}
        {...group.folds}
        nameLead={<GroupHeaderControls group={group} />}
      />
    </Stack>
  )
}
