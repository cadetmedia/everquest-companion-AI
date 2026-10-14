// factions/FactionControls.tsx — the tab's two control rows: the WORK filters (class, reward
// slot) and the ROW filters (search, the two hide-toggles, the shown-of-total count). Split out
// of FactionsView.tsx at the measured file ceiling (split, never ratchet).

import { type JSX } from 'react'
import {
  Box,
  Button,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography
} from '@mui/material'
import { CLASS_ABBRS, type ClassAbbr } from '@shared/classCombo'
import { classDisplayName } from '@shared/spellLevels'
import { EQUIP_SLOTS } from '@shared/planner/types'
import ChipMultiSelect from '../../components/ChipMultiSelect'
import type { RowSort, SortKey } from './factionDerive'
import type { SlotFilter } from './factionFilters'

/** The table's header: three sortable columns (Faction, Regard, Standing) and the ladder's. */
export function FactionTableHead({
  sort,
  onSort
}: {
  sort: RowSort
  onSort: (key: SortKey) => void
}): JSX.Element {
  const cell = (key: SortKey, label: string, align?: 'right'): JSX.Element => (
    <TableCell align={align} sortDirection={sort.key === key ? sort.dir : false}>
      <TableSortLabel
        active={sort.key === key}
        direction={sort.key === key ? sort.dir : 'asc'}
        onClick={() => {
          onSort(key)
        }}
        data-testid={`factions-sort-${key}`}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  )
  return (
    <TableHead>
      <TableRow>
        {cell('name', 'Faction')}
        <TableCell padding="none" align="center">
          Ignore
        </TableCell>
        {cell('regard', 'Regard')}
        {cell('standing', 'Standing', 'right')}
        <TableCell>On the ladder</TableCell>
      </TableRow>
    </TableHead>
  )
}

/** The WORK filters: which class the quests must serve, which slot their gear rewards must fill.
 *  `ANY` on the slot deliberately keeps quests with no gear rewards at all (factionFilters.ts). */
export function WorkFilterControls({
  classes,
  onClasses,
  slot,
  onSlot,
  coinOnly,
  onCoinOnly,
  cleanOnly,
  onCleanOnly,
  dontCareCount
}: {
  classes: ClassAbbr[]
  onClasses: (v: ClassAbbr[]) => void
  slot: SlotFilter
  onSlot: (v: SlotFilter) => void
  coinOnly: boolean
  onCoinOnly: (on: boolean) => void
  cleanOnly: boolean
  onCleanOnly: (on: boolean) => void
  /** how many factions carry the don't-care mark — the clean switch's label says it */
  dontCareCount: number
}): JSX.Element {
  return (
    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
      <ChipMultiSelect
        options={CLASS_ABBRS}
        value={classes}
        onChange={onClasses}
        label="Filter quests by class"
        placeholder="Any class"
        optionLabel={classDisplayName}
        minWidth={260}
        testId="factions-class-filter"
      />
      <TextField
        select
        size="small"
        label="Reward slot"
        value={slot}
        onChange={(e) => {
          onSlot(e.target.value as SlotFilter)
        }}
        slotProps={{ htmlInput: { 'data-testid': 'factions-slot-filter' } }}
        sx={{ width: 160 }}
      >
        <MenuItem value="ANY">Any reward</MenuItem>
        {EQUIP_SLOTS.map((s) => (
          <MenuItem key={s} value={s}>
            {s}
          </MenuItem>
        ))}
      </TextField>
      {/* The pure DONATION quests — a stated coin turn-in and nothing to farm first: the
          walk-up-with-2-gold faction work the guard quests are famous for. */}
      <FilterSwitch
        label="Gold only"
        checked={coinOnly}
        onChange={onCoinOnly}
        testId="factions-coin-only"
      />
      {/* THE EASY-RAISE HUNT (owner ask, 2026-10-12): only quests whose every stated loss lands
          on a faction marked don't-care. Marks are made by clicking a faction on any quest's
          receipt, or on an expanded faction's own line. */}
      <Box title="Only quests whose stated faction losses all land on factions you marked don't care. Click a faction on a quest's receipt to mark it.">
        <FilterSwitch
          label={`No loss I care about (${String(dontCareCount)} don't care)`}
          checked={cleanOnly}
          onChange={onCleanOnly}
          testId="factions-clean-only"
        />
      </Box>
    </Stack>
  )
}

