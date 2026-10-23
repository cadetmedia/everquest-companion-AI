// One gap row's details, under its row when it is open: each list as chips with counts, and the
// last lines the game printed, in monospace, exactly as the log has them.

import type { JSX } from 'react'
import { Box, Chip, Stack, Typography } from '@mui/material'
import { GAP_LISTS, derivedPrices, formatCoin, type GapDetails, type GapRow, type GapTally } from '@shared/gaps'
import { offerCheckText, offerText } from '@shared/gapOffers'
import { questFactLines, questFactsOf } from '@shared/itemQuestFacts'
import { rowFactLines } from '@shared/gapQuestPage'
import { PAGE_EXTRAS } from './useGapsData'

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

/**
 * What merchants offered for the item in the sell slot, newest first, each with the standing it was
 * made at and how it stands against the Value estimate (shared/gapOffers.ts; owner ask, 2026-10-20).
 */
function MerchantOffers({ details }: { details: GapDetails }): JSX.Element | null {
  const offers = details.offers ?? []
  if (offers.length === 0) return null
  const estimate = derivedPrices(details)?.vendorValue
  return (
    <Stack spacing={0.25} data-testid="gaps-offers">
      <Typography variant="caption" color="text.secondary">
        merchant offers{estimate === undefined ? '' : ` (Value estimate ≈ ${formatCoin(estimate)})`}
      </Typography>
      {[...offers].reverse().map((o) => (
        <Typography key={`${o.merchant}|${o.copper}|${o.per === true ? 'per' : ''}|${o.standing ?? ''}`} variant="caption" sx={{ pl: 8 }}>
          {offerText(o)} ({offerCheckText(o, estimate)})
        </Typography>
      ))}
    </Stack>
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

/**
 * The row's facts in words first: an item's quest facts, then a quest's steps, an NPC's role, where it
 * was fished (gapQuestPage.ts `rowFactLines`); then its tallies, offers and sample lines.
 */
export default function GapDetailsPanel({ row }: { row: GapRow }): JSX.Element {
  const details = row.details
  const lines = [...questFactLines(questFactsOf(row)), ...rowFactLines(row, PAGE_EXTRAS)]
  return (
    <Stack spacing={1} sx={{ py: 1 }} data-testid="gaps-details">
      {/* Who gave it, who took it, its quest (owner, 2026-10-22: who it is turned in to). */}
      {lines.map((l) => (
        <Typography key={l} variant="body2" color="info.main" data-testid="gaps-quest-line">
          {l}
        </Typography>
      ))}
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
      <MerchantOffers details={details} />
      {details.samples.length > 0 && (
        <Box component="pre" sx={{ m: 0, px: 1, py: 0.5, fontSize: 12, bgcolor: 'action.hover', borderRadius: 1, whiteSpace: 'pre-wrap' }}>
          {details.samples.join('\n')}
        </Box>
      )}
    </Stack>
  )
}
