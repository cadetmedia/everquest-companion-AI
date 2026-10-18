// One row's action chips: what someone must do to close the gap (shared/gaps.ts `gapActions`),
// each with a tooltip saying why; a chip with somewhere to go is a link that opens in the browser.

import type { JSX, MouseEvent } from 'react'
import { Chip, Stack } from '@mui/material'
import { Tooltip } from '../../lib/Tooltip'
import { gapActions, type GapAction, type GapRow, type GapVerdict } from '@shared/gaps'

function ActionChip({ a }: { a: GapAction }): JSX.Element {
  const chip =
    a.href === undefined ? (
      <Chip size="small" variant="outlined" label={a.label} data-testid="gaps-action" />
    ) : (
      <Chip
        size="small"
        variant="outlined"
        clickable
        component="a"
        href={a.href}
        target="_blank"
        rel="noreferrer"
        onClick={(e: MouseEvent) => e.stopPropagation()}
        label={a.label}
        data-testid="gaps-action"
      />
    )
  return <Tooltip title={a.why}>{chip}</Tooltip>
}

export default function GapActionChips({ row, verdict }: { row: GapRow; verdict: GapVerdict }): JSX.Element {
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'nowrap' }}>
      {gapActions(row, verdict).map((a) => (
        <ActionChip key={a.kind} a={a} />
      ))}
    </Stack>
  )
}
