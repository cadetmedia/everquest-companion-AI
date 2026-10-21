// spellUpgradePlan.ts — WHERE SHOULD MY NEXT MOTES GO
// (docs/plans/spell-upgrades-and-loadout.md §4.2).
//
// ============================================================================
// THE QUESTION THIS ANSWERS, AND WHY IT IS A REAL ONE
// ============================================================================
// Motes DOUBLE per tier: `2^(t-1)` to reach tier t, `2^t - 1` spent to stand there. Tier 10 alone
// costs 512 of a line's 1,023 total. So "which spell" is not a matter of taste - the last rung of
// one ladder costs more than the first nine of another, and a player who spreads them evenly ends
// up with ten tier-3 spells instead of three tier-6 ones.
//
// This file ranks the answer, and it ranks it ON YOUR OWN LADDER: `observedSpellRanks` is what the
// log has watched this character hold, so a row saying "you are at IV, the next tier costs 16" is a
// statement about him rather than about a hypothetical.
//
// ============================================================================
// THREE PANELS, ONE FOLD
// ============================================================================
//   `next`      - every line you hold, ranked by VALUE PER MOTE for its next tier.
//   `deadEnds`  - the lines whose numbers never move at any tier. The fork user's own report:
//                 *"some spells upgraded don't give a benefit beyond reduced mana cost and cast
//                 time like Bear Form"*. Not hidden behind a filter - it is the answer to a question
//                 he asked out loud, so it is a panel.
//   `unranked`  - lines you hold that could not be valued at all, counted rather than dropped.
//
// ============================================================================
// YOUR CLASSES, NOT EVERY CLASS THE LOG HAS WATCHED YOU CAST AS
// ============================================================================
// Owner, 2026-10-20: *"i don't think that the upgrades tab is respecting the classes i am using or
// selecting?"* - and it was not, because nothing here took a class at all. EQ Legends lets a
// character swap classes, and the observed-rank map is every rank the log has watched THIS
// CHARACTER cast, whatever it was running at the time. The owner's /who rows read WAR/MNK/SHM most
// days and WAR/PAL/MNK, WAR/RNG/MNK, WAR/SHD/SHM, WAR/DRU/MNK and others on other days, and every
// one of those stints left its casts behind: `You begin casting Wrath VI.` (Paladin), `Searing Arrow IV`
// and `Ignite IV` (Ranger), `Drain Spirit IV` (Shadow Knight), `Force Snap III` and `Garrison's
// Mighty Mana Shock III` (from the archived log). None were somebody else's lines - the fold
// reads only your own cast-begins (`X begins casting` is a different event), your own resists and
// your own merges.
//
// So `classes` filters the held lines to the ones a picked class casts, through the spell's own
// (class, level) pairs, the same `at` the Loadout's buff pool reads. The caller hands in the
// Spellbook tab's class filter (`SpellClassFilter.useSpellClasses`, one stored selection for both
// tabs; owner, 2026-10-20: *"spellbooks, we should just add the same existing control from the
// other spellbook tabs on this tab"*). An EMPTY list - every class, on the Spellbook - filters
// nothing, which is the readout this tab gave before; the lines a pick sets aside are counted in
// `otherClassCount`, never dropped without a word.
//
// ============================================================================
// WHAT "VALUE" MEANS HERE, AND WHY IT IS NOT roleWeights
// ============================================================================
// The Loadout tab scores a BUFF through `planner/roleWeights.ts`, because what a stat is worth
// depends on how you play. This tab is about the spells you CAST, and their value is the figure
// they already state: a nuke's damage, a heal's healing. So `valueOf` below is deliberately narrow
// and deliberately explicit - a percentage OF THE SPELL'S OWN BASE, not a cross-spell comparison.
//
// THAT MATTERS, AND IT IS THE ONE SUBTLETY IN THE FILE. Ranking on raw gained damage would put
// every high-level nuke above every low-level one for the trivial reason that it hits harder, and
// tell a level-50 wizard to pour motes into the biggest spell he owns regardless of how little a
// tier adds. Ranking on the FRACTION gained per mote answers the question actually being asked:
// where does the next mote buy the most improvement.
//
// Pure: no React, no Electron, no clock. Relative value imports, the shared/ house rule.

