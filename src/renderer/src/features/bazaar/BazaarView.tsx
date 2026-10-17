// THE BAZAAR TAB — what players asked and offered for items in trade chat (owner ask, 2026-10-06).
//
// On top, the picked item: its asking and offered prices now, how far asking has moved, its range,
// a chart of both by day (hover a day for who said what), and who is offering. Below, every item
// and tier with a 30-day trend, newest first or in the picked order; clicking one picks it. "All
// tiers as one" makes it one row per item, every tier read as +0 (shared/bazaarTiers.ts). The
// Offers list shows every offer as said, and Export CSV saves them for Excel. Every number is a median, with far-off
// prices left out while Ignore outliers is on (shared/bazaar.ts). The Tradeskill picker and the Quest search keep
// items by what the wiki says they are for (shared/bazaarFacts.ts). What the parser reads is stated in
// engine/crates/fold/src/modules/bazaar_parse.rs.

import { type JSX, memo, useCallback, useDeferredValue, useMemo, useRef, useState } from 'react'
import { Box, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TableSortLabel, Typography } from '@mui/material'
import { itemTierKey } from '@shared/itemStats'
import { findWatch, watchOnItem, type BazaarWatchlist } from '@shared/bazaarWatch'
import { factsAsked, factsPass, questNamesOf, type FactsFilter } from '@shared/bazaarFacts'
import { offersCsv, offersOf } from '@shared/bazaarCsv'
import {
  BAZAAR_MODULE_ID,
  formatPlat,
  type BazaarItem,
  type BazaarSnap,
  type BazaarSort,
  type BazaarSortKey
} from '@shared/bazaar'
import { useModule } from '../../lib/useModule'
import { useWindowedRows } from '../../lib/useWindowedRows'
import { useWishlist } from '../wishlist/useWishlist'
import { ASK_COLOR, BazaarChart, OFFER_COLOR } from './BazaarChart'
import { BazaarHoursChart } from './BazaarHoursChart'
import BazaarControls, { DEFAULT_PRICE_TIER, type BazaarControlState, type BazaarShow } from './BazaarControls'
import { BazaarItemRow, BazaarPadRow, ROW_HEIGHT, SPARK_DAYS } from './BazaarItemRow'
import { Move } from './BazaarMove'
import BazaarQuotes from './BazaarQuotes'
import { ItemName, nameOf } from './BazaarItemCells'
import { HiddenDetail, HideDetailButton, useDetailHidden } from './BazaarDetailToggle'
import BazaarTierTable from './BazaarTierTable'
import BazaarWatchPanel from './BazaarWatchPanel'
import { useHeardAlerts } from './BazaarWatcher'
import { useBazaarSummary } from './useBazaarSummary'
import { useBazaarWatch } from './useBazaarWatch'
import { useItemFacts, type ItemFacts } from './useItemFacts'

/** The list's columns, each sortable; numbers sort biggest first on the first click. */
const COLUMNS: { key: BazaarSortKey; label: string; right: boolean }[] = [
  { key: 'item', label: 'Item', right: false },
  { key: 'trend', label: `Last ${SPARK_DAYS} days`, right: false },
  { key: 'asking', label: 'Asking', right: true },
  { key: 'askingAvg', label: 'Avg 7 days', right: true },
  { key: 'askingPredicted', label: 'Predicted', right: true },
  { key: 'move', label: 'Change', right: true },
  { key: 'offered', label: 'Offered', right: true },
  { key: 'offers', label: 'Offers', right: true },
  { key: 'volume', label: 'Traded 30d', right: true },
  { key: 'lastDay', label: 'Last seen', right: true }
]

function SortHead({ sort, onSort }: { sort: BazaarSort; onSort: (s: BazaarSort) => void }): JSX.Element {
  return (
    <TableHead>
      <TableRow>
        {COLUMNS.map((c) => {
          const on = sort.key === c.key
          return (
            <TableCell key={c.key} align={c.right ? 'right' : 'left'} sortDirection={on ? (sort.desc ? 'desc' : 'asc') : false}>
              <TableSortLabel
                active={on}
                direction={on && !sort.desc ? 'asc' : 'desc'}
                onClick={() => onSort({ key: c.key, desc: on ? !sort.desc : c.key !== 'item' })}
                data-testid={`bazaar-sort-${c.key}`}
              >
                {c.label}
              </TableSortLabel>
            </TableCell>
          )
        })}
      </TableRow>
    </TableHead>
  )
}


