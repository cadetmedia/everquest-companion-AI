// THE "WITH ITS OWNER" LEVEL 1 on the floating damage overlay (Malkil, 2026-10-21;
// docs/community/plans/2026-10-20-meter-pet-split.md). The same rows the Combat tab draws
// (features/combat/PetGroupRows.tsx), in plain React because this bundle has no MUI: a pair is two
// lines, master then pet, over one shared bar at the pair's length; anything else is one line.
// Every bar is its own true length and text never sizes one; every row ends in the same fixed
// total box. No hover, as on every overlay bar (JOS-358).

import type { JSX } from 'react'
import type { OverlayDrill } from '@shared/types'
import type { PetGroupLine, PetGroupRow } from '@shared/combatPetGroups'
import { formatNum as fmt, formatRate } from '../lib/formatRate'
import { KIND_COLOR, KIND_SUFFIX } from './meterBars'

/** The pair's third colour: the shared bar and every row's total box. The Combat tab's copy matches. */
const GROUP_COLOR = '#4a4366'
const LINE_H = 18
const BOX_W = 96

/** One line: its own fill, its name, and (in a pair) its own figures. Rank and kind word: first line only. */
function Line({
  line,
  rank,
  pair,
  onClick
}: {
  line: PetGroupLine
  rank: number | null
  pair: boolean
  onClick?: () => void
}): JSX.Element {
  const e = line.source
  return (
    <div
      data-testid="overlay-group-line"
      onClick={onClick}
      style={{ position: 'relative', minWidth: 0, cursor: onClick ? 'pointer' : 'default' }}
    >
      <div
        style={{
          position: 'absolute',
          top: 1,
          bottom: 1,
          left: 0,
          width: `${e.total > 0 ? Math.max(0.5, line.pct) : 0}%`,
          background: KIND_COLOR[e.kind] ?? '#888',
          opacity: 0.55,
          borderRadius: 2
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 6px',
          fontSize: 11,
          lineHeight: 1,
          textShadow: '0 1px 2px rgba(0,0,0,0.9)'
        }}
      >
        <span style={{ color: 'rgba(255,255,255,0.55)', width: 12, flexShrink: 0, textAlign: 'right' }}>{rank ?? ''}</span>
        <span style={{ fontWeight: 600, flexGrow: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {line.label}
          {rank !== null && (KIND_SUFFIX[e.kind] ?? '')}
        </span>
        {pair && (
          <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {`${formatRate(e.dps)} · ${fmt(e.total)}`}
          </span>
        )}
      </div>
    </div>
  )
}

/** The fixed box every row ends in: a pair's dps over its damage, a lone row's on one line. */
function TotalBox({ row, pair }: { row: PetGroupRow; pair: boolean }): JSX.Element {
  return (
    <div
      data-testid="overlay-group-total"
      style={{
        flex: `0 0 ${BOX_W}px`,
        borderRadius: 3,
        background: GROUP_COLOR,
        padding: '0 6px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-end',
        fontSize: 11,
        lineHeight: 1.25,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        overflow: 'hidden'
      }}
    >
      {pair ? (
        <>
          <span style={{ fontWeight: 600 }}>{formatRate(row.dps)}</span>
          <span style={{ color: 'rgba(255,255,255,0.75)' }}>{fmt(row.total)}</span>
        </>
      ) : (
        <span>{`${formatRate(row.dps)} · ${fmt(row.total)}`}</span>
      )}
    </div>
  )
}

function GroupRow({
  row,
  rank,
  setDrill
}: {
  row: PetGroupRow
  rank: number
  setDrill: ((d: OverlayDrill | null) => void) | null
}): JSX.Element {
  const pair = row.lines.length > 1
  return (
    <div data-testid="overlay-group-row" style={{ display: 'flex', gap: 2, height: LINE_H * row.lines.length, marginBottom: 2 }}>
      <div
        style={{
          position: 'relative',
          flex: '1 1 auto',
          minWidth: 0,
          borderRadius: 3,
          overflow: 'hidden',
          background: 'rgba(255,255,255,0.06)',
          display: 'grid',
          gridTemplateRows: `repeat(${row.lines.length}, 1fr)`
        }}
      >
        {/* The pair's shared bar, behind both lines, at the pair's own length. */}
        {pair && (
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${row.pct}%`, background: GROUP_COLOR, opacity: 0.8 }} />
        )}
        {row.lines.map((l, i) => (
          <Line
            key={l.source.id}
            line={l}
            rank={i === 0 ? rank : null}
            pair={pair}
            onClick={setDrill ? () => setDrill({ entityId: l.source.id }) : undefined}
          />
        ))}
      </div>
      <TotalBox row={row} pair={pair} />
    </div>
  )
}

/** Level 1 in the grouped layout. `setDrill` null (locked mode): the same rows, no affordances. */
export function PetGroupBars({
  groups,
  setDrill
}: {
  groups: PetGroupRow[]
  setDrill: ((d: OverlayDrill | null) => void) | null
}): JSX.Element {
  return (
    <>
      {groups.map((g, i) => (
        <GroupRow key={g.id} row={g} rank={i + 1} setDrill={setDrill} />
      ))}
    </>
  )
}
