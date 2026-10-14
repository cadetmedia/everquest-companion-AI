// BazaarQuotes — who is selling or asking, and what they said (owner ask, 2026-10-07): counted
// offers one line each, newest first, as the engine quoted them. Under the picked item for its
// tier, and on its own as the whole offers list the toolbar's Offers list button shows. Every
// column sorts and a Who box narrows it to one person (owner ask, 2026-10-13; the order and the
// filter are shared/bazaarQuotes.ts).

import { type JSX, useMemo, useState } from 'react'
import { Autocomplete, Box, Stack, Table, TableBody, TableCell, TableHead, TableRow, TableSortLabel, TextField, Typography } from '@mui/material'
import { formatPlat, type DayQuote } from '@shared/bazaar'
import {
  DEFAULT_QUOTE_SORT,
  firstQuoteSortDir,
  quoteSpeakers,
  quotesBy,
  sortQuotes,
  repeatSpeakers,
  speakerAverages,
  type QuoteSort,
  type SpeakerAverage,
  type QuoteSortKey
} from '@shared/bazaarQuotes'
import { ASK_COLOR, OFFER_COLOR } from './BazaarChart'

const DIR_LABEL = { sell: 'Selling', buy: 'Buying', trade: 'Trading' } as const
/** Lines drawn at once; the CSV export carries every one. */
const SHOWN = 500

function QuoteRow({ q, withItem }: { q: DayQuote; withItem: boolean }): JSX.Element {
  return (
    <TableRow>
      <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
        {q.day.slice(5)} {q.at.slice(0, 5)}
      </TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap' }}>{q.who}</TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap', color: q.dir === 'sell' ? ASK_COLOR : q.dir === 'buy' ? OFFER_COLOR : 'text.secondary' }}>
        {DIR_LABEL[q.dir]}
      </TableCell>
      {withItem && (
        <TableCell sx={{ whiteSpace: 'nowrap' }}>
          {q.item}
          {q.tier > 0 ? ` +${q.tier}` : ''}
        </TableCell>
      )}
      <TableCell align="right">{formatPlat(q.price)}</TableCell>
      <TableCell sx={{ color: 'text.secondary' }}>{q.msg}</TableCell>
    </TableRow>
  )
}

/** The columns: header, sort key, alignment; the Item column only on the whole offers list. */
const COLUMNS: readonly (readonly [string, QuoteSortKey, 'left' | 'right'])[] = [
  ['When', 'when', 'left'],
  ['Who', 'who', 'left'],
  ['', 'dir', 'left'],
  ['Item', 'item', 'left'],
  ['Price', 'price', 'right'],
  ['What they said', 'msg', 'left']
]

function SortHead({ sort, onSort, withItem }: { sort: QuoteSort; onSort: (k: QuoteSortKey) => void; withItem: boolean }): JSX.Element {
  return (
    <TableHead>
      <TableRow>
        {COLUMNS.filter(([, k]) => withItem || k !== 'item').map(([label, key, align]) => (
          <TableCell key={key} align={align} sortDirection={sort.key === key ? sort.dir : false}>
            <TableSortLabel
              active={sort.key === key}
              direction={sort.key === key ? sort.dir : 'asc'}
              onClick={() => {
                onSort(key)
              }}
              data-testid={`bazaar-quotes-sort-${key}`}
            >
              {label === '' ? 'Side' : label}
            </TableSortLabel>
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  )
}

/** `sells avg 3.2k (4 offers) · buys avg 143p (2 offers)`: a person's last (up to
 *  SPEAKER_AVG_LAST) priced offers for this item, each side apart. */
function averageText(a: SpeakerAverage | undefined): string {
  const parts: string[] = []
  const offers = (n: number): string => `${String(n)} offer${n === 1 ? '' : 's'}`
  if (a?.sell) parts.push(`sells avg ${formatPlat(a.sell.avg)} (${offers(a.sell.n)})`)
  if (a?.buy) parts.push(`buys avg ${formatPlat(a.buy.avg)} (${offers(a.buy.n)})`)
  return parts.join(' · ')
}

/**
 * The Who box: everyone who posted in this list, busiest first; empty shows everyone. On one
 * item's list each name carries its average over the person's last ten priced offers (owner ask,
 * 2026-10-13); the whole offers list mixes items, where a mean means nothing, so names stand alone.
 */
function WhoFilter({
  quotes,
  who,
  onWho,
  withAverages
}: {
  quotes: readonly DayQuote[]
  who: string | null
  onWho: (w: string | null) => void
  withAverages: boolean
}): JSX.Element {
  const averages = useMemo(() => (withAverages ? speakerAverages(quotes) : null), [quotes, withAverages])
  // On one item, only people with two or more priced offers are offered (owner ask, 2026-10-13).
  const people = useMemo(() => (averages ? repeatSpeakers(averages) : quoteSpeakers(quotes)), [averages, quotes])
  return (
    <Autocomplete
      size="small"
      options={people}
      value={who}
      onChange={(_e, v) => {
        onWho(v)
      }}
      sx={{ width: 220 }}
      slotProps={{ popper: { sx: { minWidth: 300 } } }}
      renderOption={(props, name) => {
        const text = averageText(averages?.get(name))
        return (
          <li {...props} key={name}>
            <Stack sx={{ minWidth: 0 }}>
              <span>{name}</span>
              {text !== '' && (
                <Typography variant="caption" color="text.secondary">
                  {text}
                </Typography>
              )}
            </Stack>
          </li>
        )
      }}
      renderInput={(params) => <TextField {...params} label="Who" placeholder="Everyone" />}
      data-testid="bazaar-quotes-who"
    />
  )
}

export default function BazaarQuotes({ quotes, title, withItem = false, maxHeight = 260 }: { quotes: readonly DayQuote[]; title: string; withItem?: boolean; maxHeight?: number }): JSX.Element | null {
  const [sort, setSort] = useState<QuoteSort>(DEFAULT_QUOTE_SORT)
  const [who, setWho] = useState<string | null>(null)
  const ordered = useMemo(() => sortQuotes(quotesBy(quotes, who), sort), [quotes, who, sort])
  if (quotes.length === 0) return null
  const onSort = (key: QuoteSortKey): void => {
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: firstQuoteSortDir(key) }))
  }
  const shown = ordered.slice(0, SHOWN)
  return (
    <Box data-testid={withItem ? 'bazaar-offers' : 'bazaar-quotes'}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          {title}
          {ordered.length > shown.length ? ` (first ${shown.length} of ${ordered.length}; Export CSV has them all)` : ''}
        </Typography>
        <WhoFilter quotes={quotes} who={who} onWho={setWho} withAverages={!withItem} />
      </Stack>
      <Box sx={{ maxHeight, overflowY: 'auto' }}>
        <Table size="small" stickyHeader>
          <SortHead sort={sort} onSort={onSort} withItem={withItem} />
          <TableBody>
            {shown.map((q, i) => (
              <QuoteRow key={`${q.day} ${q.at} ${q.who} ${q.item} ${q.tier} ${i}`} q={q} withItem={withItem} />
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  )
}
