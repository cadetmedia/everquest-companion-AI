// spells/SpellUpgradesView.tsx — WHERE SHOULD MY NEXT MOTES GO
// (docs/plans/spell-upgrades-and-loadout.md §4.2).
//
// ── WHY THIS TAB EXISTS WHEN THE SPELLBOOK ALREADY SHOWS A PAYOFF ─────────────────────────────
//
// The Spellbook says, of any spell, what a tier would buy. This says which spell to buy it FOR, and
// the difference is your own ladder: `observedSpellRanks` is what the log has watched this character
// hold, so a row here reads "you are at IV, the next tier costs 16 motes" rather than describing a
// hypothetical.
//
// ── THE MOTE CURVE IS THE WHOLE REASON THE QUESTION IS HARD ───────────────────────────────────
//
// `2^(t-1)` motes to reach tier t. The tenth rung alone costs 512 of a line's 1,023, so a player who
// spreads them evenly ends up with ten tier-3 spells instead of three tier-6 ones. The ranking
// column is therefore VALUE PER MOTE, and the value is a FRACTION of the spell's own base rather
// than raw damage - `shared/spellUpgradePlan.ts`'s header carries the argument, and it matters:
// ranking on raw would tell a level-50 wizard to pour everything into whichever spell hits hardest,
// for the trivial reason that a percentage of a bigger number is bigger.
//
// ── AND THE DEAD ENDS ARE A PANEL, NOT A FILTER ───────────────────────────────────────────────
//
// The fork user reported them by name - *"some spells upgraded don't give a benefit beyond reduced
// mana cost and cast time like Bear Form"* - so the list of lines whose numbers never move is an
// answer he asked for out loud, and it is drawn rather than hidden behind a toggle.
//
// ── YOUR CLASSES, THE LOADOUT TAB'S PICK ──────────────────────────────────────────────────────
//
// Owner, 2026-10-20: *"i don't think that the upgrades tab is respecting the classes i am using or
// selecting?"* It had no classes at all, so a character that swaps classes saw every line it had
// ever cast as any of them (Wrath from a Paladin stint, Searing Arrow from a Ranger one). The tab
// now draws the Loadout tab's "Your classes" picker and reads the plan for it: the same stored key,
// so a pick on either tab is the pick on both, following the log's detected trio until touched.
// Not the Spellbook's filter, which is a browsing control that may hold five classes or none; this
// tab and the Loadout both answer "what do I, running these three, do next".
//
// NOTHING HERE FILTERS OR SORTS (ruling 4): `buildUpgradePlan` does all of it in src/shared.

