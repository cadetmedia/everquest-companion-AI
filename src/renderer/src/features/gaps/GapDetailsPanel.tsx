// One gap row's details, under its row when it is open: each list as chips with counts, and the
// last lines the game printed, in monospace, exactly as the log has them.

import type { JSX } from 'react'
import { Box, Chip, Stack, Typography } from '@mui/material'
import { GAP_LISTS, derivedPrices, formatCoin, type GapDetails, type GapTally } from '@shared/gaps'

/** Under the sale-on-loot chips: what the sale implies (shared/gaps.ts `derivedPrices`). */
function SalesCaveat({ details }: { details: GapDetails }): JSX.Element | null {
  const prices = derivedPrices(details)
  if (prices === null) return null
  return (
    <Typography variant="caption" color="warning.main" sx={{ pl: 8 }} data-testid="gaps-sales-caveat">
      Instant sale pays less than a vendor. Vendor value (the game&apos;s Value line) ≈ {formatCoin(prices.vendorValue)}.
    </Typography>
  )
}

function TallyChips({ label, tally }: { label: string; tally: GapTally }): JSX.Element {
  const more = tally.distinct - tally.entries.length
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 64 }}>
        {label}
      </Typography>
      {tally.entries.map((e) => (
        <Chip key={e.name} label={`${e.name} · ${e.n}`} size="small" />
      ))}
      {more > 0 && (
        <Typography variant="caption" color="text.secondary">
          +{more} more
        </Typography>
      )}
    </Stack>
  )
}

export default function GapDetailsPanel({ details }: { details: GapDetails }): JSX.Element {
  return (
    <Stack spacing={1} sx={{ py: 1 }} data-testid="gaps-details">
      {GAP_LISTS.map(({ key, label }) => {
        const tally = details[key]
        if (tally === undefined) return null
        return (
          <Stack key={key} spacing={0.25}>
            <TallyChips label={label} tally={tally} />
            {key === 'sales' && <SalesCaveat details={details} />}
          </Stack>
        )
      })}
      {details.samples.length > 0 && (
        <Box component="pre" sx={{ m: 0, px: 1, py: 0.5, fontSize: 12, bgcolor: 'action.hover', borderRadius: 1, whiteSpace: 'pre-wrap' }}>
          {details.samples.join('\n')}
        </Box>
      )}
    </Stack>
  )
}
