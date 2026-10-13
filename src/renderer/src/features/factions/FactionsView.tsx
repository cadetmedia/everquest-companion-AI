// factions/FactionsView.tsx — THE FACTION STANDINGS TAB (UNRELEASED; the third graduated
// `/outputfile` kind, 2026-09-05).
//
// WHAT THIS TAB IS. The `/outputfile faction` dump, drawn LIVE: one row per faction the server
// tracks, the dump's absolute number corrected by the log's own receipts since the file was
// written (`adjusted by N` sums on; a "could not possibly get any better/worse" line PINS the
// value at the cap whatever a stale file said — useFactionRows.ts / shared/factionLog.ts).
//
// Race unlocks head the tab because the server defines them AS faction work; each faction row
// expands into the quests that move it, with the home zone's receipt-silent quests labeled as
// exactly that. Sorting, searching (with the rewards-only scope), the class/slot/gold-only work
// filters and the race-gate filter all live in the controller.
//
// A RENDER SHELL, deliberately: every piece of state and derivation is
// useFactionsController.ts's, every child's props arrive pre-bundled, and the ceilings the
// previous shapes kept hitting stay unhit because there is nothing here to grow.
//
// THE LIST IS ITS OWN SCROLLER (AGENTS.md UI conventions): the view fills its height and the
// table scrolls in a bounded box rather than growing the page — and it is WINDOWED the Loot
// ledger's way (lib/useWindowedRows; owner ask, 2026-10-11: no lag): only the screenful of rows
// in view is mounted, two pad rows reserve the rest, so a dump of hundreds of factions mounts the
// same thirty-odd rows as one of seventy. While any row is EXPANDED the whole list is drawn
// instead: a work panel is as tall as its quests, which a fixed-row-height window cannot place,
// and the memoized rows (FactionRow.tsx) keep that path cheap on a keystroke.

import { type JSX, useRef } from 'react'
import { Box, Stack, Table, TableBody, Typography } from '@mui/material'
import HandshakeIcon from '@mui/icons-material/Handshake'
import OutputKindLine from '../../components/OutputKindLine'
import { useWindowedRows, type WindowedRows } from '../../lib/useWindowedRows'
import { FactionTableHead, FilterBar, WorkFilterControls } from './FactionControls'
import { LadderLegend } from './FactionLadder'
import FactionRow, { FactionPadRow, ROW_HEIGHT } from './FactionRow'
import RaceUnlocksPanel from './RaceUnlocksPanel'
import { NO_DERIVED } from './factionDerive'
import { useFactionsController, type FactionsViewProps } from './useFactionsController'

/** The whole list as a window: what the table draws while any row is expanded (the header). Built
 *  over the hook's own slice, so whatever else the slice carries (a scroll position) rides along. */
function wholeList(win: WindowedRows, count: number): WindowedRows {
  return { ...win, start: 0, end: count, topPad: 0, bottomPad: 0, totalHeight: count * ROW_HEIGHT }
}

/** The never-run state. It names what the tab is FOR; the line above it names the command. */
function NoDump(): JSX.Element {
  return (
    <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ py: 6, color: 'text.secondary' }}>
      <HandshakeIcon sx={{ fontSize: 44, opacity: 0.6 }} />
      <Typography variant="body2" data-testid="factions-empty" sx={{ maxWidth: 460, textAlign: 'center' }}>
        Type <code>/outputfile faction</code> in game and this becomes your real standing with
        every faction the server tracks - the number the adjustment lines never total up. The app
        notices the file by itself; re-type the command any time to refresh.
      </Typography>
    </Stack>
  )
}

export default function FactionsView(props: FactionsViewProps): JSX.Element {
  const c = useFactionsController(props)
  const scrollRef = useRef<HTMLDivElement>(null)
  const win = useWindowedRows({ count: c.rows.length, rowHeight: ROW_HEIGHT, scrollRef })
  const slice = c.expanded.size === 0 ? win : wholeList(win, c.rows.length)
  return (
    <Box
      data-testid="factions-view"
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2, minHeight: 0 }}
    >
      <OutputKindLine kind="faction" loadedAt={c.readAt} testId="factions-freshness" />
      {/* THE SECOND EXPORT THIS TAB EATS, taught in place: race unlocks come from the
          achievements dump, and until one exists the tab SAYS SO where the player is looking —
          the registry's own never-run line, with the why-clause reworded to this tab's use. It
          disappears the moment the dump loads; the race panel takes over from there. */}
      {c.all !== null && c.raceUnlocks === undefined && (
        <OutputKindLine
          kind="achievements"
          why="Type it in game to see race unlocks - which factions each race still needs at maximum."
          testId="factions-achievements-line"
        />
      )}
      {c.all === null ? (
        <NoDump />
      ) : (
        <>
          <RaceUnlocksPanel races={c.raceUnlocks} rows={c.all} onFind={c.reveal} />
          <WorkFilterControls {...c.work} />
          <FilterBar {...c.bar} />
          <LadderLegend />
          <Box
            ref={scrollRef}
            data-testid="factions-scroll"
            sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain' }}
          >
            <Table size="small" stickyHeader data-testid="factions-table">
              <FactionTableHead sort={c.head.sort} onSort={c.head.onSort} />
              <TableBody>
                <FactionPadRow height={slice.topPad} />
                {c.rows.slice(slice.start, slice.end).map((row) => (
                  <FactionRow
                    key={row.id}
                    row={row}
                    derived={c.derivedById.get(row.id) ?? NO_DERIVED}
                    expanded={c.expanded.has(row.id)}
                    onToggle={c.toggleRow}
                    links={c.links}
                  />
                ))}
                <FactionPadRow height={slice.bottomPad} />
              </TableBody>
            </Table>
            {c.rows.length === 0 && (
              <Typography
                variant="body2"
                color="text.secondary"
                data-testid="factions-no-match"
                sx={{ py: 4, textAlign: 'center' }}
              >
                No faction matches that.
              </Typography>
            )}
          </Box>
        </>
      )}
    </Box>
  )
}
