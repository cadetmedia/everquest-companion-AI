// spells/SpellbookView.tsx — THE CORPUS, BROWSABLE (docs/plans/spell-upgrades-and-loadout.md §4.1).
//
// The owner's ask, verbatim (2026-09-10): *"allow spells to be looked at, because right now spells
// and exaltations don't really tell me WHAT it does, it just says the name of the spell which isn't
// helpful on how much stats or what it does."*
//
// ── WHAT THIS IS NOT ──────────────────────────────────────────────────────────────────────────
//
// It is not the Leveling tab's best-spells readout and it deliberately does not rank. That surface
// answers "of everything I own, what should I be casting", over your loadout's slice, on damage and
// healing. This one is the CORPUS: every spell any class gains, filterable, with what it grants and
// what a mote tier buys beside each row. `shared/spellbook.ts`'s header sets the two side by side.
//
// ── NOTHING HERE FILTERS OR SORTS (ruling 4) ──────────────────────────────────────────────────
//
// `spellbookRows` does all of it, in `src/shared`, and this file maps its answer to rows. That is
// not a formality: the sort's null rule (an absent figure trails in BOTH directions) and the
// empty-filter reading (an untouched picker filters nothing) are decisions with tests on them, and
// a component that re-derived either would be a second opinion nobody could see.
//
// ============================================================================
// IT IS THE GEAR TAB'S TABLE NOW, AND THAT IS ONE FIX FOR TWO COMPLAINTS
// ============================================================================
// The owner, 2026-09-10: *"spellbook takes a long time to load for some reason why?"* and *"the
// tabs look like crap compared to the gear tab, why are you not reusing controls"*. One cause.
//
// THIS FILE USED TO CAP THE DRAW AT 200 ROWS AND HANG A MUI TOOLTIP ON NEARLY EVERY CELL - five on
// the payoff column alone, plus the name card and the grants line, which is about 1,400 poppers
// mounted synchronously before the first paint. `GearTable.tsx` has carried the rule against
// exactly that since JOS-143 (*"NO MUI TOOLTIP ANYWHERE... these are dense rows under a toolbar
// full of selects and a slider"*), and it draws 6,766 rows without a cap because it WINDOWS them.
//
// So this is the same shape now, for the same reasons and under the same contract:
//   * `useWindowedRows` over the whole result, so the DOM holds a screenful whatever the filter
//     matches - and the 200-row cap, with the footer that had to apologise for it, is gone.
//   * THE FIXED-HEIGHT CONTRACT (`GearTable.tsx`'s header states it in full): every row is exactly
//     `ROW_HEIGHT` with one clipped line per cell, or the spacer arithmetic desyncs as you scroll.
//     That is why the out-of-era CHIP became a coloured name with a `title` - a chip inside a dense
//     cell is what makes a row two lines tall.
//   * AND THE SAME TYPE SIZE. Every cell here wore `variant="caption"` (0.75rem) while the Gear
//     table puts its text straight in a `TableCell`, which is 0.875rem at `size="small"` - two
//     sizes for one kind of row, three tabs apart, which is what the owner saw when he said the
//     font "seems smaller on the spells pages" and kept saying it after the first fix.
//   * NATIVE `title` FOR EVERY EXPLANATION. The one exception is the spell NAME, which keeps the
//     app's spell card for the reason the gear tab kept its compare card (JOS-338): it is the whole
//     point of this surface, it is one popper rather than one per cell, and it opens on a 250ms
//     hover intent rather than on mount.

import { type JSX, memo, startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
  tableCellClasses
} from '@mui/material'
import { UPGRADE_CATEGORY_LABEL } from '@shared/spellUpgrade'
import {
  PAYOFF_MARKS,
  spellbookCorpus,
  spellbookRowsOf,
  type SpellbookQuery,
  type SpellbookRow,
  type SpellbookSort
} from '@shared/spellbook'
import { useLevelUnlocks } from '../leveling/useLevelUnlocks'
// THE GEAR TAB'S CLASS-FILTER STATE, under this tab's own key (owner, 2026-09-10). See
// `useFollowingClasses` for why the shape is shared with Gear and the storage deliberately is not;
// `SpellClassFilter` for why the Upgrades tab shares this key (owner, 2026-10-20).
import { useSpellClasses } from './SpellClassFilter'
import { SpellTooltip } from '../../lib/SpellCard'
import { useWindowedRows } from '../../lib/useWindowedRows'
import SpellbookToolbar from './SpellbookToolbar'
import SpellIcon from './SpellIcon'
import { SPELL_ROW_HEIGHT } from './SpellsTypography'
import {
  classesText,
  grantsText,
  headlineFigure,
  seconds,
  ticksText,
  whole,
  UNSTATED
} from './spellbookFormat'

