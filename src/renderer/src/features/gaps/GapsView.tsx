// THE GAPS TAB — names the log mentions that the app's wiki data has no record of (owner ask,
// 2026-10-11): a diagnostics list, so the gaps can be fixed in the scrape or on the wiki.
//
// The engine's `gaps` module (engine/crates/fold/src/modules/gaps.rs) checks every item looted,
// received, bought or crafted, every mob looted, killed or considered, and every spell cast against
// the committed data, without ever asking the app to fetch. It serves one row per unknown name,
// most mentioned first, 500 per domain at most. The domain toggle and the search box narrow those
// rows in shared/gaps.ts; "Copy list" puts the visible rows on the clipboard as tab-separated text.

import { type JSX, useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Button, Checkbox, CircularProgress, FormControlLabel, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import {
  DEFAULT_GAP_SORT,
  GAPS_MODULE_ID,
  GAP_DOMAINS,
  GAP_DOMAIN_HELP,
  GAP_DOMAIN_LABELS,
  firstGapSortDir,
  gapsAsText,
  gapsCaption,
  sortGaps,
  visibleGaps,
  type GapDomain,
  type GapRow,
  type GapSort,
  type GapSortKey,
  type GapsSnap
} from '@shared/gaps'
import type { CharacterSnap, LootSnap } from '@shared/types'
import { killIndex, type KillsSnap } from '@shared/kills'
import { wikiPageText } from '@shared/wikiPage'
import { groupGaps, rowEntries } from '@shared/gapGroups'
import { withFactionRows } from '@shared/gapFactions'
import { lootedItemNames, withDropRows, type DropGroups } from '@shared/gapDrops'
import { withImageRows } from '@shared/gapImages'
import dropGroupsJson from '../../data/eqlegends/dropGroups.json'
import { MOB_CATALOG } from '../mobs/mobSearch'
import { useModule } from '../../lib/useModule'
import { Tooltip } from '../../lib/Tooltip'
import { useBoolPref } from '../combat/useCombatPrefs'
import { copyText } from '../../lib/clipboard'
import { useGapVerdicts } from '../../lib/gapVerdicts'
import { useItemMobs } from '../../lib/gapItemMobs'
import GapsTable from './GapsTable'

// One line (owner, 2026-10-11): the how is in the module header, not on the page. Since 2026-10-18
// the line says what the chosen domain's rows are (GAP_DOMAIN_HELP).
const CLICK_HINT = 'Click a row for where it was seen.'

/** Where the "Zone I'm in" choice is remembered, per viewer, as the Achievements tab remembers its own. */
const ZONE_HERE_KEY = 'eq.gaps.zoneHere'
/** Each drop group's members (scrape-drop-groups.ts). */
const DROP_GROUPS: DropGroups = (dropGroupsJson as { groups: DropGroups }).groups

/** Where the grouped view is remembered. */
const GROUPED_KEY = 'eq.gaps.grouped'

/** "Zone I'm in (<zone>)", the Achievements tab's control: only the rows seen in that place, any tier. */
function ZoneHere({ zone, checked, onChange }: { zone: string | null; checked: boolean; onChange: (on: boolean) => void }): JSX.Element {
  return (
    <Tooltip
      title={
        zone === null
          ? 'The log has not named a zone yet. Zone once and this fills in.'
          : `Only what was seen in ${zone} or another tier of it.`
      }
    >
      <FormControlLabel
        sx={{ mr: 0 }}
        control={
          <Checkbox
            size="small"
            checked={checked}
            disabled={zone === null}
            data-testid="gaps-zone-here"
            onChange={(e) => {
              onChange(e.target.checked)
            }}
            sx={{ p: 0.5 }}
          />
        }
        label={<Typography variant="caption">{zone === null ? "Zone I'm in" : `Zone I'm in (${zone})`}</Typography>}
      />
    </Tooltip>
  )
}

function DomainToggle({
  snap,
  domain,
  zone,
  onPick
}: {
  snap: GapsSnap
  domain: GapDomain
  zone: string | null
  onPick: (d: GapDomain) => void
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
              {gapsCaption(snap, d, zone)}
            </Typography>
          </Stack>
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}

export default function GapsView(): JSX.Element {
  const fromEngine = useModule<GapsSnap>(GAPS_MODULE_ID)
  const loot = useModule<LootSnap>('loot')
  const killMobs = useModule<KillsSnap>('kills')?.mobs
  // The item pages' side of each drop, asked of main (the corpus is main-only).
  const looted = useMemo(() => lootedItemNames(loot ?? []), [loot])
  const itemMobs = useItemMobs(looted)
  // Factions a kill moved, drops and images a mob's page lacks, checked against the catalog here.
  const snap = useMemo(() => {
    if (!fromEngine) return fromEngine
    const derived = withDropRows(withFactionRows(fromEngine, MOB_CATALOG), loot ?? [], { catalog: MOB_CATALOG, groups: DROP_GROUPS, itemMobs })
    return withImageRows(derived, killMobs ?? {}, loot ?? [], MOB_CATALOG)
  }, [fromEngine, loot, killMobs, itemMobs])
  const [domain, setDomain] = useState<GapDomain>('item')
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState<number | null>(null)
  // "Zone I'm in" (owner ask, 2026-10-17): only what was named where you stand, every tier of it,
  // so a zone can be worked through. With no zone known it filters nothing.
  const [hereOnly, setHereOnly] = useBoolPref(ZONE_HERE_KEY, false)
  const current = useModule<CharacterSnap>('character')?.zone ?? null
  const zone = hereOnly ? current : null
  const rows = snap?.rows
  // The list follows the query a beat behind the keystroke, so typing never waits on a filter.
  const deferredQuery = useDeferredValue(query)
  const visible = useMemo(() => visibleGaps(rows ?? [], domain, deferredQuery, zone), [rows, domain, deferredQuery, zone])
  // What the caches already say about the rows on screen: `unchecked` until the answer lands.
  const verdicts = useGapVerdicts(domain, visible)
  const [sort, setSort] = useState<GapSort>(DEFAULT_GAP_SORT)
  const onSort = useCallback((key: GapSortKey) => {
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: firstGapSortDir(key) }))
  }, [])
  // The table and Copy list read the same order, so a copied list matches what is on screen.
  const sorted = useMemo(() => sortGaps(visible, sort, verdicts), [visible, sort, verdicts])
  // A row's wiki page joins its loot (which mob, which zone) and the kills behind each drop.
  const kills = useMemo(() => killIndex(killMobs ?? {}), [killMobs])
  const pageText = useCallback((row: GapRow) => wikiPageText(row, loot ?? [], kills, fromEngine ?? {}), [loot, kills, fromEngine])
  // "Group by zone, then mob" (owner ask, 2026-10-18): where to go and what to kill.
  const [grouped, setGrouped] = useBoolPref(GROUPED_KEY, false)
  const entries = useMemo(() => (grouped ? groupGaps(sorted, loot ?? []) : rowEntries(sorted)), [grouped, sorted, loot])

  if (!snap) return <CircularProgress size={20} />

  const copy = async (): Promise<void> => {
    const ok = await copyText(gapsAsText(sorted, verdicts))
    setCopied(ok ? visible.length : null)
  }
  const held = snap.totals[domain] ?? 0
  const served = visibleGaps(rows ?? [], domain, '').length

  return (
    // A full-height column whose last child, the table box, is the page's only scroller (GapsTable).
    <Stack spacing={2} data-testid="gaps-view" sx={{ height: '100%', minHeight: 0 }}>
      <Typography variant="body2" color="text.secondary">
        {GAP_DOMAIN_HELP[domain]} {CLICK_HINT}
      </Typography>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <DomainToggle snap={snap} domain={domain} zone={zone} onPick={setDomain} />
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
        <FormControlLabel
          sx={{ mr: 0 }}
          control={<Checkbox size="small" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} sx={{ p: 0.5 }} data-testid="gaps-grouped" />}
          label={<Typography variant="caption">Group by zone, then mob</Typography>}
        />
        <Button size="small" variant="outlined" startIcon={<ContentCopyIcon />} onClick={() => void copy()} disabled={visible.length === 0} data-testid="gaps-copy">
          Copy list
        </Button>
        {copied !== null && (
          <Typography variant="caption" color="success.main">
            Copied {copied} rows
          </Typography>
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {visible.length} of {held} unknown {GAP_DOMAIN_LABELS[domain].toLowerCase()} shown
        {zone !== null ? `, seen in ${zone} or another tier of it` : ''}
        {held > served ? ` (the engine serves the ${served} most mentioned)` : ''}.
      </Typography>
      <GapsTable entries={entries} verdicts={verdicts} sort={sort} onSort={onSort} pageText={pageText} hiddenByFilter={held > 0} />
    </Stack>
  )
}
