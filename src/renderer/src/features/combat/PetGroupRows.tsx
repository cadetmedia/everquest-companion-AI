// THE "WITH ITS OWNER" LEVEL 1 on the Combat tab (Malkil, 2026-10-21;
// docs/community/plans/2026-10-20-meter-pet-split.md). A pair is two lines, master then pet, over
// one shared bar at the pair's length; anything else is one line. Every bar is its own true length
// and text never sizes one, so a near-zero pair stays a sliver below the rows that out-damage it.
// Every row ends in a total box, and the boxes share one column down the list. The overlay draws the
// same rows in plain React (overlay/petGroupBars.tsx): keep the two in step.

import { memo } from 'react'
import { Box, Chip, Stack, Typography } from '@mui/material'
import { KIND_COLOR } from './combatShared'
import { KindChip, StatBadges } from './EntityRow'
import { formatNum as fmt, formatRate } from '../../lib/formatRate'
import { Tooltip } from '../../lib/Tooltip'
import type { Drill } from './dashboardData'
import type { PetGroupLine, PetGroupRow } from '@shared/combatPetGroups'
import type { SourceView } from '@shared/combat'

/** The pair's third colour: the shared bar and every row's total box. The overlay's copy matches. */
const GROUP_COLOR = '#4a4366'
const LINE_H = 22
/**
 * The list is one grid and each row a subgrid of it, so the box column is as wide as the widest
 * box's text and no wider (Malkil, 2026-10-21: the fixed box was "much wider than it needs to be").
 * Every bar track is the same width, so a row's own text never sizes its bar.
 */
const COLUMNS = 'minmax(0, 1fr) minmax(48px, max-content)'

/** The same name-ambiguity badge `EntityRow` carries: it belongs to the number, on any line. */
function AmbiguousChip({ e }: { e: SourceView }): React.JSX.Element {
  return (
    <Tooltip
      title={`${e.ambiguousHits} hit${e.ambiguousHits === 1 ? '' : 's'} (${fmt(
        e.ambiguousTotal
      )} dmg) are name-ambiguous: a same-named hostile twin exists, so this damage could belong to the twin rather than your pet.`}
    >
      <Chip label="~" size="small" sx={{ ml: 0.5, height: 14, fontSize: 10, fontWeight: 700, bgcolor: 'rgba(207,102,121,0.25)' }} />
    </Tooltip>
  )
}

/**
 * One line: its own fill, its name, and (in a pair) its own figures. The first line carries the
 * rank, the kind chip and the hit/resist badges; a paired pet shows its name only (Malkil: "we
 * already know it's a pet when it's on the same line as a player").
 */
function GroupLine({
  line,
  rank,
  pair,
  onDrill
}: {
  line: PetGroupLine
  /** set on the first line only. */
  rank: number | null
  pair: boolean
  onDrill?: () => void
}): React.JSX.Element {
  const e = line.source
  const lead = rank !== null
  const crit = e.critPct >= 1 ? `${Math.round(e.critPct)}% crit` : ''
  const right = pair ? `${fmt(e.total)} · ${formatRate(e.dps)}${crit ? ` · ${crit}` : ''}` : crit
  return (
    <Box
      data-testid="meter-group-line"
      onClick={onDrill}
      sx={{ position: 'relative', minWidth: 0, cursor: onDrill ? 'pointer' : 'default', '&:hover .group-fill': { opacity: 0.7 } }}
    >
      <Box
        className="group-fill"
        sx={{
          position: 'absolute',
          top: '1px',
          bottom: '1px',
          left: 0,
          width: `${e.total > 0 ? Math.max(0.5, line.pct) : 0}%`,
          bgcolor: KIND_COLOR[e.kind] ?? '#888',
          opacity: 0.5,
          borderRadius: 0.5
        }}
      />
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ position: 'absolute', inset: 0, px: 0.75 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', width: 16, flexShrink: 0, textAlign: 'right' }}>
          {rank ?? ''}
        </Typography>
        <Typography variant="caption" noWrap sx={{ fontWeight: 600, flexGrow: 1, minWidth: 0 }}>
          {line.label}
          {lead && <KindChip kind={e.kind} />}
          {e.ambiguousHits > 0 && <AmbiguousChip e={e} />}
          {lead && <StatBadges e={e} />}
        </Typography>
        {right && (
          <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
            {right}
          </Typography>
        )}
      </Stack>
    </Box>
  )
}