/** One filter switch: a small labelled toggle with its own count. A `disabledHint` renders it
 *  inert with the reason on hover — a control that cannot work says why, never just (0). */
function FilterSwitch({
  label,
  checked,
  onChange,
  disabledHint,
  testId
}: {
  label: string
  checked: boolean
  onChange: (on: boolean) => void
  disabledHint?: string
  testId: string
}): JSX.Element {
  return (
    <FormControlLabel
      title={disabledHint}
      disabled={disabledHint !== undefined}
      control={
        <Switch
          size="small"
          checked={checked}
          onChange={(e) => {
            onChange(e.target.checked)
          }}
          data-testid={testId}
        />
      }
      label={label}
      slotProps={{ typography: { variant: 'caption', color: 'text.secondary' } }}
    />
  )
}

/** The race-gate controls: the hunt switch (disabled with its reason until an achievements dump
 *  exists) and — only while it is on — its two refinements: the still-needed switch that drops
 *  settled gates, and the race picker that keeps only the picked races' gates.
 *  Split out of `FilterBar` at the 100-line function ceiling. */
function RaceGateSwitches({
  toggles,
  unlockers,
  unlocksKnown,
  raceOptions
}: {
  toggles: {
    unlocksOnly: boolean
    onUnlocksOnly: (on: boolean) => void
    unlocksPending: boolean
    onUnlocksPending: (on: boolean) => void
    races: string[]
    onRaces: (v: string[]) => void
  }
  unlockers: number
  unlocksKnown: boolean
  raceOptions: readonly string[]
}): JSX.Element {
  return (
    <>
      <FilterSwitch
        label={`Unlocks a race (${String(unlockers)})`}
        checked={toggles.unlocksOnly}
        onChange={toggles.onUnlocksOnly}
        disabledHint={
          unlocksKnown
            ? undefined
            : 'The race requirements come from the achievements export - type /outputfile achievements in game and this lights up.'
        }
        testId="factions-unlocks-only"
      />
      {/* The refinement, offered only while the gate hunt is on: drop the gates this character
          has already settled (the ✓ ones stay visible by default for the friend case). */}
      {toggles.unlocksOnly && (
        <FilterSwitch
          label="Still needed"
          checked={toggles.unlocksPending}
          onChange={toggles.onUnlocksPending}
          testId="factions-unlocks-pending"
        />
      )}
      {/* WHICH race: the dump's own race list as a closed pick, empty meaning every race. A
          player working toward one unlock wants that race's factions and nothing else on the
          table; a friend helping wants the same list for the friend's race. */}
      {toggles.unlocksOnly && (
        <ChipMultiSelect
          options={raceOptions}
          value={toggles.races}
          onChange={toggles.onRaces}
          label="Race"
          placeholder="Any race"
          minWidth={200}
          testId="factions-race-filter"
        />
      )}
    </>
  )
}

/** The windows the moved-recently filter offers, in minutes. */
const RECENT_WINDOWS: readonly { min: number; label: string }[] = [
  { min: 15, label: '15 min' },
  { min: 30, label: '30 min' },
  { min: 60, label: '1 hour' },
  { min: 180, label: '3 hours' }
]

/** The "what am I working on" filter (owner ask, 2026-10-13): only the factions the log moved
 *  inside the window, and the window's picker beside it while it is on. */