/**
 * Dense row height (px) - the number the windowing hook is handed.
 *
 * IT LIVES WITH THE TYPE SCALE, not here: the area reads a size up (`SpellsTypography`) and a row
 * whose height did not follow would wrap, which desyncs the scroll offset of every row below it.
 * The two numbers are one decision, so they sit in one file.
 */
const ROW_HEIGHT = SPELL_ROW_HEIGHT

/**
 * The fixed-height contract, as one style. See the header.
 *
 * THE FIGURE COLUMNS' DIGITS ARE STATED HERE TOO, once per row rather than as an `sx` on each of
 * the four cells (the lag sweep, 2026-10-11): every `sx` is a style the theme resolves on every
 * render of every row, and a screenful of them was most of what a keystroke paid.
 */
const FIXED_ROW = {
  height: ROW_HEIGHT,
  maxHeight: ROW_HEIGHT,
  '& td': {
    py: 0,
    maxHeight: ROW_HEIGHT,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  [`& .${tableCellClasses.alignRight}`]: { fontVariantNumeric: 'tabular-nums' }
} as const

/** The two faces of a payoff glyph (`PayoffCell`) - one object each, never a literal per glyph. */
const MARK_ON = { fontFamily: 'monospace', fontWeight: 700, color: 'primary.main' } as const
const MARK_OFF = { fontFamily: 'monospace', fontWeight: 400, color: 'text.disabled' } as const

/** The rows the first paint draws: none - see `settled` in the view. */
const NO_ROWS: SpellbookRow[] = []

/** How many columns a spacer has to span. */
const COLUMN_COUNT = 10

/** The spacer rows that reserve the full scroll height - see `useWindowedRows`. */
function PadRow({ height }: { height: number }): JSX.Element | null {
  if (height <= 0) return null
  return (
    <TableRow style={{ height }}>
      <TableCell colSpan={COLUMN_COUNT} sx={{ p: 0, border: 0 }} />
    </TableRow>
  )
}

/**
 * The payoff column: which of the five things a mote tier moves for this row.
 *
 * The owner's question 2 answered ACROSS A LIST rather than one spell at a time, which is the thing
 * a page cannot do for you. A lit glyph is a gain; an unlit one is a gain this spell does not get.
 * Both are drawn, because "M C" with nothing beside it reads as missing data, while a dim `N` beside
 * a bright `M` reads as the fact it is: upgrading this buys mana and not numbers.
 *
 * ONE `title` FOR THE WHOLE CELL rather than one per glyph. Five poppers a row was most of this
 * tab's first paint (see the header), and the legend a reader wants is all five lines anyway.
 */
function PayoffCell({ row }: { row: SpellbookRow }): JSX.Element {
  const legend = PAYOFF_MARKS.map(
    (m) => `${m.glyph}  ${row.payoff[m.key] === true ? m.title : `no change: ${m.title}`}`
  ).join('\n')
  return (
    <Stack
      direction="row"
      spacing={0.25}
      title={legend}
      data-testid="spellbook-payoff"
      data-spell={row.name}
    >
      {PAYOFF_MARKS.map((m) => {
        const on = row.payoff[m.key] === true
        return (
          <Typography
            key={m.glyph}
            variant="body2"
            component="span"
            data-testid="spellbook-payoff-mark"
            data-mark={m.key}
            data-on={on ? 'yes' : 'no'}
            sx={on ? MARK_ON : MARK_OFF}
          >
            {m.glyph}
          </Typography>
        )
      })}
    </Stack>
  )
}

/**
 * One spell. The name keeps the app's spell card; everything else explains itself with `title`.
 *
 * `memo` on the row object (the lag sweep, 2026-10-11): the rows come from a corpus the view keeps
 * across keystrokes (`spellbookCorpus`), so a spell still on screen after one is the same object
 * and its row is not drawn again - only the rows the keystroke scrolled into view are.
 */
const SpellRow = memo(function SpellRow({ row }: { row: SpellbookRow }): JSX.Element {
  const figure = headlineFigure(row)
  const era = row.outOfEra === true
  return (
    <TableRow
      hover
      sx={FIXED_ROW}
      data-testid="spellbook-row"
      data-spell={row.name}
      data-tier={row.tier}
    >
      <TableCell>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <SpellIcon iconId={row.iconId} />
          <SpellTooltip name={row.name} placement="right">
            <Typography
              variant="body1"
              noWrap
              sx={{ fontWeight: 600 }}
              color={era ? 'warning.main' : undefined}
              title={era ? 'the wiki places this spell out of era' : undefined}
              data-testid={era ? 'spellbook-out-of-era' : undefined}
            >
              {row.name}
            </Typography>
          </SpellTooltip>
        </Stack>
      </TableCell>
      <TableCell>
        {/* THE CELL SHOWS THE CLASSES YOU PICKED, the hover shows every class that gains it. */}
        <Typography
          variant="body2"
          color="text.secondary"
          noWrap
          title={classesText(row.at, row.at.length)}
        >
          {classesText(row.shownAt)}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2" color="text.secondary" noWrap data-testid="spellbook-category">
          {UPGRADE_CATEGORY_LABEL[row.category]}
        </Typography>
      </TableCell>
      {/* THE LINE IS THE GAME'S OWN STACKING GROUP (Malkil, 2026-09-10: *"Maybe if it showed the
          spell line it would make sense. Possibly have a way to show what spells it replaces as
          well."*). The `title` is the second half of his ask, and it is also what makes the
          newest-rank chip stop looking arbitrary: the row that survived says what it superseded. */}
      <TableCell data-testid="spellbook-line">
        <Typography
          variant="body2"
          color="text.secondary"
          noWrap
          title={
            row.replaces === undefined
              ? row.line
              : `${row.line ?? 'no line'}
replaces ${row.replaces.join(', ')}`
          }
        >
          {row.line ?? UNSTATED}
        </Typography>
      </TableCell>
      {/* THE COLUMN THE OWNER ASKED FOR: what it actually does, in the row itself. */}
      <TableCell data-testid="spellbook-grants">
        <Typography variant="body2" noWrap title={row.grants.map((g) => g.line).join('\n')}>
          {grantsText(row.grants)}
        </Typography>
      </TableCell>
      <TableCell align="right">
        <Typography variant="body2" data-testid="spellbook-figure" data-kind={figure.label}>
          {figure.value}
        </Typography>
      </TableCell>
      <TableCell align="right">
        <Typography variant="body2" data-testid="spellbook-mana">
          {whole(row.mana)}
        </Typography>
      </TableCell>
      <TableCell align="right">
        <Typography variant="body2">{seconds(row.castSeconds)}</Typography>
      </TableCell>
      {/* DURATION AT THE TIER - one of the few columns the slider genuinely moves on a buff. */}
      <TableCell align="right">
        <Typography variant="body2" data-testid="spellbook-duration">
          {ticksText(row.durationTicks)}
        </Typography>
      </TableCell>
      <TableCell>
        <PayoffCell row={row} />
      </TableCell>
    </TableRow>
  )
})

/**
 * A COLUMN YOU CAN SORT BY, which is the Gear tab's idiom brought over (Malkil, 2026-09-10:
 * *"clicking on a column to sort like you can in the Gear tab would be nice"*).
 *
 * `spellbookRows` has taken a `sort` and a `desc` since it was written; nothing ever set them. The
 * five sortable columns are the ones holding a single comparable value - Kind, Line, Grants and
 * Upgrade are sets and lists, and an order over those would be an invention rather than a sort.
 *
 * FIRST CLICK ON A NEW COLUMN PICKS THE USEFUL DIRECTION rather than always ascending: a name reads
 * A to Z, and every figure reads biggest first, because "which is the best" is the question a
 * reader clicks a damage column to ask. Clicking the column you are already on flips it.
 */
function SortCell({
  id,
  label,
  query,
  onQuery,
  align
}: {
  id: SpellbookSort
  label: string
  query: SpellbookQuery
  onQuery: (next: SpellbookQuery) => void
  align?: 'right'
}): JSX.Element {
  const active = (query.sort ?? 'level') === id
  const desc = query.desc === true
  return (
    <TableCell
      align={align}
      sortDirection={active ? (desc ? 'desc' : 'asc') : false}
      data-testid={`spellbook-sort-${id}`}
    >
      <TableSortLabel
        active={active}
        direction={active && desc ? 'desc' : 'asc'}
        onClick={() =>
          onQuery({ ...query, sort: id, desc: active ? !desc : id !== 'name' && id !== 'level' })
        }
      >
        {label}
      </TableSortLabel>
    </TableCell>
  )
}

const PAYOFF_HEADER_TITLE =
  'What a mote tier buys: N numbers, T duration, M mana, C cast time, R resist. A dim letter is a gain this spell does not get.'

export default function SpellbookView(): JSX.Element {
  const data = useLevelUnlocks()
  // Mounted HERE and passed down, never inside the toolbar: two mounts of one storage key would
  // each hold their own copy and only one would re-read after the other wrote.
  const classes = useSpellClasses()
  const [query, setQuery] = useState<SpellbookQuery>({ sort: 'level' })
  const [tier, setTier] = useState(0)
  // THE STANDING SEARCH LAW: the controls echo instantly and the LIST follows. The gear tab's own
  // slider header states the same rule - the thumb is never waiting on a re-sort of a corpus.
  // THE CLASS FILTER IS PART OF THE QUERY, and it lives outside `query` because it is remembered
  // across restarts while the rest of the form is not. Joined here, once, so `spellbookRows` still
  // receives one whole question - the renderer composes the query, it never filters the corpus.
  const asked = useMemo<SpellbookQuery>(
    () => ({ ...query, classes: classes.classes }),
    [query, classes.classes]
  )
  const deferredQuery = useDeferredValue(asked)
  const deferredTier = useDeferredValue(tier)
  // THE CORPUS IS READ ONCE per (catalogue, tier, class picks) and a keystroke only filters and
  // orders it - `spellbookCorpus` states the split, and why the rows it hands out are shared.
  const corpus = useMemo(
    () => spellbookCorpus(data.spells, deferredTier, deferredQuery.classes),
    [data.spells, deferredTier, deferredQuery.classes]
  )
  const rows = useMemo(() => spellbookRowsOf(corpus, deferredQuery), [corpus, deferredQuery])
  // THE SCREENFUL MOUNTS AFTER THE SHELL HAS PAINTED (the lag sweep, 2026-10-11). The open was one
  // 62-93 ms task, nearly all of it the first screenful's styling; in a transition React slices the
  // row render between tasks and the commit is the rows alone. Mount-only - afterwards a
  // keystroke's rows pass straight through, deferred once already by the query. The no-hits line
  // waits for the settled frame so the first paint cannot flash it.
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    startTransition(() => setSettled(true))
  }, [])
  const shown = settled ? rows : NO_ROWS
  const scrollRef = useRef<HTMLDivElement>(null)
  const win = useWindowedRows({ count: shown.length, rowHeight: ROW_HEIGHT, scrollRef })
  return (
    <Stack sx={{ height: '100%', minHeight: 0 }} data-testid="spellbook-view">
      <SpellbookToolbar
        query={query}
        onQuery={setQuery}
        tier={tier}
        onTier={setTier}
        classes={classes}
        shown={rows.length}
        total={data.spells.length}
      />
      {data.spells.length === 0 ? (
        <Typography variant="body2" color="text.secondary" data-testid="spellbook-empty">
          the spell catalogue has not loaded yet
        </Typography>
      ) : (
        <TableContainer ref={scrollRef} sx={{ flexGrow: 1, minHeight: 0 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <SortCell id="name" label="Spell" query={query} onQuery={setQuery} />
                <SortCell id="level" label="Classes" query={query} onQuery={setQuery} />
                <TableCell>Kind</TableCell>
                <TableCell title="The spell line, which is the game's own stacking group: two spells on one line never both stand. Hover a row to see what it replaces.">
                  Line
                </TableCell>
                <TableCell>Grants</TableCell>
                <SortCell id="figure" label="Dmg / heal" query={query} onQuery={setQuery} align="right" />
                <SortCell id="mana" label="Mana" query={query} onQuery={setQuery} align="right" />
                <SortCell id="cast" label="Cast" query={query} onQuery={setQuery} align="right" />
                <SortCell
                  id="duration"
                  label="Lasts"
                  query={query}
                  onQuery={setQuery}
                  align="right"
                />
                <TableCell title={PAYOFF_HEADER_TITLE}>Upgrade</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <PadRow height={win.topPad} />
              {shown.slice(win.start, win.end).map((r) => (
                <SpellRow key={r.key} row={r} />
              ))}
              <PadRow height={win.bottomPad} />
            </TableBody>
          </Table>
          {settled && rows.length === 0 && (
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary" data-testid="spellbook-no-hits">
                no spell matches those filters
              </Typography>
            </Box>
          )}
        </TableContainer>
      )}
    </Stack>
  )
}

export { UNSTATED }