import { type JSX, useMemo } from 'react'
import {
  Alert,
  Box,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material'
import { UPGRADE_CATEGORY_LABEL } from '@shared/spellUpgrade'
import { buildUpgradePlan, type DeadEnd, type UpgradeCandidate } from '@shared/spellUpgradePlan'
import { useLevelUnlocks } from '../leveling/useLevelUnlocks'
import { useObservedSpellRanks } from '../../lib/useObservedSpellRanks'
import { SpellTooltip } from '../../lib/SpellCard'
import LoadoutClasses, { useLoadoutClasses } from './LoadoutClasses'
import { Tooltip } from '../../lib/Tooltip'
import { romanRank, whole } from './spellbookFormat'

/** How many candidates are DRAWN. The whole list is folded; a decision needs a shortlist. */
const SHOWN = 25

/** A percentage, at the precision a gain of a few percent needs to be readable. */
function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`
}

/** One line you could spend on. */
function CandidateRow({ c }: { c: UpgradeCandidate }): JSX.Element {
  return (
    <TableRow hover data-testid="upgrade-candidate" data-spell={c.name}>
      <TableCell>
        <SpellTooltip name={c.name} placement="right">
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {c.name}
          </Typography>
        </SpellTooltip>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
          {UPGRADE_CATEGORY_LABEL[c.category]}
        </Typography>
      </TableCell>
      <TableCell data-testid="upgrade-from-to">
        <Typography variant="caption" color="text.secondary">
          {c.rank === 0 ? 'base' : romanRank(c.rank)} to {romanRank(c.nextTier)}
        </Typography>
      </TableCell>
      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        <Typography variant="caption">
          {whole(c.from)} to {whole(c.to)}
        </Typography>
      </TableCell>
      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        <Typography variant="caption" data-testid="upgrade-gain">
          +{pct(c.gainFraction)}
        </Typography>
      </TableCell>
      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
        <Typography variant="caption" data-testid="upgrade-motes">
          {whole(c.motes)}
        </Typography>
      </TableCell>
    </TableRow>
  )
}

/** One line whose numbers a tier will never move. */
function DeadEndRow({ d }: { d: DeadEnd }): JSX.Element {
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="baseline"
      data-testid="upgrade-dead-end"
      data-spell={d.name}
      sx={{ py: 0.25 }}
    >
      <SpellTooltip name={d.name} placement="right">
        <Typography variant="body2">{d.name}</Typography>
      </SpellTooltip>
      <Chip
        size="small"
        variant="outlined"
        label={UPGRADE_CATEGORY_LABEL[d.category]}
        sx={{ height: 16, fontSize: 10, '& .MuiChip-label': { px: 0.5 } }}
      />
      <Typography variant="caption" color="text.secondary">
        {d.sentence}
      </Typography>
    </Stack>
  )
}

/**
 * NO LOG, NO LADDER, AND THE PANEL SAYS SO.
 *
 * This tab is entirely about what the log has watched this character hold, so an empty observed map
 * is not an empty answer - it is no question yet, and it fills in by playing. Saying that is the
 * difference between a tab that looks broken and one that looks like it is waiting.
 */
function NothingHeld(): JSX.Element {
  return (
    <Alert severity="info" data-testid="spell-upgrades-empty">
      Nothing to rank yet. This tab reads the spell ranks your log has actually watched you cast or
      merge, so it fills in as you play. The Spellbook tab answers the same question for any spell in
      the game.
    </Alert>
  )
}

/**
 * WHAT THE CLASS PICK SET ASIDE, said rather than hidden - the lines your log has watched you cast
 * as a class you are not running now. Nothing when the pick set nothing aside.
 */
function OtherClasses({ count }: { count: number }): JSX.Element | null {
  if (count === 0) return null
  return (
    <Typography variant="caption" color="text.secondary" data-testid="upgrade-other-classes">
      {String(count)} more {count === 1 ? 'line' : 'lines'} your log has seen you cast belong to
      classes you have not picked above
    </Typography>
  )
}

/** The ranked table, or the honest sentence for a character whose lines all read flat. */
function CandidateTable({ plan }: { plan: ReturnType<typeof buildUpgradePlan> }): JSX.Element {
  if (plan.next.length === 0) {
    return (
      <Alert severity="info" data-testid="upgrade-none-rankable">
        None of the {String(plan.heldCount)} lines your log has seen has numbers a tier would
        improve.
      </Alert>
    )
  }
  return (
    <Table size="small" data-testid="upgrade-table">
      <TableHead>
        <TableRow>
          <TableCell>Spell</TableCell>
          <TableCell>Tier</TableCell>
          <TableCell align="right">Figure</TableCell>
          <Tooltip title="How much of its own base the next tier adds. Comparable across spells, which raw damage is not.">
            <TableCell align="right">Gain</TableCell>
          </Tooltip>
          <Tooltip title="Motes for that one rung. Each tier costs double the last.">
            <TableCell align="right">Motes</TableCell>
          </Tooltip>
        </TableRow>
      </TableHead>
      <TableBody>
        {plan.next.slice(0, SHOWN).map((c) => (
          <CandidateRow key={c.name} c={c} />
        ))}
      </TableBody>
    </Table>
  )
}

export default function SpellUpgradesView(): JSX.Element {
  const data = useLevelUnlocks()
  const observed = useObservedSpellRanks()
  const picked = useLoadoutClasses()
  const classes = picked.combo.resolved
  const plan = useMemo(
    () => buildUpgradePlan(data.spells, observed, classes),
    [data.spells, observed, classes]
  )

  return (
    <Stack spacing={2} sx={{ maxWidth: 900 }} data-testid="spell-upgrades-view">
      <Box>
        <Typography variant="h6">Your next motes</Typography>
        <Typography variant="body2" color="text.secondary">
          Ranked by how much of its own base each spell gains per mote spent. Every tier costs double
          the last, so the cheap rungs on a low-ranked spell beat the expensive ones on a high one.
        </Typography>
      </Box>
      <LoadoutClasses state={picked} />

      {plan.heldCount === 0 ? (
        <>
          <NothingHeld />
          <OtherClasses count={plan.otherClassCount} />
        </>
      ) : (
        <>
          <CandidateTable plan={plan} />
          {/* STATED, NEVER SILENT - the law the Spellbook's own draw cap follows. */}
          {plan.next.length > SHOWN && (
            <Typography variant="caption" color="text.secondary" data-testid="upgrade-capped">
              showing the top {String(SHOWN)} of {String(plan.next.length)}
            </Typography>
          )}
          {plan.unrankedCount > 0 && (
            <Typography variant="caption" color="text.secondary" data-testid="upgrade-unranked">
              {String(plan.unrankedCount)} more of your lines are already at the cap or state no
              figure to rank
            </Typography>
          )}
          <OtherClasses count={plan.otherClassCount} />
          {plan.deadEnds.length > 0 && (
            <Box data-testid="upgrade-dead-ends">
              <Typography variant="overline" color="text.secondary">
                Not worth motes for the numbers
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                These still get cheaper and last longer, and that is often worth having. What they
                never get is bigger.
              </Typography>
              <Stack>
                {plan.deadEnds.map((d) => (
                  <DeadEndRow key={d.name} d={d} />
                ))}
              </Stack>
            </Box>
          )}
        </>
      )}
    </Stack>
  )
}