function Tile({ label, value, color, children }: { label: string; value: string; color?: string; children?: JSX.Element | null }): JSX.Element {
  return (
    <Box sx={{ minWidth: 120 }}>
      <Stack direction="row" spacing={0.75} alignItems="center">
        {color !== undefined && <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />}
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="baseline">
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {value}
        </Typography>
        {children}
      </Stack>
    </Box>
  )
}

const PRICE_HEADS = ['Now (median)', '7-day average', 'Predicted today']

interface PriceLine {
  label: string
  color: string
  now: number | null
  avg: number | null
  pred: number | null
  move?: number | null
}

/** Asking and offered, each now, averaged over the week and predicted, in one small grid. */
function PriceGrid({ item }: { item: BazaarItem }): JSX.Element {
  const line = (l: PriceLine): JSX.Element => (
    <>
      <Stack direction="row" spacing={0.75} alignItems="center">
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: l.color }} />
        <Typography variant="body2" color="text.secondary">
          {l.label}
        </Typography>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="baseline">
        <Typography variant="h6">{formatPlat(l.now)}</Typography>
        {l.move !== undefined && <Move f={l.move} />}
      </Stack>
      <Typography variant="h6">{formatPlat(l.avg)}</Typography>
      <Typography variant="h6">{formatPlat(l.pred)}</Typography>
    </>
  )
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'auto repeat(3, minmax(110px, auto))', columnGap: 4, rowGap: 0.5, alignItems: 'center' }} data-testid="bazaar-prices">
      <Box />
      {PRICE_HEADS.map((h) => (
        <Typography key={h} variant="caption" color="text.secondary">
          {h}
        </Typography>
      ))}
      {line({ label: 'Asking (selling)', color: ASK_COLOR, now: item.asking, avg: item.askingAvg, pred: item.askingPredicted, move: item.askingMove })}
      {line({ label: 'Offered (buying)', color: OFFER_COLOR, now: item.offered, avg: item.offeredAvg, pred: item.offeredPredicted })}
    </Box>
  )
}

interface DetailProps {
  item: BazaarItem
  endDay: string
  /** The toolbar's switch, which the time-of-day chart honours too. */
  ignoreOutliers: boolean
  onOpenLoot: (item: string) => void
  onHide: () => void
}

function Detail({ item, endDay, ignoreOutliers, onOpenLoot, onHide }: DetailProps): JSX.Element {
  const lows = item.points.map((p) => p.sell.low ?? Infinity)
  const highs = item.points.map((p) => p.sell.high ?? -Infinity)
  const low = Math.min(...lows)
  const high = Math.max(...highs)
  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="bazaar-detail">
      <Stack spacing={2}>
        <Stack direction="row" alignItems="baseline" spacing={1.5} flexWrap="wrap">
          <Typography variant="h6" component="div">
            <ItemName item={item} bold onOpenLoot={onOpenLoot} />
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {item.combined === undefined
              ? ''
              : `all tiers, priced as +${item.combined.at}${item.combined.atSeen ? '' : ` (an estimate: nobody listed +${item.combined.at})`} · `}
            last seen {item.lastDay}
          </Typography>
          <HideDetailButton onHide={onHide} />
        </Stack>
        <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap>
          <PriceGrid item={item} />
          <Tile label="Asking range" value={Number.isFinite(low) ? `${formatPlat(low)} to ${formatPlat(high)}` : '-'} />
          <Tile label="Offers seen" value={String(item.sellOffers + item.buyOffers + item.trades)}>
            <Typography component="span" variant="caption" color="text.secondary">
              {item.sellOffers} selling · {item.buyOffers} buying{item.trades > 0 ? ` · ${item.trades} trade` : ''}
            </Typography>
          </Tile>
        </Stack>
        {item.combined !== undefined && <BazaarTierTable c={item.combined} />}
        <BazaarWatchPanel item={item} />
        <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap alignItems="flex-start">
          <Box sx={{ flex: '2 1 480px', minWidth: 0 }}>
            <BazaarChart item={item} endDay={endDay} />
          </Box>
          <Box sx={{ flex: '1 1 360px', minWidth: 360 }}>
            <BazaarHoursChart item={item} ignoreOutliers={ignoreOutliers} />
          </Box>
        </Stack>
        {/* Keyed by the item: a Who pick belongs to the item it was made on (review, 2026-10-13). */}
        <BazaarQuotes key={item.key} quotes={item.quotes} title="Who's offering" scale={item.combined} />
        <Typography variant="caption" color="text.disabled">
          Predicted: a trend through the last ten priced days, newer and busier days counting more,
          read on the log&apos;s newest day ({endDay}) and kept within half to double the recent median.
        </Typography>
        {item.outliers > 0 && (
          <Typography variant="caption" color="text.disabled">
            {item.outliers} price(s) more than four times away from this item&apos;s usual price are left out.
          </Typography>
        )}
      </Stack>
    </Paper>
  )
}

