// THE GAPS TAB — names the log mentions that the app's wiki data has no record of (owner ask,
// 2026-10-11): a diagnostics list, so the gaps can be fixed in the scrape or on the wiki.
//
// The engine's `gaps` module (engine/crates/fold/src/modules/gaps.rs) checks every item looted,
// received, bought or crafted, every mob looted, killed, considered or hailed, and every spell cast
// against the committed data, without ever asking the app to fetch. It serves one row per unknown
// name, most mentioned first, 500 per domain at most; useGapsData joins the domains derived here.
// The domain toggle and the search box narrow those rows in shared/gaps.ts; "Copy list" puts the
// visible rows on the clipboard as tab-separated text.

import { type JSX, useCallback, useMemo, useState } from 'react'
import { Box, Button, Checkbox, CircularProgress, FormControlLabel, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { GAP_DOMAINS, GAP_DOMAIN_HELP, GAP_DOMAIN_LABELS, GAP_SHOWN_NOUN, gapsAsText, gapsCaption, hiddenBy, visibleGaps, type GapDomain, type GapRow, type GapsSnap } from '@shared/gaps'
import { stillNeeded, wikiPageText } from '@shared/wikiPage'
import { Tooltip } from '../../lib/Tooltip'
import { copyText } from '../../lib/clipboard'
import { useSpellFacts } from '../../lib/gapSpellFacts'
import { useMarkGapsTabMounted } from '../../lib/gapsTabMounted'
import GapsTable from './GapsTable'
import { GAPS_DATA_DATE, PAGE_EXTRAS } from './useGapsData'
import { AllCharactersBox, CharactersLine } from './AllCharactersControls'
import { useAllHeld } from './useAllHeld'
import type { HideUncertain } from './useHideUncertain'
import { useGrouping } from './useGrouping'
import { useGapsList } from './useGapsList'
import { useGapsOverlayFeed } from './useGapsOverlayFeed'
import GroupHeaderControls from './GroupHeaderControls'

// One line (owner, 2026-10-11): the how is in the module header, not on the page. Since 2026-10-18
// the line says what the chosen domain's rows are (GAP_DOMAIN_HELP).
const CLICK_HINT = 'Click a row for where it was seen.'

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

/** What the pages read beside the ledgers, from the engine's snapshot (useGapsData). */
function sightingsOf(engine: GapsSnap | null | undefined, spellFacts: ReturnType<typeof useSpellFacts>) {
  return { killFactions: engine?.killFactions, mobLocs: engine?.mobLocs, mobSpecials: engine?.mobSpecials, mobCoin: engine?.mobCoin, ...PAGE_EXTRAS, spellFacts }
}

export default function GapsView(): JSX.Element {
  // The list itself, from the engine's rows to the order on screen, is the hook the Wiki Gaps
  // overlay's publisher runs too (useGapsList), so the overlay lists what this tab lists.
  const list = useGapsList()
  const { me, allChars, domain, setDomain, query, setQuery, hereOnly, setHereOnly, current, zone, playerList, rows, marks, showDone, setShowDone, sure, visible, verdicts, sort, onSort, sorted } = list
  const { snap, engine, loot, ownLoot, kills, seenBy, joining } = list.data
  // While this tab is mounted it feeds the overlay itself, and the headless publisher stands down.
  useMarkGapsTabMounted()
  useGapsOverlayFeed(list)
  const [copied, setCopied] = useState<number | null>(null)
  const hiddenRow = useMemo(() => hiddenBy(marks.done, showDone, sure.hide), [marks.done, showDone, sure.hide])
  // What the pages read beside the ledgers: each kill's factions, each mob's points, the wiki's spellings.
  // A spell page fills from the install's spell files (owner, 2026-10-19): asked for the spells on screen.
  const spellNames = useMemo(() => (domain === 'spell' ? spellNamesOf(visible) : NO_NAMES), [domain, visible])
  const spellFacts = useSpellFacts(spellNames)
  const sightings = useMemo(() => sightingsOf(engine, spellFacts), [engine, spellFacts])
  const pageText = useCallback((row: GapRow) => wikiPageText(row, loot, kills, sightings), [loot, kills, sightings])
  const needed = useCallback((row: GapRow) => stillNeeded(row, loot, kills, sightings), [loot, kills, sightings])
  // "Group by zone, then mob" (owner ask, 2026-10-18), its heading order and its folds (useGrouping).
  const group = useGrouping(sorted, loot, zone)
  // An item a character holds right now needs only a screenshot (review C6; owner, 2026-10-19): each
  // character's own export plus ITS loot since, named per holder while All characters is on.
  const holding = useAllHeld(ownLoot, me, allChars)

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
        <AllCharactersBox on={allChars.on} onChange={allChars.setOn} days={allChars.days} onDays={allChars.setDays} working={allChars.others === undefined || joining} />
        <Box sx={{ flexGrow: 1 }} />
        <CopyList onCopy={() => void copy()} disabled={visible.length === 0} copied={copied} />
      </Stack>
      <ShownLine counts={{ visible: visible.length, held, served, hidden, uncertain: sure.hidden }} domain={domain} zone={zone} tail={allChars.caption} />
      {allChars.on && <CharactersLine live={allChars.liveLabel} others={allChars.others} />}
      <GapsTable
        entries={group.entries}
        verdicts={verdicts}
        sort={sort}
        onSort={onSort}
        pageText={pageText}
        needed={needed}
        done={marks.done}
        onDone={marks.toggle}
        onDoneAll={marks.setMany}
        onPlayer={playerList.mark}
        holding={holding}
        chipContext={CHIP_CONTEXT}
        seenBy={seenBy}
        hiddenByFilter={held > 0}
        {...group.folds}
        nameLead={<GroupHeaderControls group={group} />}
      />
    </Stack>
  )
}
