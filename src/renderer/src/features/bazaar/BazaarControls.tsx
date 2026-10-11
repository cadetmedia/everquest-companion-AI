// BazaarControls — the Bazaar tab's toolbar: search, direction, which items to show (all, the wish
// list or the watchlist), Popular with its price floor, the Tradeskill picker and the Quest search,
// how far back prices count, All tiers as one with its Price at slider, Ignore outliers, whether
// items the wiki marks No Drop or No Trade show at all, and the offers list with its CSV export.

import { type JSX } from 'react'
import { Autocomplete, Box, Button, FormControlLabel, MenuItem, Slider, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material'
import type { BazaarDir } from '@shared/bazaar'
import { TRADESKILLS } from '@shared/tradeskills'

export type BazaarShow = 'all' | 'wish' | 'watched'

const SHOW_LABEL: Record<BazaarShow, string> = {
  all: 'All items',
  wish: 'On my wish list',
  watched: 'My watchlist'
}

/** Price floors, in platinum, labelled the way trade chat says them: anything under 1P is not worth the trip. */
export const MIN_PRICES: { pp: number; label: string }[] = [
  { pp: 0, label: 'All' },
  { pp: 1, label: '1P and up' },
  { pp: 100, label: '100P and up' },
  { pp: 1000, label: '1K and up' },
  { pp: 10_000, label: '10K and up' },
  { pp: 100_000, label: '100K and up' }
]

/** How far back prices count, in days counted back from the log's newest day; 0 is every day. */
export const SINCE_DAYS: { days: number; label: string }[] = [
  { days: 0, label: 'All days' },
  { days: 10, label: 'Last 10 days' },
  { days: 15, label: 'Last 15 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 60, label: 'Last 60 days' }
]

/** Most upgraded offers in the owner's log are +4 (the instances people run), so the slider starts there. */
export const DEFAULT_PRICE_TIER = 4

export interface BazaarControlState {
  text: string
  dir: BazaarDir | 'all'
  show: BazaarShow
  popular: boolean
  minPrice: number
  /** Leave out items the wiki marks No Drop or No Trade: chat sometimes offers what cannot trade. */
  hideNoTrade: boolean
  /** Show every offer as said, in a list, instead of only the per-item summary. */
  offers: boolean
  /** One row per item, every tier read as one tier (shared/bazaarTiers.ts). */
  combineTiers: boolean
  /** With combineTiers, the tier every price is read at. */
  priceTier: number
  /** Only the last this-many days; 0 is every day. */
  sinceDays: number
  /** Only items an ingredient of, or made by, this tradeskill (shared/tradeskills.ts); '' is any. */
  tradeskill: string
  /** Only items a quest whose name contains this uses; '' is any. */
  quest: string
  /** Leave out a price more than four times above or below the item's usual price (shared/bazaar.ts). */
  ignoreOutliers: boolean
}

interface Props {
  state: BazaarControlState
  set: (patch: Partial<BazaarControlState>) => void
}

/** What the item is for: the Tradeskill picker and the Quest search, off the wiki's recipes and quests. */
function PurposeControls({ state, set, quests }: Props & { quests: readonly string[] }): JSX.Element {
  return (
    <>
      <TextField
        select
        size="small"
        label="Tradeskill"
        value={state.tradeskill}
        onChange={(ev) => set({ tradeskill: ev.target.value })}
        sx={{ minWidth: 150 }}
        slotProps={{ htmlInput: { 'data-testid': 'bazaar-tradeskill' } }}
      >
        <MenuItem value="">Any</MenuItem>
        {TRADESKILLS.map((t) => (
          <MenuItem key={t} value={t}>
            {t}
          </MenuItem>
        ))}
      </TextField>
      <Autocomplete
        freeSolo
        size="small"
        options={quests}
        inputValue={state.quest}
        onInputChange={(_e, v) => set({ quest: v })}
        sx={{ minWidth: 220 }}
        renderInput={(params) => <TextField {...params} label="Quest" placeholder="Part of a quest name" slotProps={{ htmlInput: { ...params.inputProps, 'data-testid': 'bazaar-quest' } }} />}
      />
    </>
  )
}

/** Which items: search, direction, the Show picker, Popular and its price floor, and what the item is for. */
function FilterControls({ state, set, quests }: Props & { quests: readonly string[] }): JSX.Element {
  return (
    <>
      <TextField
        size="small"
        placeholder="Search items"
        value={state.text}
        onChange={(ev) => set({ text: ev.target.value })}
        slotProps={{ htmlInput: { 'data-testid': 'bazaar-search' } }}
      />
      <ToggleButtonGroup size="small" exclusive value={state.dir} onChange={(_e, v: BazaarDir | 'all' | null) => v !== null && set({ dir: v })}>
        <ToggleButton value="all">All</ToggleButton>
        <ToggleButton value="sell">Selling</ToggleButton>
        <ToggleButton value="buy">Buying</ToggleButton>
        <ToggleButton value="trade">Trading</ToggleButton>
      </ToggleButtonGroup>
      <TextField
        select
        size="small"
        label="Show"
        value={state.show}
        onChange={(ev) => set({ show: ev.target.value as BazaarShow })}
        sx={{ minWidth: 170 }}
        slotProps={{ htmlInput: { 'data-testid': 'bazaar-show' } }}
      >
        {(Object.keys(SHOW_LABEL) as BazaarShow[]).map((k) => (
          <MenuItem key={k} value={k}>
            {SHOW_LABEL[k]}
          </MenuItem>
        ))}
      </TextField>
      <ToggleButton
        size="small"
        value="popular"
        selected={state.popular}
        onChange={() => set({ popular: !state.popular })}
        data-testid="bazaar-popular"
        title="Rank by platinum changing hands over the last 30 days: price times offers"
      >
        Popular
      </ToggleButton>
      <TextField
        select
        size="small"
        label="Price"
        value={state.minPrice}
        onChange={(ev) => set({ minPrice: Number(ev.target.value) })}
        sx={{ minWidth: 140 }}
        slotProps={{ htmlInput: { 'data-testid': 'bazaar-min-price' } }}
      >
        {MIN_PRICES.map((m) => (
          <MenuItem key={m.pp} value={m.pp}>
            {m.label}
          </MenuItem>
        ))}
      </TextField>
      <PurposeControls state={state} set={set} quests={quests} />
    </>
  )
}

/** How far back, and how prices are read: the days window, All tiers as one with its Price at slider, and Ignore outliers. */
function WindowControls({ state, set }: Props): JSX.Element {
  return (
    <>
      <TextField
        select
        size="small"
        label="Days"
        value={state.sinceDays}
        onChange={(ev) => set({ sinceDays: Number(ev.target.value) })}
        sx={{ minWidth: 140 }}
        slotProps={{ htmlInput: { 'data-testid': 'bazaar-since-days' } }}
      >
        {SINCE_DAYS.map((d) => (
          <MenuItem key={d.days} value={d.days}>
            {d.label}
          </MenuItem>
        ))}
      </TextField>
      <FormControlLabel
        control={<Switch size="small" checked={state.combineTiers} onChange={(_e, on) => set({ combineTiers: on })} data-testid="bazaar-combine-tiers" />}
        label="All tiers as one"
        title="One row per item: every tier's price read at one tier, by how much a tier adds for that item"
      />
      {state.combineTiers && (
        <Box sx={{ width: 190, px: 1 }} data-testid="bazaar-price-tier">
          <Typography variant="caption" color="text.secondary">
            Price at +{state.priceTier}
          </Typography>
          <Slider
            size="small"
            min={0}
            max={10}
            step={1}
            marks
            value={state.priceTier}
            onChange={(_e, v) => set({ priceTier: Array.isArray(v) ? v[0] : v })}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `+${v}`}
          />
        </Box>
      )}
      <Tooltip title="Leave out a price more than four times above or below this item's usual price: one seller or buyer cannot move the shown prices by posting a wild number.">
        <FormControlLabel
          control={<Switch size="small" checked={state.ignoreOutliers} onChange={(_e, on) => set({ ignoreOutliers: on })} data-testid="bazaar-ignore-outliers" />}
          label="Ignore outliers"
        />
      </Tooltip>
    </>
  )
}

/** What the list leaves out and how it is shown: Hide No Drop, the offers list, and its CSV export. */
function ListControls({ state, set, onExport }: Props & { onExport: () => void }): JSX.Element {
  return (
    <>
      <FormControlLabel
        control={<Switch size="small" checked={state.hideNoTrade} onChange={(_e, on) => set({ hideNoTrade: on })} data-testid="bazaar-hide-notrade" />}
        label="Hide No Drop"
        title="Leave out items the wiki marks No Drop or No Trade"
      />
      <ToggleButton size="small" value="offers" selected={state.offers} onChange={() => set({ offers: !state.offers })} data-testid="bazaar-offers-toggle">
        Offers list
      </ToggleButton>
      <Button size="small" variant="outlined" onClick={onExport} data-testid="bazaar-export">
        Export CSV
      </Button>
    </>
  )
}

export default function BazaarControls({ state, set, quests, onExport }: Props & { quests: readonly string[]; onExport: () => void }): JSX.Element {
  return (
    <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
      <FilterControls state={state} set={set} quests={quests} />
      <WindowControls state={state} set={set} />
      <ListControls state={state} set={set} onExport={onExport} />
    </Stack>
  )
}