import type { ClassAbbr } from './classCombo'
import type { UnlockSpell } from './levelUnlocks'
import { spellLineKey } from './spellLines'
import type { ObservedSpellRanksSnap } from './spellRanks'
import { SPELL_MAX_RANK, normalizeSpellRank } from './spellScale'
import { spellbookLadder, spellbookRow, type SpellbookRow } from './spellbook'
import { foldSpellsByName } from './spellFold'
import { motesToReach, type SpellTierReading, type UpgradeCategory } from './spellUpgrade'

/** One line you hold, and what its next tier is worth. */
export interface UpgradeCandidate {
  name: string
  category: UpgradeCategory
  /** The rank the log has watched you hold. 0 when it has only ever seen the base. */
  rank: number
  /** The tier this row is about buying - always `rank + 1`. */
  nextTier: number
  /** Motes for that one rung: `2^(nextTier - 1)`. */
  motes: number
  /** The figure at your current rank, and at the next one. */
  from: number
  to: number
  /** `(to - from) / from` - the FRACTION of its own base the next tier adds. See the header. */
  gainFraction: number
  /** `gainFraction / motes` - the ranking column. */
  perMote: number
  /** Which quantity `from`/`to` are: what the row's own figure is. */
  measure: 'damage' | 'heal'
  /** The row at the CURRENT rank, for a surface that wants to draw the whole thing. */
  row: SpellbookRow
}

/** One line whose numbers never move, whatever you spend. */
export interface DeadEnd {
  name: string
  category: UpgradeCategory
  rank: number
  /** What upgrading DOES buy, in the model's own words. */
  sentence: string
}

/** The whole readout. */
export interface UpgradePlan {
  /** Ranked by `perMote`, best first. */
  next: UpgradeCandidate[]
  deadEnds: DeadEnd[]
  /**
   * How many lines you hold that could be valued NEITHER way - no damage, no healing, and a
   * category whose magnitudes do scale. Counted rather than dropped, because a reader who owns 40
   * lines and sees 12 rows needs to know where the other 28 went.
   */
  unrankedCount: number
  /** Lines the log has watched you hold, in your classes. The denominator for everything above. */
  heldCount: number
  /**
   * Lines the log has watched you hold that none of `classes` casts - casts from a stint as another
   * class (see the header). Counted so the reader knows they were set aside rather than lost.
   */
  otherClassCount: number
}

/**
 * The figure a row is ranked on, and which quantity it is.
 *
 * Damage first: a spell is essentially never both, and where a hybrid states both the damage is the
 * one a player is spending motes for. Null where neither is stated, which sends the row to
 * `unrankedCount` rather than to a made-up zero.
 */
function valueOf(reading: SpellTierReading): { value: number; measure: 'damage' | 'heal' } | null {
  if (reading.damage !== undefined && reading.damage > 0) {
    return { value: reading.damage, measure: 'damage' }
  }
  if (reading.heal !== undefined && reading.heal > 0) return { value: reading.heal, measure: 'heal' }
  return null
}

/** The rank the log has watched this character hold for a spell's LINE, or 0. */
export function heldRank(observed: ObservedSpellRanksSnap | null, name: string): number {
  if (observed === null) return 0
  return normalizeSpellRank(observed[spellLineKey(name)]?.rank)
}

/**
 * BUILD THE READOUT.
 *
 * `spells` is the whole unlock corpus; `observed` is what the log has watched. A line the log has
 * never seen is NOT in this readout at all, and that is deliberate: this tab answers "where do MY
 * next motes go", and a spell the character has never cast is not a spell he is deciding about. The
 * Spellbook tab is where the whole catalog lives.
 *
 * `classes` is the loadout the readout is for; empty filters nothing (see the header).
 */
export function buildUpgradePlan(
  spells: readonly UnlockSpell[],
  observed: ObservedSpellRanksSnap | null,
  classes: readonly ClassAbbr[] = []
): UpgradePlan {
  const next: UpgradeCandidate[] = []
  const deadEnds: DeadEnd[] = []
  let unrankedCount = 0
  let heldCount = 0
  let otherClassCount = 0
  // One line, one row: the catalog lists a few spells twice, and each copy counted as held.
  for (const spell of foldSpellsByName(spells)) {
    const rank = heldRank(observed, spell.name)
    // Presence in the observed map is what makes a line "held" - not a positive rank, since the log
    // watching you cast the base of a line is still evidence you own it.
    if (observed?.[spellLineKey(spell.name)] === undefined) continue
    if (!castByAny(spell, classes)) {
      otherClassCount++
      continue
    }
    heldCount++
    const row = spellbookRow(spell, rank)
    if (!row.payoff.magnitude) {
      deadEnds.push({
        name: spell.name,
        category: row.category,
        rank,
        sentence: deadEndSentence(row)
      })
      continue
    }
    const candidate = candidateFor(spell, row, rank)
    if (candidate === null) unrankedCount++
    else next.push(candidate)
  }
  next.sort((a, b) => b.perMote - a.perMote || a.name.localeCompare(b.name))
  deadEnds.sort((a, b) => a.name.localeCompare(b.name))
  return { next, deadEnds, unrankedCount, heldCount, otherClassCount }
}

