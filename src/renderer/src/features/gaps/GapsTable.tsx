// The Gaps tab's table: one row per unknown name, as the engine ordered them (most mentioned
// first). A click opens the row's details in a pane under the table (GapDetailsPanel); a second
// click closes it.
//
// WINDOWED THE LOOT LEDGER'S WAY (owner ask, 2026-10-11: no lag anywhere). A domain can fill its
// 500-row cap, and an unwindowed table of memo-less rows is the shape that read 293 ms a keystroke
// at that size elsewhere. So the scroll box is bounded, `useWindowedRows` mounts a screenful plus
// overscan between two pad rows, every row is a fixed height with its cells on one line, and the
// row component is memoized on stable props: the row, whether it is the open one, and one
// `onToggle(name)` callback. The details pane lives OUTSIDE the window, under the table, so an
// open row never changes a row's height.

import { type JSX, memo, useCallback, useRef, useState } from 'react'
import { Box, Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { charactersOff, type GapRow, type GapSuggest } from '@shared/gaps'
import { wikiPageUrl } from '@shared/wiki'
import { useWindowedRows } from '../../lib/useWindowedRows'
import GapDetailsPanel from './GapDetailsPanel'

/** One line of small cells with a small chip: 6px padding above and below a 24px chip, plus the border. */
const ROW_HEIGHT = 37
const COLUMNS = 5

/** Beside the name: the one known name within reach, linked to its page so the owner can fix it. */
function SuggestCaption({ s }: { s: GapSuggest }): JSX.Element {
  return (
    <Typography variant="caption" color="text.secondary" component="span" sx={{ ml: 1, fontWeight: 400 }} data-testid="gaps-suggest">
      Probably{' '}
      <Box
        component="a"
        href={wikiPageUrl(s.page)}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        sx={{ color: 'inherit', textDecoration: 'underline dotted' }}
      >
        {s.name}
      </Box>{' '}
      ({charactersOff(s.distance)}). The wiki page may be misspelled.
    </Typography>
  )
}

/** The spacer rows that reserve the full scroll height, so only a screenful of rows is mounted. */
function PadRow({ height }: { height: number }): JSX.Element | null {
  if (height <= 0) return null
  return (
    <TableRow style={{ height }}>
      <TableCell colSpan={COLUMNS} sx={{ p: 0, border: 0 }} />
    </TableRow>
  )
}

const GapTableRow = memo(function GapTableRow({ row, open, onToggle }: { row: GapRow; open: boolean; onToggle: (name: string) => void }): JSX.Element {
  return (
    <TableRow hover selected={open} onClick={() => onToggle(row.name)} sx={{ cursor: 'pointer', height: ROW_HEIGHT }} data-testid="gaps-row">
      <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
        {row.name}
        {row.suggest !== undefined && <SuggestCaption s={row.suggest} />}
      </TableCell>
      <TableCell>
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'nowrap' }}>
          {row.kinds.map((k) => (
            <Chip key={k} label={k} size="small" variant="outlined" />
          ))}
        </Stack>
      </TableCell>
      <TableCell align="right">{row.count.toLocaleString()}</TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{row.first}</TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{row.last}</TableCell>
    </TableRow>
  )
})

export default function GapsTable({ rows }: { rows: readonly GapRow[] }): JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  const onToggle = useCallback((name: string) => setOpen((cur) => (cur === name ? null : name)), [])
  const scrollRef = useRef<HTMLDivElement>(null)
  const win = useWindowedRows({ count: rows.length, rowHeight: ROW_HEIGHT, scrollRef })
  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }} data-testid="gaps-empty">
        Nothing here: every name the log mentioned in this domain is in the app's data.
      </Typography>
    )
  }
  const opened = open === null ? undefined : rows.find((r) => r.name === open)
  return (
    <Stack spacing={1.5}>
      <Box ref={scrollRef} sx={{ overflow: 'auto', maxHeight: 'calc(100vh - 300px)', overscrollBehavior: 'contain' }} data-testid="gaps-scroll">
        <Table size="small" stickyHeader data-testid="gaps-table">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Seen as</TableCell>
              <TableCell align="right">Times</TableCell>
              <TableCell>First</TableCell>
              <TableCell>Last</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <PadRow height={win.topPad} />
            {rows.slice(win.start, win.end).map((r) => (
              <GapTableRow key={r.name} row={r} open={open === r.name} onToggle={onToggle} />
            ))}
            <PadRow height={win.bottomPad} />
          </TableBody>
        </Table>
      </Box>
      {opened !== undefined && (
        <Paper variant="outlined" sx={{ px: 1.5, py: 0.5 }} data-testid="gaps-details-pane">
          <Typography variant="subtitle2">{opened.name}</Typography>
          <GapDetailsPanel details={opened.details} />
        </Paper>
      )}
    </Stack>
  )
}
