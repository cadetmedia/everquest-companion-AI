// spells/SpellbookToolbar.tsx — THE FILTERS, AND THE ONE SLIDER THAT MOVES EVERY NUMBER BELOW.
//
// Split from `SpellbookView` because that file is at this tree's 400-code-line factoring ceiling
// and because these are two subjects: a toolbar is about ASKING, and the view under it is about
// answering. Nothing here holds state - every control is driven by the view's `SpellbookQuery` and
// reports a whole new one, which is what keeps "what is the list showing" a single value.
//
// ── THE TIER SLIDER IS THE GEAR TAB'S, IN THIS TAB'S VOCABULARY ────────────────────────────────
//
// `gear/UpgradeSlider.tsx` is the precedent and its law is the one that matters: the control says
// what it is simulating PERMANENTLY, at every position including base, so nobody reads a scaled
// number thinking it is their own. The gear tab measured 6,766 rows at ~18 ms and shipped a live
// slider on that; this corpus is a third of that size and does strictly less per row, so a live one
// is affordable here too - and the view still reads the tier through `useDeferredValue`, so the
// thumb never waits on a re-sort.
//
// AND IT SAYS WHICH NUMBERS ARE ACTUALLY MOVING, which the gear slider never had to. A gear tier
// lifts every stat on the item; a spell tier lifts damage on a nuke, ticks on a DoT, nothing at all
// on a buff's grants. A slider that silently did nothing for half the corpus would read as broken,
// so the caption names the rate the CURRENT category filter implies, and says plainly when the
// filtered set has no magnitudes to move.

import type { JSX } from 'react'
import { Chip, Stack, TextField, Typography } from '@mui/material'
import type { GearClasses } from '../gear/gearData'
import {
  UPGRADE_CATEGORIES,
  UPGRADE_CATEGORY_LABEL,
  type UpgradeCategory
} from '@shared/spellUpgrade'
import { magnitudeRatePercent, type SpellbookQuery } from '@shared/spellbook'
import ChipMultiSelect from '../../components/ChipMultiSelect'
import SpellTierSlider, { tierLabel } from './SpellTierSlider'
import { SpellClassOffer, SpellClassPicker } from './SpellClassFilter'

// Re-exported: it moved to the shared control and this module was its home.
export { tierLabel }

/**
 * What the slider is DOING to the visible list, in one clause.
 *
 * The categories currently filtered to decide this: with `nuke` picked it is "+6% damage a tier",
 * with `buff` picked it is the honest "no magnitudes move". With nothing picked the corpus holds
 * both kinds and the caption says so rather than picking a number that is wrong for half the rows.
 */
export function tierEffectNote(categories: readonly UpgradeCategory[]): string {
  const picked = categories.length > 0 ? categories : UPGRADE_CATEGORIES
  const rates = new Set(picked.map(magnitudeRatePercent))
  if (rates.size === 1) {
    const only = [...rates][0]
    return only === null
      ? 'these categories gain duration, mana and cast time only - their numbers do not change'
      : `+${String(only)}% to the numbers per tier, plus mana and cast time`
  }
  return 'mixed categories - each row moves at its own rate'
}

export interface SpellbookToolbarProps {
  query: SpellbookQuery
  onQuery: (next: SpellbookQuery) => void
  tier: number
  onTier: (next: number) => void
  /**
   * The class filter's whole state - the pinned list, what the app detects, and the two writers.
   *
   * The SAME hook the Gear tab runs (`useFollowingClasses`), under this tab's own storage key. It
   * is passed in rather than called here because a toolbar that owned it would hold a second copy
   * of the same key, and only one of the two would re-read storage after the other wrote it -
   * `useBrowseClasses`' own mount-once rule.
   */
  classes: GearClasses
  /** How many rows survived, so the toolbar can say what it did. */
  shown: number
  total: number
}

/** The props the two rows share. Split out so neither row re-declares the query contract. */
type RowProps = Pick<SpellbookToolbarProps, 'query' | 'onQuery'>

/**
 * ROW ONE - what to show. Search, the two pickers, and the two one-click questions.
 *
 * Its own component because the toolbar crossed this tree's 100-line-per-function ceiling, and the
 * seam the ceiling was pointing at is the real one: this row asks WHICH SPELLS and the row below
 * asks AT WHAT TIER, which are different questions that happen to sit together.
 */