/** The box every row ends in: a pair's dps over its damage, a lone row's on one line. */
function TotalBox({ row, pair }: { row: PetGroupRow; pair: boolean }): React.JSX.Element {
  return (
    <Box
      data-testid="meter-group-total"
      sx={{
        borderRadius: 0.5,
        bgcolor: GROUP_COLOR,
        px: 0.75,
        display: 'flex',
        flexDirection: pair ? 'column' : 'row',
        justifyContent: 'center',
        alignItems: pair ? 'flex-end' : 'center',
        fontVariantNumeric: 'tabular-nums'
      }}
    >
      {pair ? (
        <>
          <Typography variant="caption" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
            {formatRate(row.dps)}
          </Typography>
          <Typography variant="caption" sx={{ lineHeight: 1.3, color: 'rgba(255,255,255,0.75)' }}>
            {fmt(row.total)}
          </Typography>
        </>
      ) : (
        <Typography variant="caption" noWrap sx={{ ml: 'auto' }}>
          {`${formatRate(row.dps)} · ${fmt(row.total)}`}
        </Typography>
      )}
    </Box>
  )
}

const GroupRow = memo(
  function GroupRow({
    row,
    rank,
    onDrill
  }: {
    row: PetGroupRow
    rank: number
    onDrill?: (e: SourceView) => void
  }): React.JSX.Element {
    const pair = row.lines.length > 1
    return (
      <Box
        data-testid="meter-group-row"
        sx={{ display: 'grid', gridColumn: '1 / -1', gridTemplateColumns: 'subgrid', mb: '3px', height: LINE_H * row.lines.length }}
      >
        <Box
          sx={{
            position: 'relative',
            minWidth: 0,
            borderRadius: 0.5,
            overflow: 'hidden',
            bgcolor: 'rgba(255,255,255,0.04)',
            display: 'grid',
            gridTemplateRows: `repeat(${row.lines.length}, 1fr)`
          }}
        >
          {/* The pair's shared bar, behind both lines, at the pair's own length. */}
          {pair && (
            <Box
              data-testid="meter-group-shared"
              sx={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${row.pct}%`, bgcolor: GROUP_COLOR, opacity: 0.8 }}
            />
          )}
          {row.lines.map((l, i) => (
            <GroupLine
              key={l.source.id}
              line={l}
              rank={i === 0 ? rank : null}
              pair={pair}
              onDrill={onDrill ? () => onDrill(l.source) : undefined}
            />
          ))}
        </Box>
        <TotalBox row={row} pair={pair} />
      </Box>
    )
  },
  // Value-equality gate, EntityRow's reason: a frozen fight's rows are rebuilt every snapshot tick.
  (a, b) => a.rank === b.rank && !!a.onDrill === !!b.onDrill && JSON.stringify(a.row) === JSON.stringify(b.row)
)

/** Level 1 in the grouped layout: every row, ranked. A line drills its own source. */
export function PetGroupRows({
  groups,
  setDrill
}: {
  groups: PetGroupRow[]
  setDrill: ((d: Drill | null) => void) | null
}): React.JSX.Element {
  const onDrill = setDrill ? (e: SourceView) => setDrill({ kind: 'entity', entityId: e.id, name: e.name }) : undefined
  return (
    <Box data-testid="meter-group-list" sx={{ display: 'grid', gridTemplateColumns: COLUMNS, columnGap: '2px' }}>
      {groups.map((g, i) => (
        <GroupRow key={g.id} row={g} rank={i + 1} onDrill={onDrill} />
      ))}
    </Box>
  )
}
