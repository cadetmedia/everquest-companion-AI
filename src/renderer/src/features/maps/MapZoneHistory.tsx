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
  MIN_STRETCH_KILLS,
  PEAK_WINDOW_MS,
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
import { useComboIntervals } from '../profiles/ClassComboData'

const GOALS: readonly { goal: HistoryGoal; label: string }[] = [
  { goal: 'levels', label: 'Leveling' },
  { goal: 'aa', label: 'AA' },
  { goal: 'coin', label: 'Coin' },
  { goal: 'motes', label: 'Motes' },
  { goal: 'kills', label: 'Kills' }
]

const fixed = (n: number | null, digits: number): string => (n === null ? '-' : n.toFixed(digits))

const PEAK_MIN = PEAK_WINDOW_MS / 60_000

type Cell = (r: ZoneHistoryRow, best: boolean) => string

/** The columns after the zone, each with the order a click on its head puts the table in. A rate
 *  column prints the zone's average, or its best stretch when the switch says so. */
const COLUMNS: readonly { sort: HistorySort; head: string; cell: Cell }[] = [
  { sort: 'time', head: 'Active time', cell: (r) => fmtDuration(r.activeMs) },
  { sort: 'levels', head: 'Levels/hr', cell: (r, best) => fixed(best ? r.peak.levels : r.levelsPerHour, 2) },
  { sort: 'aa', head: 'AA/hr', cell: (r, best) => fixed(best ? r.peak.aa : r.aaPerHour, 2) },
  { sort: 'coin', head: 'pp/hr', cell: (r, best) => fixed((best ? r.peak.coin : r.coinPerHour) / 1000, 1) },
  { sort: 'motes', head: 'Motes/hr', cell: (r, best) => fixed(best ? r.peak.motes : r.motesPerHour, 2) },
  { sort: 'kills', head: 'Kills/hr', cell: (r, best) => fixed(best ? r.peak.kills : r.killsPerHour, 0) },
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
  best,
  onSort,
  onPick
}: {
  rows: readonly ZoneHistoryRow[]
  sort: HistorySort
  best: boolean
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
                  {c.cell(r, best)}
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
  const loadouts = useDeferredValue(useComboIntervals())
  const [levelText, setLevelText] = useLevelField(live)
  const [sort, setSort] = useState<HistorySort>('levels')
  const [search, setSearch] = useState('')
  const [best, setBest] = useState(false)
  const level = Number.parseInt(levelText, 10)
  const all = useMemo(
    () => (Number.isFinite(level) && level > 0 ? zoneHistory({ snap, loot, level, loadouts }) : []),
    [snap, loot, level, loadouts]
  )
  const rows = useMemo(() => rankHistory(all, sort, search, best), [all, sort, search, best])
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
        <ToggleButtonGroup
          size="small"
          exclusive
          value={best ? 'best' : 'average'}
          onChange={(_e, next: string | null) => {
            if (next !== null) setBest(next === 'best')
          }}
        >
          <ToggleButton value="average" sx={{ py: 0.25 }}>
            Average
          </ToggleButton>
          <ToggleButton value="best" sx={{ py: 0.25 }} data-testid="zone-history-best">
            Best {PEAK_MIN} min
          </ToggleButton>
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
        From your own log: time you spent in each zone within {LEVEL_SPREAD} levels of this level.{' '}
        {best
          ? `Best ${String(PEAK_MIN)} min: your best stretch there (kills with no gap over 5 minutes, at least ${String(MIN_STRETCH_KILLS)} kills and 10 minutes), its best ${String(PEAK_MIN)} minutes as an hourly rate - what the zone pays when you farm the right thing.`
          : 'Average: per active hour (not idle, not logged out), everything you did there.'}{' '}
        Zones with under {MIN_ACTIVE_MS / 60_000} minutes there are dimmed and listed last.
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
        <HistoryTable rows={rows} sort={sort} best={best} onSort={setSort} onPick={onPick} />
      )}
    </Paper>
  )
}