function FilterRow({
  query,
  onQuery,
  classes
}: RowProps & { classes: GearClasses }): JSX.Element {
  const categories = query.categories ?? []
  const worth = query.payoffMagnitudeOnly === true
  const newest = query.newestOnly === true
  const inEra = query.inEraOnly === true
  return (
    <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
      <TextField
        size="small"
        label="Search spells"
        value={query.text ?? ''}
        onChange={(e) => onQuery({ ...query, text: e.target.value })}
        slotProps={{ htmlInput: { 'data-testid': 'spellbook-search' } }}
        sx={{ minWidth: 200 }}
      />
      {/* THE GEAR TAB'S CLASS FILTER, WHOLE - `SpellClassFilter`, which the Upgrades tab draws too. */}
      <SpellClassPicker classes={classes} />
      <ChipMultiSelect
        options={UPGRADE_CATEGORIES}
        value={[...categories]}
        onChange={(next) => onQuery({ ...query, categories: next })}
        label="Kind"
        placeholder="every kind"
        optionLabel={(c) => UPGRADE_CATEGORY_LABEL[c]}
        minWidth={150}
      />
      {/* ONE CLICK TO THE QUESTION MOST READERS ARRIVE WITH. It is a chip rather than a default
          because a browser that opened pre-filtered to your trio would answer a question the reader
          had not asked yet - and the owner's standing ask was explicitly to be able to look OUTSIDE
          his classes in order to compare. */}
      {/* THE OFFER, not a toggle - `SpellClassFilter` says what it does. */}
      <SpellClassOffer classes={classes} />
      {/* The owner's question 2, as one click: hide everything a tier does not improve. */}
      {/* THE OWNER'S THIRD ONE-CLICK QUESTION (2026-09-10): *"I don't need to see 5 different
          versions of regeneration or poison resist"*. It hides a rung whose own line has a later
          one for the classes on screen - `SpellbookQuery.newestOnly` states why that is read off
          the shipped ladders rather than matched on names. */}
      {/* MALKIL'S ASK (2026-09-10): *"It's also showing spells that are not yet available in EQL.
          This wouldn't be a problem if it could be toggled to not show them."* The fold has had
          `inEraOnly` since it was written; what it never had was a control. OFF by default, and
          the hint says why: he also reports that *"there are some 'out of era' spells and items
          that are available in EQL"*, so this narrows on a verdict that is the wiki's rather than
          the game's, and defaulting it on would hide spells he can really buy. */}
      <Chip
        size="small"
        label="In era only"
        title="Hide spells the wiki places outside the current era. The verdict is the wiki's, not the game's, and it is wrong about a few - so this is a filter you turn on, not a default."
        data-testid="spellbook-era-only"
        color={inEra ? 'primary' : 'default'}
        variant={inEra ? 'filled' : 'outlined'}
        onClick={() => onQuery({ ...query, inEraOnly: inEra ? undefined : true })}
      />
      <Chip
        size="small"
        label="Newest rank only"
        title="Show only the top rung of each SPELL LINE - the Line column names it, and hovering a row says what it replaces. It reads the shipped ladders rather than matching names, which is why Regeneration hides behind Regrowth. Scoped to the classes you are showing: a rung is only hidden when its replacement is on screen too."
        data-testid="spellbook-newest-only"
        color={newest ? 'primary' : 'default'}
        variant={newest ? 'filled' : 'outlined'}
        onClick={() => onQuery({ ...query, newestOnly: newest ? undefined : true })}
      />
      <Chip
        size="small"
        label="Worth upgrading"
        title="Only spells whose damage or healing actually rises with a mote tier. Everything else buys duration, mana and cast time only."
        data-testid="spellbook-worth-upgrading"
        color={worth ? 'primary' : 'default'}
        variant={worth ? 'filled' : 'outlined'}
        onClick={() => onQuery({ ...query, payoffMagnitudeOnly: worth ? undefined : true })}
      />
    </Stack>
  )
}

/** ROW TWO - at what tier, what that does, and how many rows survived. */
function TierRow({
  categories,
  tier,
  onTier,
  shown,
  total
}: {
  categories: readonly UpgradeCategory[]
  tier: number
  onTier: (next: number) => void
  shown: number
  total: number
}): JSX.Element {
  return (
    <SpellTierSlider
      tier={tier}
      onTier={onTier}
      note={tierEffectNote(categories)}
      testId="spellbook-tier-slider"
      trailing={
        <Typography variant="caption" color="text.secondary" data-testid="spellbook-count">
          {shown === total ? `${String(total)} spells` : `${String(shown)} of ${String(total)} spells`}
        </Typography>
      }
    />
  )
}

export default function SpellbookToolbar({
  query,
  onQuery,
  tier,
  onTier,
  classes,
  shown,
  total
}: SpellbookToolbarProps): JSX.Element {
  return (
    <Stack spacing={1} sx={{ mb: 1 }} data-testid="spellbook-toolbar">
      <FilterRow query={query} onQuery={onQuery} classes={classes} />
      <TierRow
        categories={query.categories ?? []}
        tier={tier}
        onTier={onTier}
        shown={shown}
        total={total}
      />
    </Stack>
  )
}
