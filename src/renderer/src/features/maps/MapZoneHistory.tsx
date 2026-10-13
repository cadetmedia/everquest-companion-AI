// maps/MapZoneHistory.tsx — "Your best zones": the zones you have spent time in, ranked by what
// you actually got there per active hour, around a level (owner ask, 2026-10-13). The ranking and
// every rate are shared/zoneHistory.ts's; this file owns the level, goal and search, and draws.

import { useDeferredValue, useMemo, useState, type JSX } from 'react'
import {
  Box,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material'
import type { ProgressionSnap } from '@shared/types'
import {
  LEVEL_SPREAD,
  MIN_ACTIVE_MS,
  rankHistory,
  zoneHistory,
  type HistoryGoal,
  type HistorySort,
  type ZoneHistoryRow
} from '@shared/zoneHistory'
import { useModule } from '../../lib/useModule'
import { EMPTY_PROGRESSION } from '../leveling/progressionDelta'
import { fmtDuration } from '../leveling/levelChartGeometry'
import { useStatedLevel } from '../leveling/useStatedLevel'
import { useLootHistory } from '../loot/useLootHistory'

const GOALS: readonly { goal: HistoryGoal; label: string }[] = [
  { goal: 'levels', label: 'Leveling' },
  { goal: 'aa', label: 'AA' },
  { goal: 'coin', label: 'Coin' },
  { goal: 'motes', label: 'Motes' },
  { goal: 'kills', label: 'Kills' }
]

const fixed = (n: number | null, digits: number): string => (n === null ? '-' : n.toFixed(digits))

/** The columns after the zone, each with the order a click on its head puts the table in. */
const COLUMNS: readonly { sort: HistorySort; head: string; cell: (r: ZoneHistoryRow) => string }[] = [
  { sort: 'time', head: 'Active time', cell: (r) => fmtDuration(r.activeMs) },
  { sort: 'levels', head: 'Levels/hr', cell: (r) => fixed(r.levelsPerHour, 2) },
  { sort: 'aa', head: 'AA/hr', cell: (r) => fixed(r.aaPerHour, 2) },
  { sort: 'coin', head: 'pp/hr', cell: (r) => fixed(r.coinPerHour / 1000, 1) },
  { sort: 'motes', head: 'Motes/hr', cell: (r) => fixed(r.motesPerHour, 2) },
  { sort: 'kills', head: 'Kills/hr', cell: (r) => fixed(r.killsPerHour, 0) },
  { sort: 'deaths', head: 'Deaths', cell: (r) => String(r.deaths) }
]

function ZoneName({ row, onPick }: { row: ZoneHistoryRow; onPick?: (zone: string) => void }): JSX.Element {
  const { short } = row
  if (short === null || onPick === undefined) return <>{row.zone}</>
  return (
    <Link
      component="button"
      variant="body2"
      underline="hover"
      title="Open the map"
      onClick={() => {
        onPick(short)
      }}
    >
      {row.zone}
    </Link>
  )
}

function HistoryTable({
  rows,
  sort,
  onSort,
  onPick
}: {
  rows: readonly ZoneHistoryRow[]
  sort: HistorySort
  onSort: (next: HistorySort) => void
  onPick?: (zone: string) => void
}): JSX.Element {
  const label = (key: HistorySort, text: string): JSX.Element => (
    <TableSortLabel
      active={sort === key}
      direction={key === 'zone' ? 'asc' : 'desc'}
      onClick={() => {
        onSort(key)
      }}
    >
      {text}
    </TableSortLabel>
  )
  return (
    <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }}>
      <Table size="small" stickyHeader data-testid="zone-history-table">
        <TableHead>
          <TableRow>
            <TableCell>{label('zone', 'Zone')}</TableCell>
            {COLUMNS.map((c) => (
              <TableCell key={c.head} align="right" sx={{ fontWeight: c.sort === sort ? 700 : undefined }}>
                {label(c.sort, c.head)}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow
              key={r.key}
              data-testid="zone-history-row"
              title={r.enough ? undefined : `Under ${String(MIN_ACTIVE_MS / 60_000)} minutes active here at this level: listed, not ranked`}
              sx={{ opacity: r.enough ? 1 : 0.5 }}
            >
              <TableCell>
                <ZoneName row={r} onPick={onPick} />
              </TableCell>
              {COLUMNS.map((c) => (
                <TableCell
                  key={c.head}
                  align="right"
                  sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: c.sort === sort ? 700 : undefined }}
                >
                  {c.cell(r)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  )
}

/** The level starts as yours and becomes the typed one, as on "Where to level". */
function useLevelField(snap: ProgressionSnap): [string, (v: string) => void] {
  const stated = useStatedLevel(snap).level
  const [typed, setTyped] = useState<string | null>(null)
  return [typed ?? (stated === null ? '' : String(stated)), setTyped]
}

export default function MapZoneHistory({ onPick }: { onPick?: (zone: string) => void }): JSX.Element {
  const live = useModule<ProgressionSnap>('progression') ?? EMPTY_PROGRESSION
  // The fold walks every stretch of the log; it follows the live snapshot a render behind.
  const snap = useDeferredValue(live)
  const loot = useDeferredValue(useLootHistory())
  const [levelText, setLevelText] = useLevelField(live)
  const [sort, setSort] = useState<HistorySort>('levels')
  const [search, setSearch] = useState('')
  const level = Number.parseInt(levelText, 10)
  const all = useMemo(
    () => (Number.isFinite(level) && level > 0 ? zoneHistory({ snap, loot, level }) : []),
    [snap, loot, level]
  )
  const rows = useMemo(() => rankHistory(all, sort, search), [all, sort, search])
  return (
    <Paper
      variant="outlined"
      data-testid="zone-history"
      sx={{ p: 1, display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0 }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ pb: 1 }}>
        <TextField
          size="small"
          label="Level"
          value={levelText}
          onChange={(e) => {
            setLevelText(e.target.value.replace(/\D/g, ''))
          }}
          sx={{ width: 80 }}
          slotProps={{ htmlInput: { 'data-testid': 'zone-history-level', inputMode: 'numeric' } }}
        />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={sort}
          onChange={(_e, next: HistoryGoal | null) => {
            if (next !== null) setSort(next)
          }}
        >
          {GOALS.map((g) => (
            <ToggleButton key={g.goal} value={g.goal} sx={{ py: 0.25 }} data-testid={`zone-history-goal-${g.goal}`}>
              {g.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <TextField
          size="small"
          placeholder="Search zones"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
          }}
          sx={{ flex: '1 1 160px' }}
        />
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ pb: 0.5 }}>
        From your own log: time you spent in each zone within {LEVEL_SPREAD} levels of this level, per
        active hour (not idle, not logged out). Zones with under {MIN_ACTIVE_MS / 60_000} minutes there
        are dimmed and listed last.
      </Typography>
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.disabled" data-testid="zone-history-empty" sx={{ p: 2 }}>
          {Number.isFinite(level) && level > 0
            ? search.trim() === ''
              ? `Your log has no active time within ${String(LEVEL_SPREAD)} levels of ${String(level)}.`
              : 'No zone matches the search.'
            : 'Type a level.'}
        </Typography>
      ) : (
        <HistoryTable rows={rows} sort={sort} onSort={setSort} onPick={onPick} />
      )}
    </Paper>
  )
}