function RecentSwitch({
  toggles,
  count
}: {
  toggles: {
    recentOnly: boolean
    onRecentOnly: (on: boolean) => void
    recentMinutes: number
    onRecentMinutes: (min: number) => void
  }
  count: number
}): JSX.Element {
  return (
    <>
      <Box title="Only the factions whose standing the log reported changing inside the window. Each moved row wears a chip with how many times and by how much.">
        <FilterSwitch
          label={`Moved recently (${String(count)})`}
          checked={toggles.recentOnly}
          onChange={toggles.onRecentOnly}
          testId="factions-recent-only"
        />
      </Box>
      {toggles.recentOnly && (
        <TextField
          select
          size="small"
          label="Within"
          value={toggles.recentMinutes}
          onChange={(e) => {
            toggles.onRecentMinutes(Number(e.target.value))
          }}
          slotProps={{ htmlInput: { 'data-testid': 'factions-recent-window' } }}
          sx={{ width: 120 }}
        >
          {RECENT_WINDOWS.map((w) => (
            <MenuItem key={w.min} value={w.min}>
              {w.label}
            </MenuItem>
          ))}
        </TextField>
      )}
    </>
  )
}

/** The row controls: search, the two hide-toggles, and the shown-of-total count on the far end. */
export function FilterBar({
  query,
  onQuery,
  toggles,
  counts,
  unlocksKnown,
  raceOptions,
  expandedCount,
  onCollapseAll
}: {
  query: string
  onQuery: (q: string) => void
  toggles: {
    hideUntouched: boolean
    onHideUntouched: (on: boolean) => void
    hideMaxed: boolean
    onHideMaxed: (on: boolean) => void
    unlocksOnly: boolean
    onUnlocksOnly: (on: boolean) => void
    unlocksPending: boolean
    onUnlocksPending: (on: boolean) => void
    races: string[]
    onRaces: (v: string[]) => void
    rewardsOnly: boolean
    onRewardsOnly: (on: boolean) => void
    recentOnly: boolean
    onRecentOnly: (on: boolean) => void
    recentMinutes: number
    onRecentMinutes: (min: number) => void
  }
  counts: { untouched: number; maxed: number; unlockers: number; recent: number; shown: number; total: number }
  /** the achievements dump's races, verbatim — the race picker's closed list (empty without one) */
  raceOptions: readonly string[]
  /** false until an achievements dump has been loaded — the race filter's whole data source */
  unlocksKnown: boolean
  /** how many rows are expanded — the collapse-all affordance shows only while any are */
  expandedCount: number
  onCollapseAll: () => void
}): JSX.Element {
  return (
    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
      <TextField
        size="small"
        placeholder="Search factions, quests, items…"
        value={query}
        onChange={(e) => {
          onQuery(e.target.value)
        }}
        slotProps={{ htmlInput: { 'data-testid': 'factions-search' } }}
        sx={{ width: 260 }}
      />
      {/* The search's SCOPE, beside the box it scopes: rewards-only finds the quest that GRANTS
          an item (the chain's final step) instead of everything that consumes one. */}
      <FilterSwitch
        label="Rewards only"
        checked={toggles.rewardsOnly}
        onChange={toggles.onRewardsOnly}
        testId="factions-rewards-only"
      />
      <RecentSwitch toggles={toggles} count={counts.recent} />
      <FilterSwitch
        label={`Hide untouched (${String(counts.untouched)})`}
        checked={toggles.hideUntouched}
        onChange={toggles.onHideUntouched}
        testId="factions-hide-untouched"
      />
      <FilterSwitch
        label={`Hide maxed (${String(counts.maxed)})`}
        checked={toggles.hideMaxed}
        onChange={toggles.onHideMaxed}
        testId="factions-hide-maxed"
      />
      {/* Only the factions still GATING a race unlock — each row's chip says which race. The
          count is 0 without an achievements dump, and the switch is honest about that: it shows
          an empty table rather than pretending to know. */}
      <RaceGateSwitches
        toggles={toggles}
        unlockers={counts.unlockers}
        unlocksKnown={unlocksKnown}
        raceOptions={raceOptions}
      />
      <Box sx={{ flexGrow: 1 }} />
      {expandedCount > 0 && (
        <Button
          size="small"
          variant="text"
          onClick={onCollapseAll}
          data-testid="factions-collapse-all"
          sx={{ minWidth: 0, px: 0.75, py: 0, textTransform: 'none', color: 'text.secondary' }}
        >
          Collapse all ({expandedCount})
        </Button>
      )}
      <Typography variant="caption" color="text.secondary" data-testid="factions-count">
        {counts.shown} of {counts.total}
      </Typography>
    </Stack>
  )
}
