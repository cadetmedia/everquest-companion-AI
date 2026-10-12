// The Gaps tab's table: one row per unknown name, as the engine ordered them (most mentioned
// first). A click opens the row's details beneath it (GapDetailsPanel); a second click closes it.

import { type JSX, useState } from 'react'
import { Box, Chip, Collapse, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { charactersOff, type GapRow, type GapSuggest } from '@shared/gaps'
import { wikiPageUrl } from '@shared/wiki'
import GapDetailsPanel from './GapDetailsPanel'

/** Under the name: the one known name within reach, linked to its page so the owner can fix it. */
function SuggestCaption({ s }: { s: GapSuggest }): JSX.Element {
  return (
    <Typography variant="caption" color="text.secondary" component="div" data-testid="gaps-suggest">
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

const COLUMNS = 5

function GapTableRow({ row, open, onToggle }: { row: GapRow; open: boolean; onToggle: () => void }): JSX.Element {
  return (
    <>
      <TableRow hover selected={open} onClick={onToggle} sx={{ cursor: 'pointer' }} data-testid="gaps-row">
        <TableCell sx={{ fontWeight: 600 }}>
          {row.name}
          {row.suggest !== undefined && <SuggestCaption s={row.suggest} />}
        </TableCell>
        <TableCell>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {row.kinds.map((k) => (
              <Chip key={k} label={k} size="small" variant="outlined" />
            ))}
          </Stack>
        </TableCell>
        <TableCell align="right">{row.count.toLocaleString()}</TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{row.first}</TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{row.last}</TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={COLUMNS} sx={{ p: 0, border: 0 }}>
          <Collapse in={open} unmountOnExit>
            <GapDetailsPanel details={row.details} />
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  )
}

export default function GapsTable({ rows }: { rows: readonly GapRow[] }): JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }} data-testid="gaps-empty">
        Nothing here: every name the log mentioned in this domain is in the app's data.
      </Typography>
    )
  }
  return (
    <Table size="small" data-testid="gaps-table">
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
        {rows.map((r) => (
          <GapTableRow key={r.name} row={r} open={open === r.name} onToggle={() => setOpen(open === r.name ? null : r.name)} />
        ))}
      </TableBody>
    </Table>
  )
}