/** The watch alerts raised this session, so one missed with the banner closed is still here. */
function HeardAlerts(): JSX.Element | null {
  const heard = useHeardAlerts()
  if (heard.length === 0) return null
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} data-testid="bazaar-heard">
      <Typography variant="caption" color="text.secondary">
        Watch alerts this session
      </Typography>
      {heard.map((a) => (
        <Typography key={a.seq} variant="body2">
          <Box component="span" sx={{ color: 'text.secondary', mr: 1 }}>
            {a.at.slice(11)}
          </Box>
          {a.text}
        </Typography>
      ))}
    </Paper>
  )
}

/** The picked item's panel, or the slim bar it folds to. Memoized: a keystroke in the search must not redraw two charts and the quotes. */
const PickedPanel = memo(function PickedPanel(p: Omit<DetailProps, 'onHide'> & { hidden: boolean; setHidden: (h: boolean) => void }): JSX.Element {
  if (p.hidden) return <HiddenDetail name={nameOf(p.item)} onShow={() => p.setHidden(false)} />
  return <Detail item={p.item} endDay={p.endDay} ignoreOutliers={p.ignoreOutliers} onOpenLoot={p.onOpenLoot} onHide={() => p.setHidden(true)} />
})

/** Which items the Show picker keeps; undefined keeps all. */
function keeperOf(show: BazaarShow, wished: ReadonlySet<string>, watch: BazaarWatchlist): ((item: string, tier: number) => boolean) | undefined {
  if (show === 'all') return undefined
  if (show === 'wish') return (item) => wished.has(itemTierKey(item))
  return (item, tier) => findWatch(watch, item, tier) !== null
}

const START: BazaarControlState = {
  text: '',
  dir: 'all',
  show: 'all',
  popular: false,
  minPrice: 0,
  hideNoTrade: true,
  offers: false,
  combineTiers: false,
  priceTier: DEFAULT_PRICE_TIER,
  sinceDays: 0,
  tradeskill: '',
  quest: '',
  ignoreOutliers: true
}

/** The Show picker's keep, and the facts filters' (Hide No Drop, Tradeskill, Quest), as one. */
function keepOf(show: ReturnType<typeof keeperOf>, f: FactsFilter, factsOf: (name: string) => ItemFacts | undefined): ((item: string, tier: number) => boolean) | undefined {
  if (!factsAsked(f)) return show
  return (item, tier) => factsPass(factsOf(item), f) && (show === undefined || show(item, tier))
}

/** Whether any control narrows the list, so an empty one says "match" rather than "in your log yet". */
function narrowed(ctl: BazaarControlState, facts: FactsFilter): boolean {
  return ctl.text !== '' || ctl.dir !== 'all' || ctl.show !== 'all' || ctl.minPrice > 0 || factsAsked(facts)
}

async function exportCsv(items: readonly BazaarItem[], lastDay: string | null): Promise<void> {
  await window.eq.saveBazaarCsv(offersCsv(offersOf(items)), `bazaar-offers-${lastDay ?? 'all'}.csv`)
}