/**
 * Does one of these classes cast this spell? Any level: the log has already watched you hold it, so
 * the level it unlocks at says nothing more. An empty class list is "every class" and admits all.
 */
function castByAny(spell: UnlockSpell, classes: readonly ClassAbbr[]): boolean {
  return classes.length === 0 || spell.at.some((p) => classes.includes(p.cls))
}

/**
 * One candidate, or null where the next tier cannot be valued.
 *
 * Null at the CAP as well as for an unvaluable row: a line already at X has no next rung to buy, and
 * a row offering one would be a control that does nothing.
 */
function candidateFor(
  spell: UnlockSpell,
  row: SpellbookRow,
  rank: number
): UpgradeCandidate | null {
  const nextTier = rank + 1
  if (nextTier > SPELL_MAX_RANK) return null
  const ladder = spellbookLadder(spell)
  const here = valueOf(ladder[rank])
  const there = valueOf(ladder[nextTier])
  if (here === null || there === null || here.value <= 0) return null
  const gainFraction = (there.value - here.value) / here.value
  if (!(gainFraction > 0)) return null
  const motes = motesToReach(nextTier)
  if (motes <= 0) return null
  return {
    name: spell.name,
    category: row.category,
    rank,
    nextTier,
    motes,
    from: here.value,
    to: there.value,
    gainFraction,
    perMote: gainFraction / motes,
    measure: here.measure,
    row
  }
}

/**
 * What a dead end DOES buy, said plainly.
 *
 * It reads off `upgradePayoff`'s own flags rather than re-deciding anything, so the sentence here
 * and the sentence on the spell page cannot differ for one spell. NO EM DASHES - user-facing copy.
 */
function deadEndSentence(row: SpellbookRow): string {
  const p = row.payoff
  const gains: string[] = []
  if (p.duration) gains.push('lasts longer')
  if (p.mana) gains.push('costs less mana')
  if (p.cast) gains.push('casts faster')
  if (p.resist) gains.push('is harder to resist')
  if (gains.length === 0) return 'a tier changes nothing this app can measure'
  const list =
    gains.length === 1 ? gains[0] : `${gains.slice(0, -1).join(', ')} and ${gains[gains.length - 1]}`
  return `it ${list} - the numbers it grants never change`
}

/**
 * A tier as ARITHMETIC: an integer 0..10, clamped.
 *
 * DELIBERATELY NOT `normalizeSpellRank`, and the distinction is the one thing in this file that is
 * easy to get wrong. That function folds rank 1 to 0, for a good reason that belongs entirely to
 * EVIDENCE: the observed-rank fold cannot tell a log line spelling `Clarity I` from one spelling
 * `Clarity`, so reading 1 as "no upgrade" errs downward on a claim about what you own.
 *
 * A COST CURVE HAS NO SUCH DOUBT. Tier 1 costs one mote whatever the log could or could not see, and
 * routing this arithmetic through the evidence rule made `motesBetween(0, 1)` answer 0 - the app
 * quoting a free upgrade. Caught by `tests/spellUpgradePlan.test.mts`.
 */
function tierNumber(t: number): number {
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.min(SPELL_MAX_RANK, Math.trunc(t)))
}

/**
 * The motes to take one line from where it is to a target tier - the "what would it cost" answer.
 *
 * The sum of the rungs between, which is exact because the curve is cumulative. Zero when the target
 * is at or below where you already are: you cannot un-spend motes, and a negative cost would read as
 * a refund.
 */
export function motesBetween(from: number, target: number): number {
  const a = tierNumber(from)
  const b = tierNumber(target)
  if (b <= a) return 0
  let total = 0
  for (let t = a + 1; t <= b; t++) total += motesToReach(t)
  return total
}
