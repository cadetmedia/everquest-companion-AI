// planner/PlannerChips.tsx — the planner's shared atoms: the state chip, the era chip, the
// no-slot chip, and a donor NAME that links.
//
// ONE CHIP PER SOCKET (UI conventions: chips convey STATE, never process). The Inventory cell and
// the Farm row show the same four states in the same colours, so a socket you looked at on the
// Inventory tab is recognisable in the rollup without re-reading it.
//
// THE DONOR NAME CLICKS (owner, 2026-08-04) — it is the app's standing link idiom (`openLoot`,
// appRouting): it takes the Loot tab over with that item's drill-down.
//
// IT NO LONGER HOVERS (JOS-143), and that is the same removal JOS-127 made on the Loot ledger.
// The name used to anchor `KnownItemTooltip` (lib/): a `placement="top"`, up-to-380px, INTERACTIVE
// card that holds `pointer-events: auto` for as long as it is up. Donor names are ROWS, and on
// both planner surfaces the rows sit directly under a toolbar full of dropdowns — the Effects
// browser's Slot and Group by selects (EffectFilterBar) and the board's Classes chip-select
// (PlannerView). A card opened from the first row of either list lands on those controls and eats
// the clicks aimed at them. `placement="top"` is what aims it there; removal, not a flip, is the
// owner's direction. The click survives, and it goes somewhere strictly better: the drill-down
// states the item window AND what the committed DBs know (ItemDbSources, below).
//
// WHY THE DRILL-DOWN IS NOW A FAIR DESTINATION. It used to be exactly the wrong one — its "Dropped
// by / Zones" columns were built from OBSERVED loot events alone, so a donor you have never looted
// answered "Times looted 0 · No source recorded" one click after a planner row told you which mob
// in which zone drops it. That contradiction is what `features/loot/ItemDbSources.tsx` closes: the
// drill now also states what the committed DBs know, labelled `db` beside the `observed` columns.
// With both witnesses on screen, the deep link is a promotion, not a downgrade.
//
// THE FIVE STATE CHIPS LOST THEIRS TOO (JOS-143). They are default-placement, so they open DOWN
// rather than onto a toolbar — but they render on the SAME rows as the donor name, and a file that
// is half popper-free is a file whose rule cannot be stated or guarded. Every sentence is a native
// title now, which is what these chips wanted all along: one word on screen, the explanation on
// hover, and nothing in the DOM that can take a click.

import type { JSX } from 'react'
import { Box, Chip } from '@mui/material'
import { EQ_ITEM_COLORS } from '../../lib/ItemWindow'
import { questOutOfEra } from '@shared/planner/era'
import { mobOutOfEra } from '@shared/mobEra'
import { useMetVersion } from '../../lib/useMetInLog'
import { eraChip, type EraSubject } from './plannerData'
import type { DonorProgress, DonorState } from './plannerProgress'

const CHIP_SX = { height: 18, fontSize: 10, '& .MuiChip-label': { px: 0.6 } } as const

type ChipColor = 'default' | 'primary' | 'success' | 'warning' | 'info'

const STATE_COLOR: Record<DonorState, ChipColor> = {
  planned: 'default',
  have: 'primary',
  partial: 'info',
  ready: 'success'
}

/** What each state MEANS, in the hover text — the chip itself stays one word. */
const STATE_HINT: Record<DonorState, string> = {
  planned: 'Nothing observed yet - no copy held, looted or merged.',
  have: 'You hold a copy, not yet merged.',
  partial: 'Merged to the tier shown, short of the extraction tier.',
  ready: 'The log saw this item merged to at least the tier its effect extracts at.'
}

/** The counts behind the chip, stated only when there are any (law 1: silence, not "0"). */
function evidence(progress: DonorProgress): string {
  const parts: string[] = []
  if (progress.held > 0) parts.push(`${String(progress.held)} in your last inventory dump`)
  if (progress.looted > 0) parts.push(`looted ${String(progress.looted)}×`)
  return parts.length === 0 ? '' : ` - ${parts.join(', ')}.`
}

