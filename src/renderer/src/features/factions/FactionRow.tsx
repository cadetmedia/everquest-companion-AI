// factions/FactionRow.tsx — one faction on the table: the standing row (name + signals, rung
// chip, live number with drift, the bar) and — expanded — the work panel beneath it. Split out
// of FactionsView.tsx at the measured file ceiling (split, never ratchet).
//
// MEMOIZED, ON STABLE PROPS (owner ask, 2026-10-11: no lag). Measured in the real renderer on the
// committed 185-faction dump: a keystroke re-rendered every row, and the first one blocked the
// main thread for 65-71 ms. The row object is the snapshot's own (useFactionRows.ts memoizes the
// fold), the derived entry is the base derivation's own for every row the query did not narrow
// (factionDerive.ts), the toggle is ONE callback that takes the id, and the links bundle is
// memoized in the controller — so a row that stays on the table costs nothing on a keystroke.
//
// ONE FIXED HEIGHT, so the table can be windowed (lib/useWindowedRows, the Loot ledger's way):
// the standing row is `ROW_HEIGHT` tall and never wraps — a long run of signals is clipped with
// an ellipsis rather than growing the row (measured before the fix: 67 rows at 30.5 px, 4 at
// 51.4 px because their chips wrapped). The collapsed work row is empty and 0 px tall.

import { type JSX, memo } from 'react'
import { Box, Checkbox, Chip, TableCell, TableRow, Typography } from '@mui/material'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import type { HeldCounts } from '@shared/types'
import { LadderBar, ladderTitle } from './FactionLadder'
import FactionWorkPanel, { type WorkPanelLinks } from './FactionWorkPanel'
import type { RowDerived } from './factionDerive'
import type { FactionRowVm, RaceGate } from './useFactionRows'

/** The work panel's link handlers plus the held counts its turn-in lists draw with. */
export interface WorkLinks extends WorkPanelLinks {
  held: HeldCounts
}

/** Every standing row is this tall (set on the row, measured in the real renderer), which is
 *  what lets the list be windowed. */
export const ROW_HEIGHT = 31
const COLUMNS = 5

/** The spacer rows that reserve the full scroll height, so only a screenful of rows is mounted
 *  (lib/useWindowedRows). */
export function FactionPadRow({ height }: { height: number }): JSX.Element | null {
  if (height <= 0) return null
  return (
    <TableRow style={{ height }}>
      <TableCell colSpan={COLUMNS} sx={{ p: 0, border: 0 }} />
    </TableRow>
  )
}

/** The name cell's clip: the leftover width, one line, an ellipsis — never a second line. */
const NAME_CELL = {
  py: 0.5,
  width: '100%',
  maxWidth: 0,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
} as const

