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
import { Box, Button, Checkbox, CircularProgress, FormControlLabel, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { GAP_DOMAINS, GAP_DOMAIN_HELP, GAP_DOMAIN_LABELS, GAP_SHOWN_NOUN, gapsAsText, hiddenBy, visibleGaps, type GapDomain, type GapRow, type GapsSnap } from '@shared/gaps'
import { heldCaption, type HeldFilter, type HeldPick } from '@shared/gapHeld'
import { GAP_SHOW_WORDS, jobCaption, type GapShow } from '@shared/gapJob'
import { wikiPageText } from '@shared/wikiPage'
import { Tooltip } from '../../lib/Tooltip'
import { copyText } from '../../lib/clipboard'
import { useMarkGapsTabMounted } from '../../lib/gapsTabMounted'
import GapsTable from './GapsTable'
import { GAPS_DATA_DATE, PAGE_EXTRAS } from './useGapsData'
import { AllCharactersBox, CharactersLine } from './AllCharactersControls'
import type { HideUncertain } from './useHideUncertain'
import { AddQuestButton, QuestScopes } from './ForcedQuests'
import { useGrouping } from './useGrouping'
import { useGapsList } from './useGapsList'
import { useGapsOverlayFeed } from './useGapsOverlayFeed'
import CaptureBar from './CaptureBar'
import { itemRowNames } from '@shared/itemShotKeep'
import GroupHeaderControls from './GroupHeaderControls'

// One line (owner, 2026-10-11): the how is in the module header, not on the page. Since 2026-10-18
// the line says what the chosen domain's rows are (GAP_DOMAIN_HELP); since 2026-10-21 the hint is its
// tooltip (owner: "we just hit them with so much text to read").
const CLICK_HINT = 'Click a row for where it was seen.'

const CHIP_CONTEXT = { dataDate: GAPS_DATA_DATE, isMob: PAGE_EXTRAS.isMob }

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
    <Tooltip title={zone === null ? 'No zone in the log yet; zone once and this fills in.' : `Only what was seen in ${zone} or another tier of it.`}>
      <span>
        <Pref label={zone === null ? "Zone I'm in" : `Zone I'm in (${zone})`} checked={checked} onChange={onChange} disabled={zone === null} testId="gaps-zone-here" />
      </span>
    </Tooltip>
  )
}

/**
 * A small labelled select, the toolbar's control for a choice of more than two. Its tooltip never
 * shows while the menu is open (owner, 2026-10-21: "tooltip can't be ontop of the drop down").
 */
function Picker<T extends string>({ label, value, options, onChange, testId, disabled, tip }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; testId: string; disabled?: boolean; tip: string }): JSX.Element {
  const [hover, setHover] = useState(false)
  const [menu, setMenu] = useState(false)
  const select = { onOpen: () => setMenu(true), onClose: () => setMenu(false) }
  return (
    <Tooltip title={tip} placement="top" open={hover && !menu} onOpen={() => setHover(true)} onClose={() => setHover(false)}>
      <span>
        <TextField select size="small" label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)} sx={{ minWidth: 130 }} slotProps={{ htmlInput: { 'data-testid': testId }, select }}>
          {options.map(([v, text]) => (
            <MenuItem key={v} value={v}>
              {text}
            </MenuItem>
          ))}
        </TextField>
      </span>
    </Tooltip>
  )
}

const HELD_PICKS = [['off', 'Off'], ['any', 'Anywhere'], ['bags', 'In bags'], ['bank', 'In bank']] as const
const SHOW_PICKS = [['all', 'All'], ['new', 'New pages'], ['update', 'Updates'], ['ready', 'Ready']] as const
const HELD_PLACE: Record<HeldPick, string> = { off: '', any: '', bags: ' in the bags', bank: ' in the bank' }