/**
 * The ONE state chip a wanted item carries.
 *
 * `title` OVERRIDES THE SHARED SENTENCE, and exactly one caller needs it (JOS-326). The four hints
 * above are the DONOR vocabulary — `ready` means "the log saw this merged to at least the tier its
 * effect extracts at" — which is the right sentence for anything wanted for an effect and simply
 * not what a GEAR wish is about. Rather than teach this chip a second vocabulary it would have to
 * choose between, the one caller with a different rule states its own sentence and everything else
 * keeps the shared one by passing nothing. The COUNTS are still appended either way: they are
 * evidence, not vocabulary.
 */
export function StateChip({ progress, title }: { progress: DonorProgress; title?: string }): JSX.Element {
  return (
    <Chip
      size="small"
      label={progress.label}
      title={`${title ?? STATE_HINT[progress.state]}${evidence(progress)}`}
      data-testid="planner-state-chip"
      data-state={progress.state}
      color={STATE_COLOR[progress.state]}
      variant={progress.state === 'ready' ? 'filled' : 'outlined'}
      sx={CHIP_SX}
    />
  )
}

/**
 * The era chip, or nothing. An in-era donor says nothing at all (that is the normal case and
 * needs no decoration); `era?` means NOTHING states an era — not the catalog, not the item page's
 * own drop list, not its era banner — which is a fact about our tables, not about the item.
 *
 * The subject is the donor ROW wherever the caller has one, because the page's drop list and era
 * banner ride on it; a plan entry the corpus has no row for passes `{ key }` and gets the
 * catalog-only answer. `plannerData.eraChip` writes the hover text, so the chip never has to guess
 * which witness spoke.
 *
 * `outOnly` draws the chip for a positive out-of-era verdict and nothing for `era?` — for a surface
 * that is not a filter over the corpus (the loot drill-down), where a question mark says nothing.
 */
export function EraChip({ subject, outOnly }: { subject: EraSubject; outOnly?: boolean }): JSX.Element | null {
  // The player's own log outranks the wiki (lib/useMetInLog): redraw when it meets more.
  useMetVersion()
  const info = eraChip(subject)
  if (info === null || (outOnly === true && info.unknown)) return null
  return (
    <Chip
      size="small"
      label={info.label}
      title={info.tooltip}
      data-testid="planner-era-chip"
      color={info.unknown ? 'default' : 'warning'}
      variant="outlined"
      sx={CHIP_SX}
    />
  )
}

/**
 * The era chip's look for a wiki page that is NOT an item (a mob, a quest), on a LOOKUP surface — a
 * search result, a detail page — where an out-of-era row is kept and labelled rather than hidden.
 */
function OutOfEraPageChip({ title }: { title: string }): JSX.Element {
  return (
    <Chip
      size="small"
      label="out of era"
      title={title}
      data-testid="page-era-chip"
      color="warning"
      variant="outlined"
      sx={{ ...CHIP_SX, flexShrink: 0 }}
    />
  )
}

/**
 * A MOB's chip: drawn exactly when `shared/mobEra.ts mobOutOfEra` says so (the record's data-build
 * flag, unless the player's own log met the mob), and nothing otherwise — an absent flag is in era.
 */
export function MobEraChip({ mob }: { mob: Parameters<typeof mobOutOfEra>[0] }): JSX.Element | null {
  useMetVersion()
  if (!mobOutOfEra(mob)) return null
  return <OutOfEraPageChip title="The era rules put this mob out of era: this server has not opened its content." />
}

/**
 * A QUEST's chip: drawn exactly when `shared/planner/era.ts questOutOfEra` calls its page banner out
 * of era, and nothing for an absent or in-era tag — silence is not a verdict (law 1).
 */
export function QuestEraChip({ eraTag }: { eraTag?: string }): JSX.Element | null {
  if (eraTag === undefined || !questOutOfEra({ eraTag })) return null
  return <OutOfEraPageChip title={`Its wiki page is banner-tagged ${eraTag}, which the wiki marks out of era.`} />
}

