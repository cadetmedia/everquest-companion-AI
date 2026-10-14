// THE GAPS TAB — names the log mentions that the app's wiki data has no record of (owner ask,
// 2026-10-11): a diagnostics list, so the gaps can be fixed in the scrape or on the wiki.
//
// The engine's `gaps` module (engine/crates/fold/src/modules/gaps.rs) checks every item looted,
// received, bought or crafted, every mob looted, killed or considered, and every spell cast against
// the committed data, without ever asking the app to fetch. It serves one row per unknown name,
// most mentioned first, 500 per domain at most. The domain toggle and the search box narrow those
// rows in shared/gaps.ts; "Copy list" puts the visible rows on the clipboard as tab-separated text.

import { type JSX, useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Button, CircularProgress, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import {
  DEFAULT_GAP_SORT,
  GAPS_MODULE_ID,
  GAP_DOMAINS,
  GAP_DOMAIN_LABELS,
  firstGapSortDir,
  gapsAsText,
  gapsCaption,
  sortGaps,
  visibleGaps,
  type GapDomain,
  type GapSort,
  type GapSortKey,
  type GapsSnap
} from '@shared/gaps'
import { useModule } from '../../lib/useModule'
import { copyText } from '../../lib/clipboard'
import { useGapVerdicts } from '../../lib/gapVerdicts'
import GapsTable from './GapsTable'

// One line (owner, 2026-10-11): the how is in the module header, not on the page.
const EXPLANATION = 'Differences between what your log names and what the wiki data holds. Click a row for where it was seen.'

function DomainToggle({ snap, domain, onPick }: { snap: GapsSnap; domain: GapDomain; onPick: (d: GapDomain) => void }): JSX.Element {
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
              {gapsCaption(snap, d)}
            </Typography>
          </Stack>
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}

export default function GapsView(): JSX.Element {
  const snap = useModule<GapsSnap>(GAPS_MODULE_ID)
  const [domain, setDomain] = useState<GapDomain>('item')
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState<number | null>(null)
  const rows = snap?.rows
  // The list follows the query a beat behind the keystroke, so typing never waits on a filter.
  const deferredQuery = useDeferredValue(query)
  const visible = useMemo(() => visibleGaps(rows ?? [], domain, deferredQuery), [rows, domain, deferredQuery])
  // What the caches already say about the rows on screen: `unchecked` until the answer lands.
  const verdicts = useGapVerdicts(domain, visible)
  const [sort, setSort] = useState<GapSort>(DEFAULT_GAP_SORT)
  const onSort = useCallback((key: GapSortKey) => {
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: firstGapSortDir(key) }))
  }, [])
  // The table and Copy list read the same order, so a copied list matches what is on screen.
  const sorted = useMemo(() => sortGaps(visible, sort, verdicts), [visible, sort, verdicts])

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
        {EXPLANATION}
      </Typography>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <DomainToggle snap={snap} domain={domain} onPick={setDomain} />
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
        {held > served ? ` (the engine serves the ${served} most mentioned)` : ''}.
      </Typography>
      <GapsTable rows={sorted} verdicts={verdicts} sort={sort} onSort={onSort} />
    </Stack>
  )
}