/** The recent-window chip: how often the log moved this faction lately, and by how much. */
function RecentChip({ recent }: { recent: FactionRowVm['recent'] }): JSX.Element | null {
  if (recent === null) return null
  const when = new Date(recent.lastTs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const net = recent.net === 0 ? '' : ` ${recent.net > 0 ? '+' : ''}${String(recent.net)}`
  return (
    <Chip
      size="small"
      variant="outlined"
      label={`${String(recent.hits)}x${net}`}
      title={`moved ${String(recent.hits)} times recently, net ${String(recent.net)}; last at ${when}`}
      data-testid="factions-recent"
      sx={{
        ml: 1,
        height: 18,
        fontSize: 11,
        color: recent.net < 0 ? 'error.main' : 'success.main',
        borderColor: 'currentColor'
      }}
    />
  )
}

/** The hover behind a drifted number: both halves of the correction, and how sure it is. */
function driftTitle(row: FactionRowVm): string {
  const base = `dump said ${String(row.dumpStanding)}; the log moved it ${row.drift > 0 ? '+' : ''}${String(row.drift)} since`
  return row.exact ? base : `${base} (log window did not reach the dump - at least this much)`
}

/** The quest tallies: the attributed count, and the home zone's silent count beside it. Its own
 *  component to keep `NameSignals` inside the measured complexity ceiling. */
function QuestCounts({ work }: { work: RowDerived['work'] }): JSX.Element | null {
  const raiseCount = work?.raise.length ?? 0
  const nearbyCount = work?.nearby.length ?? 0
  if (raiseCount === 0 && nearbyCount === 0) return null
  return (
    <>
      {raiseCount > 0 && (
        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          {raiseCount} quest{raiseCount === 1 ? '' : 's'}
        </Typography>
      )}
      {nearbyCount > 0 && (
        <Typography
          component="span"
          variant="caption"
          title={`quests in ${work?.homeZone ?? 'the home zone'} whose wiki pages state no faction effect`}
          data-testid="factions-nearby-count"
          sx={{ ml: 0.75, color: 'text.disabled' }}
        >
          +{nearbyCount} in zone
        </Typography>
      )}
    </>
  )
}

/** The name cell's trailing signals: quest tallies, the race gate, gear value, the wishlist chip. */
function NameSignals({ derived, unlocks }: { derived: RowDerived; unlocks: readonly RaceGate[] }): JSX.Element {
  return (
    <>
      <QuestCounts work={derived.work} />
      {/* THE RACE GATE: this faction must reach maximum before these races open. A gate you have
          already settled stays on the row wearing its check — a friend's Kerran still runs
          through Kerra Isle — and only a row with something PENDING keeps the loud color. */}
      {unlocks.length > 0 && (
        <Chip
          size="small"
          color={unlocks.some((u) => !u.done) ? 'info' : undefined}
          variant="outlined"
          label={`unlocks ${unlocks.map((u) => (u.done ? `${u.race} ✓` : u.race)).join(', ')}`}
          title="needed at maximum for these Race Unlock achievements (✓ = already settled on this character)"
          data-testid="factions-unlocks"
          sx={{ ml: 1, height: 20, fontSize: 11, maxWidth: 320 }}
        />
      )}
      {derived.gear.length > 0 && (
        <Typography
          component="span"
          variant="caption"
          title={derived.gear.join(', ')}
          data-testid="factions-gear-count"
          sx={{ ml: 1, color: 'primary.main' }}
        >
          · {derived.gear.length} gear reward{derived.gear.length === 1 ? '' : 's'}
        </Typography>
      )}
      {/* THE LOUD ONE: this faction's quests reward something on YOUR wishlist. */}
      {derived.wished.length > 0 && (
        <Chip
          size="small"
          color="warning"
          variant="outlined"
          label={`♥ ${derived.wished.join(', ')}`}
          title="on your wishlist"
          data-testid="factions-wishlist-hit"
          sx={{ ml: 1, height: 20, fontSize: 11, fontWeight: 600, maxWidth: 320 }}
        />
      )}
    </>
  )
}

/** The don't-care mark as a checkbox on the row (owner ask, 2026-10-13): a faction no quest
 *  loses (Riptide Goblins) has no receipt to click, so the row itself carries it. */
function IgnoreBox({ factionKey, marked, links }: { factionKey: string; marked: boolean; links: WorkLinks }): JSX.Element {
  const toggle = links.onToggleDontCare
  return (
    <TableCell padding="none" align="center" sx={{ width: 64 }}>
      {toggle !== undefined && (
        <Checkbox
          size="small"
          checked={marked}
          onClick={(e) => {
            e.stopPropagation()
          }}
          onChange={() => {
            toggle(factionKey)
          }}
          title="Ignore: losses on this faction never count against a quest (No loss I care about)"
          slotProps={{ input: { 'aria-label': 'ignore this faction' } }}
          data-testid="factions-dont-care-toggle"
          sx={{ p: 0.25 }}
        />
      )}
    </TableCell>
  )
}

/**
 * One faction: the standing row, and — expanded — the work panel beneath it. EVERY row expands
 * (a faction with nothing on record answers with that fact rather than refusing the click); the
 * collapsed row's signals say where the work and the value are before anyone clicks.
 */
function FactionRow({
  row,
  derived,
  expanded,
  onToggle,
  links
}: {
  row: FactionRowVm
  /** the filtered work plus everything the row states about it (factionDerive.ts) */
  derived: RowDerived
  expanded: boolean
  /** toggles the row by its id; one callback for every row, so the memo holds */
  onToggle: (id: number) => void
  links: WorkLinks
}): JSX.Element {
  const dontCare = links.dontCare?.has(row.key) === true
  return (
    <>
      <TableRow
        hover
        data-testid={`factions-row-${String(row.id)}`}
        onClick={() => {
          onToggle(row.id)
        }}
        sx={{ cursor: 'pointer', height: ROW_HEIGHT, '& > td': { borderBottom: expanded ? 'none' : undefined } }}
      >
        <TableCell sx={NAME_CELL}>
          {expanded ? (
            <KeyboardArrowUpIcon sx={{ fontSize: 16, verticalAlign: 'text-bottom', mr: 0.5 }} />
          ) : (
            <KeyboardArrowDownIcon
              sx={{ fontSize: 16, verticalAlign: 'text-bottom', mr: 0.5, opacity: 0.5 }}
            />
          )}
          <Box
            component="span"
            sx={dontCare ? { color: 'text.disabled' } : undefined}
            title={dontCare ? "ignored: losses here never count against a quest" : undefined}
          >
            {row.name}
          </Box>
          <RecentChip recent={row.recent} />
          <NameSignals derived={derived} unlocks={row.unlocks} />
        </TableCell>
        <IgnoreBox factionKey={row.key} marked={dontCare} links={links} />
        <TableCell sx={{ py: 0.5, width: 130, whiteSpace: 'nowrap' }}>
          <Chip
            size="small"
            label={row.label}
            sx={{ height: 20, fontSize: 11, color: row.color, borderColor: row.color }}
            variant="outlined"
          />
        </TableCell>
        <TableCell align="right" sx={{ py: 0.5, width: 130, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          {/* The LIVE number; a row the log moved wears its drift, dump value on the hover. */}
          {row.drift !== 0 && (
            <Typography
              component="span"
              variant="caption"
              title={driftTitle(row)}
              data-testid="factions-drift"
              sx={{ color: row.drift > 0 ? 'success.main' : 'error.main', mr: 0.75 }}
            >
              {row.drift > 0 ? '+' : ''}
              {row.drift}
              {row.exact ? '' : '?'}
            </Typography>
          )}
          {row.standing}
        </TableCell>
        <TableCell sx={{ py: 0.5, width: 180 }}>
          <LadderBar standing={row.standing} title={ladderTitle(row.standing, row.toMax)} />
        </TableCell>
      </TableRow>
      {/* Mounted only while open: a collapsed row leaves nothing behind (owner report, 2026-10-13). */}
      {expanded && (
        <TableRow>
          <TableCell colSpan={COLUMNS} sx={{ py: 0 }}>
            <Box sx={{ pl: 3, pt: 1 }}>
              <FactionWorkPanel work={derived.work} held={links.held} selfKey={row.key} links={links} />
            </Box>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

export default memo(FactionRow)
