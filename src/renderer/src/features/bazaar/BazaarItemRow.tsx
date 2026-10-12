// One row of the Bazaar list, memoized (owner ask, 2026-10-11: typing in the search froze the tab
// for half a second). Measured in the real renderer on 1,353 rows: a keystroke re-rendered every
// row twice, once for the urgent render that shows the character and once for the deferred one
// that filters, and the first alone blocked the main thread for 500 ms. With the row memoized on
// primitive props and the same `BazaarItem` object, a row that stays in the list costs nothing on
// either render, and the sparkline is computed once per item rather than per paint.

import { type JSX, memo, useMemo } from 'react'
import { Chip, Stack, TableCell, TableRow } from '@mui/material'
import { formatPlat, sparkline, type BazaarItem } from '@shared/bazaar'
import type { BazaarWatch } from '@shared/bazaarWatch'
import { BazaarSparkline } from './BazaarChart'
import { ItemIcon, ItemName, priceOf } from './BazaarItemCells'
import { Move } from './BazaarMove'

export const SPARK_DAYS = 30
/** Every row is this tall (measured in the real renderer on 1,353 rows: 53 px, every one), which is what lets the list be windowed. */
export const ROW_HEIGHT = 53
const COLUMNS = 10

/** The spacer rows that reserve the full scroll height, so only a screenful of rows is mounted (lib/useWindowedRows). */
export function BazaarPadRow({ height }: { height: number }): JSX.Element | null {
  if (height <= 0) return null
  return (
    <TableRow style={{ height }}>
      <TableCell colSpan={COLUMNS} sx={{ p: 0, border: 0 }} />
    </TableRow>
  )
}

/** The row's watch chip: what alerts on it, or only that it is watched. */
function watchChipLabel(w: BazaarWatch): string {
  const wts = w.wtsMax !== null ? `WTS ≤ ${formatPlat(w.wtsMax)}` : w.wtsShare !== null ? `WTS ≤ ${Math.round(w.wtsShare * 100)}% median` : 'WTS'
  const on = [w.wts ? wts : '', w.wtb ? (w.wtbMin !== null ? `WTB ≥ ${formatPlat(w.wtbMin)}` : 'WTB') : ''].filter((s) => s !== '')
  return on.length === 0 ? 'Watch' : `Watch: ${on.join(' + ')}`
}

interface Props {
  item: BazaarItem
  endDay: string
  picked: boolean
  iconId: number | undefined
  wished: boolean
  /** The watchlist entry on this item (the list's own object, so it is stable), or null. */
  watch: BazaarWatch | null
  /** Picks this row by its key; one callback for every row, so the memo holds. */
  onPick: (key: string) => void
  onOpenLoot: (item: string) => void
}

function ItemRow({ item, endDay, picked, iconId, wished, watch, onPick, onOpenLoot }: Props): JSX.Element {
  const spark = useMemo(() => sparkline(item.points, endDay, SPARK_DAYS), [item, endDay])
  const chip = watch === null ? null : watchChipLabel(watch)
  const tiers = item.combined?.tiers.length ?? 1
  return (
    <TableRow hover selected={picked} onClick={() => onPick(item.key)} sx={{ cursor: 'pointer', height: ROW_HEIGHT }} data-testid={`bazaar-row-${item.key}`}>
      <TableCell sx={{ fontWeight: picked ? 700 : 400 }}>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'nowrap' }}>
          <ItemIcon iconId={iconId} />
          <ItemName item={item} onOpenLoot={onOpenLoot} />
          {item.combined !== undefined && (
            <Chip size="small" variant="outlined" label={item.combined.tiers.every((t) => t.tier === 0) ? 'not seen upgraded' : `${tiers} tiers at +${item.combined.at}`} sx={{ height: 18, fontSize: 10 }} />
          )}
          {wished && <Chip size="small" variant="outlined" color="secondary" label="♥ wish" sx={{ height: 18, fontSize: 10 }} data-testid="bazaar-wish-chip" />}
          {chip !== null && <Chip size="small" color="info" label={chip} sx={{ height: 18, fontSize: 10 }} data-testid="bazaar-watch-chip" />}
        </Stack>
      </TableCell>
      <TableCell>
        <BazaarSparkline sell={spark.sell} buy={spark.buy} />
      </TableCell>
      <TableCell align="right">{priceOf(item, item.asking)}</TableCell>
      <TableCell align="right">{priceOf(item, item.askingAvg)}</TableCell>
      <TableCell align="right">{priceOf(item, item.askingPredicted)}</TableCell>
      <TableCell align="right">
        <Move f={item.askingMove} />
      </TableCell>
      <TableCell align="right">{priceOf(item, item.offered)}</TableCell>
      <TableCell align="right">{item.sellOffers + item.buyOffers + item.trades}</TableCell>
      <TableCell align="right">{formatPlat(item.volume)}</TableCell>
      <TableCell align="right" sx={{ color: 'text.secondary' }}>
        {item.lastDay}
      </TableCell>
    </TableRow>
  )
}

export const BazaarItemRow = memo(ItemRow)