export default function BazaarView({ onOpenLoot }: { onOpenLoot: (item: string) => void }): JSX.Element {
  const snap = useModule<BazaarSnap>(BAZAAR_MODULE_ID)
  const wishes = useWishlist()
  const { list: watch } = useBazaarWatch()
  const [ctl, setCtl] = useState<BazaarControlState>(START)
  const [sort, setSort] = useState<BazaarSort>({ key: 'lastDay', desc: true })
  const [pick, setPick] = useState<string | null>(null)
  const [detailHidden, setDetailHidden] = useDetailHidden()
  const wished = useMemo(() => new Set(wishes.ready ? wishes.list.entries.map((e) => e.itemKey) : []), [wishes])
  const names = useMemo(() => [...new Set((snap?.rows ?? []).map((r) => r.item))], [snap])
  const factsOf = useItemFacts(names)
  const quests = useMemo(() => questNamesOf(names, factsOf), [names, factsOf])
  // The Quest box's text is deferred like the search's (useBazaarSummary), so typing never waits on the list.
  const quest = useDeferredValue(ctl.quest)
  const facts = useMemo(() => ({ hideNoTrade: ctl.hideNoTrade, tradeskill: ctl.tradeskill, quest }), [ctl.hideNoTrade, ctl.tradeskill, quest])
  const keep = useMemo(() => keepOf(keeperOf(ctl.show, wished, watch), facts, factsOf), [ctl.show, facts, wished, watch, factsOf])
  const sum = useBazaarSummary(snap, ctl, sort, keep)
  // The list is windowed the Loot ledger's way: a scroll box, and only the rows in view mounted.
  const scrollRef = useRef<HTMLDivElement>(null)
  const win = useWindowedRows({ count: sum.items.length, rowHeight: ROW_HEIGHT, scrollRef })
  const picked = sum.items.find((i) => i.key === pick) ?? sum.items.at(0) ?? null
  const onPick = useCallback(
    (key: string) => {
      setPick(key)
      setDetailHidden(false)
    },
    [setDetailHidden]
  )
  const set = (patch: Partial<BazaarControlState>): void => {
    const next = { ...ctl, ...patch }
    // Popular ranks by platinum traded, and leaves out what sells for under a platinum.
    if (patch.popular === true) {
      setSort({ key: 'volume', desc: true })
      if (next.minPrice === 0) next.minPrice = 1
    }
    setCtl(next)
  }
  const onSort = (next: BazaarSort): void => {
    setSort(next)
    if (ctl.popular && next.key !== 'volume') setCtl({ ...ctl, popular: false })
  }
  const filtered = narrowed(ctl, facts)

  return (
    <Stack spacing={2} sx={{ p: 2 }} data-testid="bazaar-view">
      <Typography variant="body2" color="text.secondary">
        What players asked (WTS) and offered (WTB) in trade chat, read from your log
        {sum.days > 0 ? `: ${sum.offers} offers over ${sum.days} days` : ''}. Prices are daily medians; a
        seller repeating an offer in a day counts once.
      </Typography>
      <BazaarControls state={ctl} set={set} quests={quests} onExport={() => void exportCsv(sum.items, sum.lastDay)} />
      <HeardAlerts />
      {ctl.offers && <BazaarQuotes quotes={offersOf(sum.items)} title="Every offer of the items below" withItem maxHeight={420} />}
      {snap === null ? (
        <Typography variant="body2">Reading your log…</Typography>
      ) : picked === null || sum.lastDay === null ? (
        <Typography variant="body2">No trade offers {filtered ? 'match' : 'in your log yet'}.</Typography>
      ) : (
        <>
          <PickedPanel item={picked} endDay={sum.lastDay} ignoreOutliers={ctl.ignoreOutliers} hidden={detailHidden} setHidden={setDetailHidden} onOpenLoot={onOpenLoot} />
          <Box ref={scrollRef} sx={{ overflow: 'auto', maxHeight: 'calc(100vh - 140px)', overscrollBehavior: 'contain' }} data-testid="bazaar-scroll">
            <Table size="small" stickyHeader>
              <SortHead sort={sort} onSort={onSort} />
              <TableBody>
                <BazaarPadRow height={win.topPad} />
                {sum.items.slice(win.start, win.end).map((i) => (
                  <BazaarItemRow
                    key={i.key}
                    item={i}
                    endDay={sum.lastDay ?? i.lastDay}
                    picked={i.key === picked.key}
                    iconId={factsOf(i.item)?.iconId}
                    wished={wished.has(itemTierKey(i.item))}
                    watch={i.combined !== undefined ? watchOnItem(watch, i.item) : findWatch(watch, i.item, i.tier)}
                    onPick={onPick}
                    onOpenLoot={onOpenLoot}
                  />
                ))}
                <BazaarPadRow height={win.bottomPad} />
              </TableBody>
            </Table>
          </Box>
        </>
      )}
    </Stack>
  )
}
