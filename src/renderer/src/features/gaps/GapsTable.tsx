// The Gaps tab's table: one row per unknown name, as the engine ordered them (most mentioned first).

import type { JSX } from 'react'
import { Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import type { GapRow } from '@shared/gaps'

export default function GapsTable({ rows }: { rows: readonly GapRow[] }): JSX.Element {
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
          <TableRow key={r.name} hover>
            <TableCell sx={{ fontWeight: 600 }}>{r.name}</TableCell>
            <TableCell>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {r.kinds.map((k) => (
                  <Chip key={k} label={k} size="small" variant="outlined" />
                ))}
              </Stack>
            </TableCell>
            <TableCell align="right">{r.count.toLocaleString()}</TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{r.first}</TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{r.last}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