/** "I have it" (owner, 2026-10-21): only the Items rows the player holds now, anywhere, in the bags or in the bank. */
function HeldPicker({ pick, onPick, domain }: { pick: HeldPick; onPick: (p: HeldPick) => void; domain: GapDomain }): JSX.Element {
  const title =
    domain === 'item'
      ? 'Show only items you hold, from your last /outputfile inventory plus loot since.'
      : 'Items only: shows only the items you hold now.'
  return (
    <Picker label="I have it" value={pick} options={HELD_PICKS} onChange={onPick} disabled={domain !== 'item'} testId="gaps-held-only" tip={title} />
  )
}

/** "Show" (owner, 2026-10-21): every row, only the new pages, or only the updates to pages that exist. */
function ShowPicker({ show, onShow }: { show: GapShow; onShow: (s: GapShow) => void }): JSX.Element {
  return (
    <Picker label="Show" value={show} options={SHOW_PICKS} onChange={onShow} testId="gaps-show" tip="New pages are missing from the wiki; updates are small edits to existing pages." />
  )
}

/** "Hide uncertain": the rows whose very existence as a gap is in doubt (shared/gaps.ts `uncertainGap`). */
function HideUncertainBox({ state }: { state: HideUncertain }): JSX.Element {
  return (
    <Tooltip title="Hides one-word names you only hailed or conned, which may be players.">
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
  hidden,
  heldOnly
}: {
  snap: GapsSnap
  domain: GapDomain
  zone: string | null
  onPick: (d: GapDomain) => void
  /** rows the player hid, left out of each count */
  hidden: (row: GapRow) => boolean
  /** "I have it" on: the Items count is what the player holds, and where */
  heldOnly: HeldFilter | null
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
              {d === 'item' && heldOnly !== null ? heldCaption(snap.rows, zone, hidden, heldOnly) : jobCaption(snap, d, { zone, hidden }, CHIP_CONTEXT)}
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
  mine = '',
  tail = ''
}: {
  counts: { visible: number; held: number; served: number; hidden: number; uncertain: number }
  domain: GapDomain
  zone: string | null
  /** what "I have it" and Show add: `, that you hold`, `, updates only`, or '' when off */
  mine?: string
  tail?: string
}): JSX.Element {
  const { visible, held, served, hidden, uncertain } = counts
  // A few words (owner, 2026-10-21: "we just hit them with so much text to read"); the why in the tooltip.
  return (
    <Tooltip title="The engine lists the most mentioned names; Show done brings done rows back.">
      <Typography variant="caption" color="text.secondary" data-testid="gaps-shown">
        Showing {visible} of {held} {GAP_SHOWN_NOUN[domain]}
        {mine}
        {zone !== null ? `, in ${zone}` : ''}
        {hidden > 0 ? `, ${hidden} done hidden` : ''}
        {uncertain > 0 ? `, ${uncertain} uncertain hidden` : ''}
        {held > served ? `, top ${served} listed` : ''}
        {tail}. Wiki data from {GAPS_DATA_DATE}.
      </Typography>
    </Tooltip>
  )
}

/** What "I have it" adds to the shown line: with All characters on, held means by any of them; and where. */
const mineWords = (pick: HeldPick, active: boolean, allCharacters: boolean): string =>
  !active ? '' : `${allCharacters ? ', that one of your characters holds' : ', that you hold'}${HELD_PLACE[pick]}`

/** The list's actions, at the row's right end: "Add quest" on Quests (ForcedQuests.tsx), then Copy list. */
function ListActions({ domain, onCopy, disabled, copied }: { domain: GapDomain; onCopy: () => void; disabled: boolean; copied: number | null }): JSX.Element {
  return (
    <>
      {domain === 'quest' && <AddQuestButton />}
      <Box sx={{ flexGrow: 1 }} />
      <CopyList onCopy={onCopy} disabled={disabled} copied={copied} />
    </>
  )
}