/**
 * THE CROWN (V5) — this row carries the highest tier of its focus family that the current filters
 * left visible.
 *
 * Worded as "of the ones on screen" on purpose: turn the era filter off and a Velious donor may
 * take the crown, which is honest rather than surprising. Every row at the top tier wears it — if
 * three items carry Improved Healing III, all three ARE the best, and picking one to crown would
 * be the planner inventing a preference between them.
 */
export function BestChip(): JSX.Element {
  return (
    <Chip
      size="small"
      label="best"
      title="The highest tier of this focus family among the visible donors."
      data-testid="planner-best-chip"
      color="primary"
      sx={CHIP_SX}
    />
  )
}

/**
 * THE CLASS MISMATCH (V2) — this donor is already in the build and no longer matches the set's
 * class filter.
 *
 * NOTHING IS REMOVED, and that is the decision this chip exists to make visible: the trio is a
 * FILTER, not a rule, so re-inference or a loadout switch can never invalidate work you already
 * planned. It can only point at it. Same family as the era chip on purpose — both say "this row
 * survives, and here is why it looks out of place".
 *
 * THE LAW IS ABOUT PLANNED WORK, NOT ABOUT EVERY TABLE (owner ruling 2026-08-13, JOS-302). The Gear
 * tab's SEARCH table used to draw this chip too and no longer does: there a row is a CANDIDATE you
 * have not chosen, and a candidate your character cannot equip is not a candidate — so the class
 * picks remove it (`gearFilter.ts GearFilters.classes`). Here — PlanCell and FarmList, a donor
 * already placed in a build — the row is a decision, and the argument above stands unchanged.
 */
export function MismatchChip({ classes }: { classes: readonly string[] }): JSX.Element {
  return (
    <Chip
      size="small"
      label="off filter"
      title={`Usable by ${classes.join('/')}`}
      data-testid="planner-mismatch-chip"
      color="warning"
      sx={CHIP_SX}
    />
  )
}

/**
 * NO EQUIP SLOT — the R2 disqualifier, stated rather than assumed.
 *
 * An exaltation can only be socketed into an item sharing the donor's equipment slot, so a donor
 * with no slot can never legally donate; the browser's default filter drops these entirely and
 * this chip only ever appears once the escape toggle is on. It is worded as a fact about the PAGE,
 * not about the game (law 1): an empty slot list means the wiki stated none, which is nearly
 * always a consumable and occasionally a gap in the scrape.
 */
export function NoSlotChip(): JSX.Element {
  return (
    <Chip
      size="small"
      label="no slot"
      title="This page states no equipment slot, so its effect can never move."
      data-testid="planner-noslot-chip"
      color="warning"
      variant="outlined"
      sx={CHIP_SX}
    />
  )
}

/**
 * An item name: the Loot drill-down on CLICK.
 *
 * `onOpen` is optional and the cursor follows it exactly — a hand only ever appears where a click
 * actually goes somewhere (the complaint behind e8d0fd0's cursor fix). Without it the name is
 * plain text and keeps the default cursor, which is what a name in a non-routed context should be.
 *
 * The name ELLIPSIZES, so it carries a native `title` — the full name with no DOM node and no hit
 * area, which is the one thing the removed card did that nothing else on the row does.
 */
export function DonorName({
  name,
  bold,
  onOpen
}: {
  name: string
  bold?: boolean
  onOpen?: (name: string) => void
}): JSX.Element {
  const linked = onOpen !== undefined
  return (
    <Box
      component="span"
      data-testid="planner-donor-name"
      title={name}
      onClick={linked ? () => onOpen(name) : undefined}
      sx={{
        color: EQ_ITEM_COLORS.name,
        fontWeight: bold === true ? 600 : 400,
        textDecoration: 'underline dotted',
        textUnderlineOffset: 2,
        cursor: linked ? 'pointer' : 'default',
        ...(linked ? { '&:hover': { textDecoration: 'underline' } } : {}),
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }}
    >
      {name}
    </Box>
  )
}