export default function GapsView(): JSX.Element {
  // The list itself, from the engine's rows to the order on screen, is the hook the Wiki Gaps
  // overlay's publisher runs too (useGapsList), so the overlay lists what this tab lists.
  const list = useGapsList()
  const { allChars, domain, setDomain, query, setQuery, hereOnly, setHereOnly, current, zone, playerList, rows, marks, showDone, setShowDone, holding, job, readiness, mine, sure, visible, verdicts, sort, onSort, sorted } = list
  const { snap, loot, kills, seenBy, joining, forced } = list.data
  // While this tab is mounted it feeds the overlay itself, and the headless publisher stands down.
  useMarkGapsTabMounted()
  useGapsOverlayFeed(list)
  const [copied, setCopied] = useState<number | null>(null)
  const hiddenRow = useMemo(() => hiddenBy(marks.done, showDone, sure.hide), [marks.done, showDone, sure.hide])
  // Where a capture from the game can be filed (phase 3): every item row, not only the ones on screen.
  const itemNames = useMemo(() => itemRowNames(rows ?? []), [rows])
  // What the pages read beside the ledgers (each kill's factions, each mob's points, the install's spell
  // files, the kept screenshots) and what each row still lacks come from the list (useGapReady).
  const { sightings, needed } = readiness
  const pageText = useCallback((row: GapRow) => wikiPageText(row, loot, kills, sightings), [loot, kills, sightings])
  // "Group by zone, then mob" (owner ask, 2026-10-18), its heading order and its folds (useGrouping).
  const group = useGrouping(sorted, loot, zone)

  if (!snap) return <CircularProgress size={20} />

  const copy = async (): Promise<void> => {
    const ok = await copyText(gapsAsText(sorted, verdicts))
    setCopied(ok ? visible.length : null)
  }
  const held = snap.totals[domain] ?? 0
  const served = visibleGaps(rows ?? [], domain, '').length
  const hidden = sure.rows.length - visible.length

  // A full-height column whose last child, the table box, is the page's only scroller (GapsTable).
  // A quest row's Copy reads its live page against the same page context; Add quest / Add talk name quests (ForcedQuests).
  return (
    <QuestScopes extras={sightings} forced={forced}>
    <Stack spacing={2} data-testid="gaps-view" sx={{ height: '100%', minHeight: 0 }}>
      <Tooltip title={CLICK_HINT}>
        <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'flex-start' }}>
          {GAP_DOMAIN_HELP[domain]}
        </Typography>
      </Tooltip>
      {/* Two rows (owner, 2026-10-20: "put search and all the values after that on the next row
          instead of next to the tabs"): the domains alone, then what narrows them, Copy list last. */}
      <DomainToggle snap={snap} domain={domain} zone={zone} onPick={setDomain} hidden={hiddenRow} heldOnly={mine.pick === 'off' ? null : { index: holding, where: mine.pick }} />
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
        <ShowPicker show={job.show} onShow={job.setShow} />
        <HeldPicker pick={mine.pick} onPick={mine.setPick} domain={domain} />
        <Pref label="Group by zone, then mob" checked={group.grouped} onChange={group.setGrouped} testId="gaps-grouped" />
        <Pref label="Show done" checked={showDone} onChange={setShowDone} testId="gaps-show-done" />
        <HideUncertainBox state={sure} />
        <AllCharactersBox on={allChars.on} onChange={allChars.setOn} days={allChars.days} onDays={allChars.setDays} working={allChars.others === undefined || joining} />
        <ListActions domain={domain} onCopy={() => void copy()} disabled={visible.length === 0} copied={copied} />
      </Stack>
      {domain === 'item' && <CaptureBar rows={itemNames} />}
      <ShownLine counts={{ visible: visible.length, held, served, hidden, uncertain: sure.hidden }} domain={domain} zone={zone} mine={mineWords(mine.pick, mine.active, allChars.on) + GAP_SHOW_WORDS[job.show]} tail={allChars.caption} />
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
    </QuestScopes>
  )
}
