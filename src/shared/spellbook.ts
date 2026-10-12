// spellbook.ts — THE CORPUS BROWSER'S ROWS (docs/plans/spell-upgrades-and-loadout.md §4.1).
//
// ============================================================================
// WHAT THIS ANSWERS THAT NOTHING ELSE DOES
// ============================================================================
// The owner's ask, verbatim (2026-09-10): *"allow spells to be looked at, because right now spells
// and exaltations don't really tell me WHAT it does, it just says the name of the spell which isn't
// helpful on how much stats or what it does."*
//
// Three surfaces already draw spells and none of them answers that:
//
//   THE BUFFS TAB draws what is on you right now, observed off the log. It knows a buff is up and
//   nothing whatever about what it grants.
//   THE LEVELING TAB'S BEST-SPELLS READOUT ranks what you OWN by efficiency at your level. It is
//   the right answer to "what should I cast" and it deliberately cannot browse: its corpus is your
//   loadout's slice, its figures are damage and healing, and its own header records that at the
//   app's 260px floor it has no room for a fifth column.
//   THE SPELL PAGE answers in full, for ONE spell you already knew to look up.
//
// This is the missing one: the whole catalog, filterable, with what a spell GRANTS and what a mote
// tier BUYS beside every row. It does not rank and it does not recommend - those are the Upgrades
// and Loadout tabs. It is a corpus, and its job is to make a spell findable and legible.
//
// ============================================================================
// WHY IT LIVES IN shared/ AND NOT IN THE VIEW
// ============================================================================
// Ruling 4 (eslint.domainMunging.mjs): the renderer never filters or sorts domain collections. The
// sanctioned shape is a PURE FOLD in `src/shared` that the view calls once - which is exactly what
// `bestSpellsSearch.ts` is and why this file is its neighbour rather than a hook. Nothing below
// touches React, and `tests/spellbook.test.mts` drives it over the committed corpus with no app.
//
// ============================================================================
// THE CORPUS IS THE UNLOCK FOLD'S, DELIBERATELY
// ============================================================================
// `LevelUnlockData.spells` is every spell the DB places for at least one class at a stated level -
// ~1,900 rows - already carrying the era verdict, the class levels, the metrics, and (since this
// ticket) the parsed grants and the upgrade category. Re-deriving any of that here would be a
// second opinion about a join main already made, and `bestSpells.ts` made the same choice for the
// same reason. The cost is stated rather than hidden: a spell NO class gains at a stated level is
// not in this corpus and cannot be browsed here. That is 430 rows of NPC-only and unlearnable
// spells (shared/spellLevels.ts measured them), and a browser for spells nobody can cast is not
// what was asked for.

import type { ClassAbbr } from './classCombo'
import type { UnlockSpell } from './levelUnlocks'
// The Leveling tab's own reader, so a magnitude at a tier here is the number that tab prints for
// the same spell at the same rank - see `tierMagnitudes`.
import { spellMetricsForLevel } from './bestSpells'
import { SPELL_MAX_RANK, clampSpellRank } from './spellScale'
import { compareStatKeys, type SpellStatGrant } from './spellStats'
import {
  UPGRADE_RATES,
  magnitudeRates,
  spellTierLadder,
  upgradePayoff,
  type SpellTierBase,
  type SpellTierReading,
  type UpgradeCategory,
  type UpgradePayoff
} from './spellUpgrade'

// =================================================================================================
// THE ROW
// =================================================================================================

/** One spell, as the Spellbook draws it. Every figure already read at the requested tier. */
export interface SpellbookRow {
  name: string
  /**
   * A STABLE, UNIQUE ROW KEY - the name, plus a discriminator where the catalog holds two spells
   * under one name.
   *
   * The name alone was the key and it was not unique: 14 names survive `dedupeByName` as two
   * genuinely different spells (Aria of Asceticism is a Bard 45 cure AND a Bard 39 proc buff), so a
   * React list keyed on the name had colliding siblings and reconciled the wrong row into the wrong
   * place. `spellbookRows` assigns it, because uniqueness is a property of the LIST rather than of
   * any row - one spell asked about on its own is always just its name.
   */
  key: string
  /** The client's gem icon, when this machine's install answered. See `UnlockSpell.iconId`. */
  iconId?: number
  /**
   * THE SPELL LINE - which is the game's own STACKING GROUP for this spell.
   *
   * `UnlockSpell.line` carries the whole argument. Drawn as a column because two readers asked for
   * it on the same day for two different reasons, and both are about making a claim legible rather
   * than adding one: what a spell collides with, and why the newest-rank chip hid its neighbour.
   */
  line?: string
  /** What this row supersedes, by name, deduped - the other half of that answer. */
  replaces?: string[]
  /** Every class that gains it, with the level, in the order main sorted them. */
  at: readonly { cls: ClassAbbr; level: number }[]
  /**
   * THE CLASSES THE READER ASKED ABOUT - `at` narrowed to the query's class filter.
   *
   * Malkil, 2026-09-10: *"Only listing current classes in the Class column could be good too to
   * help declutter things."* With a trio picked, a row reading `BST 4 / CLR 4 / DRU 4 +5` spends
   * its whole column on classes you are not playing and hides the one level you wanted.
   *
   * IT IS THE FOLD'S JOB, not the view's (ruling 4). Equal to `at` when no filter is set, so the
   * unfiltered corpus still reports every class that gains the spell - which is what makes the
   * Spellbook a corpus browser rather than a loadout.
   */
  shownAt: readonly { cls: ClassAbbr; level: number }[]
  /** The lowest level any class gains it at - what the row sorts and filters by. */
  level: number
  category: UpgradeCategory
  /** The wiki's own `spell_type`, verbatim, for the reader who wants the page's own word. */
  spellType?: string
  /** What it grants, at the level main read it - see `UnlockSpell.grants`. */
  grants: readonly SpellStatGrant[]
  /** The level those grants were read at, when there are any. */
  grantsLevel?: number
  /** What a tier buys for THIS spell - the Bear Form verdict, per row. */
  payoff: UpgradePayoff
  /** Mana and cast AT THE REQUESTED TIER. Absent where the page states none. */
  mana?: number
  castSeconds?: number
  /**
   * HOW LONG IT LASTS, in ticks, AT THE REQUESTED TIER.
   *
   * Malkil, 2026-09-10: *"it would be nice to see a Duration column as well for any spell that has
   * a duration other than Permanent or Instant"*. Absent is exactly those two cases - an instant
   * has no ticks to state and a permanent has no end - so the column draws the placeholder and
   * claims nothing, which is the same rule every other figure on this row follows (law 1).
   *
   * READ AT THE TIER, unlike almost everything else here: duration is one of the few things a mote
   * rank genuinely moves (`UPGRADE_RATES`), so this column is where the slider does visible work on
   * a buff. The stats beside it never budge, which the Loadout tab says out loud.
   */
  durationTicks?: number
  /**
   * Damage and healing at the requested tier, where main computed a base figure - read PER LINE
   * at the tier, by the Leveling tab's own reader (`tierMagnitudes`), never by scaling the total.
   */
  damage?: number
  heal?: number
  /** The wiki's era verdict, `true` or absent - never false (law 1, the sidecar's own rule). */
  outOfEra?: boolean
  /** The tier every figure above was read at, so a row can never be read at the wrong one. */
  tier: number
}

/** Which column the list is ordered by. */
export type SpellbookSort =
  | 'name'
  | 'level'
  | 'mana'
  | 'damage'
  | 'heal'
  | 'figure'
  | 'cast'
  | 'duration'

/** What the view asks for. Every field is AND-ed; an absent one filters nothing. */
export interface SpellbookQuery {
  /** Free text over the name. Folded and trimmed by the caller's own search vocabulary. */
  text?: string
  /** Only spells at least one of these classes gains. Empty means every class. */
  classes?: readonly ClassAbbr[]
  /** Only these categories. Empty means every category. */
  categories?: readonly UpgradeCategory[]
  /** Only spells gained at or below this level. */
  maxLevel?: number
  /** Drop the rows the era sidecar placed out of era. */
  inEraOnly?: boolean
  /**
   * ONLY SPELLS A TIER ACTUALLY IMPROVES THE NUMBERS OF.
   *
   * The owner's question 2, as a filter: hide everything whose magnitudes do not move, so what is
   * left is the list worth spending motes on. Its complement (`payoffMagnitudeOnly: false`) is the
   * Upgrades tab's "dead ends" panel, which is the same question asked the other way round.
   */
  payoffMagnitudeOnly?: boolean
  /**
   * ONLY THE NEWEST RUNG OF EACH SPELL LINE.
   *
   * The owner's ask, verbatim (2026-09-10): *"can we get a 'latest level' or 'highest version'
   * toggle chip on the spellbook tab also? I don't need to see 5 different versions of regeneration
   * or poison resist etc"*.
   *
   * IT READS THE SHIPPED SPELL LINES RATHER THAN GUESSING FROM NAMES. `UnlockSpell.replaces` is the
   * ladder JOS-391 joined main-side, per class - so "Chloroplast replaces Regeneration (SHM)" is a
   * fact the corpus states, not a prefix match on a word. A name-based rule would fold `Resist
   * Fire` into `Resist Cold` on the shared word and would miss every line whose rungs are named
   * differently (Regeneration -> Chloroplast -> Quiescence), which is most of them.
   *
   * IT IS SCOPED TO THE CLASSES ON SCREEN, which is the half that makes it honest. A spell is only
   * hidden when the newer rung belongs to a class the current filter is SHOWING: a Shaman's
   * Regeneration being superseded is no reason to hide it from a reader browsing Druid spells, and
   * hiding a rung whose replacement the reader cannot see would make the list lie about what exists.
   */
  newestOnly?: boolean
  sort?: SpellbookSort
  /** Descending, when the column reads better that way. Name always reads ascending. */
  desc?: boolean
}

// =================================================================================================
// THE FOLD
// =================================================================================================

/**
 * `{ key: value }` when the value is a stated positive, `{}` otherwise.
 *
 * ABSENT-MEANS-NOTHING, spelled once. Every field of a `SpellTierBase` obeys it - a zero mana and an
 * omitted mana are both "there is no mana row here" - and eight hand-written `!== undefined && > 0`
 * guards is eight chances to write one of them as `>=`. Spread rather than assigned so the base
 * stays one expression, which is what keeps this under the tree's complexity ceiling.
 */
function positive<K extends string>(key: K, value: number | undefined): Partial<Record<K, number>> {
  return value !== undefined && value > 0 ? ({ [key]: value } as Record<K, number>) : {}
}

/**
 * The tier base for one catalog row.
 *
 * `recoverySeconds` and `reuseSeconds` are DELIBERATELY ABSENT even though `UnlockSpell` carries a
 * `recastMs`: the Spellbook draws neither column, and a `SpellTierBase` that stated them would make
 * `upgradePayoff` report "harder to resist"-shaped gains this surface never shows. The spell PAGE
 * builds a fuller base for its own table (wave 3), which is the right place for the full ladder.
 */
function tierBase(s: UnlockSpell): SpellTierBase {
  return {
    // The name is carried for ONE reader: `MEASURED_STATIC_MAGNITUDE`, the list of spells measured
    // not to gain magnitude whatever their category's rate says. Nothing else here keys on it.
    name: s.name,
    category: s.upgradeCategory ?? 'other',
    ...positive('mana', s.mana),
    ...positive('castSeconds', s.castTimeMs === undefined ? undefined : s.castTimeMs / 1000),
    // The metrics snapshot is main's, taken at the row's own gain level. Reading it rather than
    // re-deriving keeps this surface agreeing with the Leveling tab about the same spell.
    ...positive('damage', s.metrics?.damage),
    ...positive('heal', s.metrics?.heal),
    // Ticks, not ms: `spellTierLadder` works in the unit the game keeps a duration in.
    ...positive('durationTicks', s.durationMs === undefined ? undefined : Math.round(s.durationMs / 6000))
  }
}

/** The lowest level any class gains this spell at - the row's own level. */
function gainLevel(s: UnlockSpell): number {
  return s.at.length === 0 ? 0 : Math.min(...s.at.map((p) => p.level))
}

/**
 * DAMAGE AND HEALING AT A TIER, READ PER LINE.
 *
 * The ladder scaled the row's TOTAL - `metrics.damage`, which for a DoT is the tick times the
 * ticks - and the game scales the TICK: Odium's tick reads 387 at base and 445 at V, and its
 * fourteen-tick total is fourteen times whichever of those the rank produced. Floor a tick and
 * multiply, or multiply and floor a total, and the two differ by up to the tick count: Asystole
 * read 555 here at V where the Leveling tab read 553, Affliction (6 a tick over 14) read 96
 * against 84, and 386 of the 1,170 (row, tier) pairs the corpus states disagreed with that tab
 * (measured 2026-09-25). A slider that prints one number on one tab and another on the next is
 * not a slider anyone can trust.
 *
 * So the figure is the Leveling tab's own: `spellMetricsForLevel` over the row's hitpoint lines at
 * the row's own gain level - the level `metrics` was read at - with the tier riding as a TIER
 * (`MetricsReading.tier`), clamped rather than folded, because a slider's rung I is one mote and
 * not an evidence problem. Every line scales by its own measured rate (six percent direct, three
 * a tick, three healing), which is the arithmetic that reproduced Odium exactly.
 *
 * THE CATEGORY STILL DECIDES WHETHER ANYTHING SCALES AT ALL. `magnitudeRates` is null for a
 * category whose magnitudes the model says do not move (a buff, a debuff) and for the measured
 * exceptions, and there the base figure stands at every tier: Arch Lich is a beneficial self-DoT
 * filed as a buff, and reading it per line at a tier would have it grow on a rate nobody stated.
 * The reader scales both sides by their own rules whatever the category, so each side is gated on
 * its own rate. A row the reader cannot re-read (no lines crossed the wire) keeps the ladder's
 * figure, which is what it printed before and is never the case in the committed corpus - all 392
 * rows with a figure reconstruct exactly at tier 0.
 */
function tierMagnitudes(
  s: UnlockSpell,
  base: SpellTierBase,
  reading: SpellTierReading
): Pick<SpellbookRow, 'damage' | 'heal'> {
  const rate = magnitudeRates(base)
  const scaled =
    reading.tier > 0 && (rate.damage !== null || rate.heal !== null)
      ? spellMetricsForLevel(s, gainLevel(s), { tier: reading.tier })
      : undefined
  const damage = rate.damage === null ? base.damage : (scaled?.damage ?? reading.damage)
  const heal = rate.heal === null ? base.heal : (scaled?.heal ?? reading.heal)
  return { ...positive('damage', damage), ...positive('heal', heal) }
}

/**
 * ONE ROW, at a tier.
 *
 * Exported because the spell page and the Upgrades tab both want a single row without running the
 * whole corpus through a query, and a second copy of this mapping is how two surfaces come to state
 * different mana for one spell.
 */
/**
 * The spell-line pair, as a spreadable fragment.
 *
 * Split out for `positive`'s reason: `spellbookRow` is at this tree's complexity ceiling and every
 * optional field written inline costs it a branch.
 */
function lineFields(s: UnlockSpell): Pick<SpellbookRow, 'iconId' | 'line' | 'replaces'> {
  // The catalog states one entry per CLASS, so a six-class line repeats its predecessor six times.
  const replaces = [...new Set((s.replaces ?? []).map((r) => r.name))]
  return {
    // THE ICON RIDES HERE because the block this replaced was writing it, and dropping it took the
    // gems off every row (reported within the hour, 2026-09-10). Three optional fields read off the
    // same source row is one fragment, not three - `positive`'s shape, and the reason that rule
    // exists: a hand-written `!== undefined` guard per field is a chance to lose one in a refactor.
    ...(s.iconId === undefined ? {} : { iconId: s.iconId }),
    ...(s.line === undefined ? {} : { line: s.line }),
    ...(replaces.length === 0 ? {} : { replaces })
  }
}

export function spellbookRow(s: UnlockSpell, tier: number): SpellbookRow {
  // THE TIER IS CLAMPED, NOT FOLDED. `normalizeSpellRank` reads an OBSERVED 1 as base, because the
  // log cannot tell `Clarity I` from `Clarity` - an evidence rule, and the right one for a rank the
  // log reported. The slider's rung I is not evidence of anything: it is one mote spent, and
  // folding it printed the base figures under a rung labelled I (dot 387 / mana 100 where the
  // ladder's own tier 1 reads 398 / 98) and sent the Upgrades tab a row that recommended buying
  // tier 1 again. Observed ranks still arrive here folded, by `spellUpgradePlan.ts heldRank`.
  const t = clampSpellRank(tier)
  const base = tierBase(s)
  const reading = spellTierLadder(base)[t]
  const row: SpellbookRow = {
    name: s.name,
    key: s.name,
    at: s.at,
    shownAt: s.at,
    level: gainLevel(s),
    category: base.category,
    // THE ONE ORDER (owner, 2026-09-10), so a row's chips and the Loadout panel's rows read down
    // the same way. Copied before sorting - `s.grants` belongs to the shared dataset.
    grants: [...(s.grants ?? [])].sort((a, b) => compareStatKeys(a.key, b.key)),
    payoff: upgradePayoff(base),
    tier: t
  }
  Object.assign(row, lineFields(s))
  if (s.spellType !== undefined) row.spellType = s.spellType
  if (s.grantsLevel !== undefined) row.grantsLevel = s.grantsLevel
  if (reading.mana !== undefined) row.mana = reading.mana
  if (reading.castSeconds !== undefined) row.castSeconds = reading.castSeconds
  if (reading.durationTicks !== undefined) row.durationTicks = reading.durationTicks
  Object.assign(row, tierMagnitudes(s, base, reading))
  // `true` or absent, never false - the era sidecar's own shape (law 1).
  if (s.outOfEra === true) row.outOfEra = true
  return row
}

/**
 * Give every row a key nothing else in this list holds.
 *
 * `dedupeByName` folds the same-named rows the client file can adjudicate and deliberately KEEPS
 * the ones it cannot - two different spells under one name is a real thing the catalog contains,
 * and deleting one would be worse than showing both. So the list can carry repeats, and the draw
 * needs to tell them apart: the second occurrence becomes `name#2`, the third `name#3`.
 *
 * After the filter rather than during it, because the discriminator has to count the rows that
 * SURVIVED - a key that depended on the whole corpus would change as you typed. THE FIRST
 * OCCURRENCE KEEPS ITS CORPUS OBJECT and only a repeat is copied under its own key: the rows come
 * from a corpus shared across keystrokes (`spellbookCorpus`), and the view's row memo keys on
 * their identity, so writing on one would be writing on every query's answer at once.
 */
function uniqueKeys(rows: readonly SpellbookRow[]): SpellbookRow[] {
  const seen = new Map<string, number>()
  return rows.map((row) => {
    const n = (seen.get(row.name) ?? 0) + 1
    seen.set(row.name, n)
    return n > 1 ? { ...row, key: `${row.name}#${String(n)}` } : row
  })
}

/**
 * Every spell a SURVIVING later rung of its own line replaces, for the classes on screen.
 *
 * THE REPLACEMENT HAS TO BE ON SCREEN TOO, and that is the whole subtlety. The first cut of this
 * hid anything the corpus said was superseded by anything, and it deleted whole lines: a MNK/SHM/WAR
 * reader lost Regeneration AND Chloroplast, because something replaces Chloroplast too - a rung his
 * trio cannot cast. 208 rows became 78 and the lines he asked to see the newest of vanished
 * entirely, which is the opposite of what the chip promises.
 *
 * So the set is built from the rows that already SURVIVED every other filter. A rung is hidden only
 * when the thing that supersedes it is right there in the same list, which makes "show me the
 * newest" true by construction: the highest VISIBLE rung of every line always stays.
 *
 * Built once per fold rather than asked per row - it is a property of the whole result, and a
 * per-row answer would be a scan inside a scan. See `SpellbookQuery.newestOnly` for why it reads
 * `replaces` rather than matching names.
 */
function supersededNames(
  survivors: readonly UnlockSpell[],
  classes: readonly ClassAbbr[] | undefined
): Set<string> {
  const shown = classes !== undefined && classes.length > 0 ? new Set(classes) : null
  const out = new Set<string>()
  for (const s of survivors) {
    // A SPELL THAT IS NOT IN THE GAME YET SUPERSEDES NOTHING (Malkil, 2026-09-10: *"The spells not
    // available yet is definitely messing with Newest Version, though."* He is right, and this is
    // the bug his two reports meet in: the fold hid a rung because a LATER rung existed, without
    // asking whether that later rung is obtainable. On a server that has not opened the era it
    // belongs to, it is not - so the reader lost the spell he can cast in favour of one that does
    // not exist, which is the worst possible answer for a chip whose whole promise is "show me the
    // one to use".
    //
    // It holds WHATEVER THE ERA TOGGLE SAYS, and that is deliberate: the toggle decides what is
    // DRAWN, and this decides what may HIDE something. A reader browsing the future still sees it;
    // it just no longer deletes his present. `outOfEra` is `true` or absent and never false, so
    // silence keeps a rung eligible - law 1, and the same reading `admits` takes.
    if (s.outOfEra === true) continue
    for (const r of s.replaces ?? []) {
      // An empty class filter shows every class, so every replacement counts.
      if (shown === null || shown.has(r.cls)) out.add(r.name)
    }
  }
  return out
}

/** Does this spell survive the query's filters? Split out to keep the fold under the ceiling. */
function admits(s: UnlockSpell, q: SpellbookQuery, text: string): boolean {
  // AN EMPTY LIST FILTERS NOTHING, which is the show-all state and not a filter that excludes
  // everything. Both pickers are multi-selects that start empty, so this reading is what makes an
  // untouched toolbar show the whole corpus.
  const anyOf = <T,>(picked: readonly T[] | undefined, has: (v: T) => boolean): boolean =>
    picked === undefined || picked.length === 0 || picked.some(has)
  // THE SEARCH READS THE SPELL'S OWN SENTENCES, NOT ONLY ITS NAME.
  //
  // `UnlockSpell.searchText` is the haystack `searchTextFor` already builds for every row - the
  // name, the ranks a source lists, and the three sentences the game prints when it lands, fades
  // and hits somebody else. This filter looked at the name alone and therefore could not find a
  // spell the SCRAPE has mis-titled, which is a real and reported shape (2026-09-10): a druid's
  // `Healing Water` is filed under the name `Greater Healing`, and the only place the words
  // "healing water" appear is in its own message. Searching them found nothing.
  //
  // Falls back to the name when a row carries no haystack, so nothing becomes unfindable.
  if (text.length > 0 && !(s.searchText ?? s.name.toLowerCase()).includes(text)) return false
  if (!anyOf(q.classes, (c) => s.at.some((p) => p.cls === c))) return false
  if (!anyOf(q.categories, (c) => (s.upgradeCategory ?? 'other') === c)) return false
  if (q.maxLevel !== undefined && gainLevel(s) > q.maxLevel) return false
  // `outOfEra` is `true` or absent. Silence is NOT a verdict (law 1): a spell the sidecar never
  // answered for is shown plainly, exactly as the unlock list does.
  return !(q.inEraOnly === true && s.outOfEra === true)
}

/** The value a sort reads, or null - and a null always sorts LAST, in both directions. */
/**
 * What each sortable column compares on. A TABLE rather than a chain, which is this tree's own
 * preference for a dispatch (eslint.config.mjs's words) and what keeps it under the ceiling now
 * that there are seven of them.
 *
 * `figure` is the headline column, which holds whichever of damage and healing a row states - so
 * its order has to read the same way `headlineFigure` draws it: one column, one number, one order.
 */
const SORT_VALUE: Readonly<Record<SpellbookSort, (row: SpellbookRow) => number | string | null>> = {
  name: (r) => r.name.toLowerCase(),
  level: (r) => r.level,
  mana: (r) => r.mana ?? null,
  cast: (r) => r.castSeconds ?? null,
  duration: (r) => r.durationTicks ?? null,
  damage: (r) => r.damage ?? null,
  heal: (r) => r.heal ?? null,
  figure: (r) => r.damage ?? r.heal ?? null
}

function sortValue(row: SpellbookRow, by: SpellbookSort): number | string | null {
  return SORT_VALUE[by](row)
}

/** `shownAt` = the classes the reader asked about. See `SpellbookRow.shownAt`. */
function narrowClasses(row: SpellbookRow, picked: ReadonlySet<ClassAbbr> | null): void {
  if (picked === null) return
  row.shownAt = row.at.filter((p) => picked.has(p.cls))
}

/** A spell beside its reading at one tier - the corpus `spellbookRowsOf` filters and orders. */
export interface SpellAtTier {
  spell: UnlockSpell
  row: SpellbookRow
}

/**
 * EVERY SPELL READ AT A TIER, for the classes on screen - the half of the fold a keystroke never
 * repeats (the lag sweep, owner ask 2026-10-11: no lag anywhere).
 *
 * `spellbookRow` is the cost of this list - the ladder, the magnitudes, the grants order, per
 * spell - and until the sweep the whole of it was paid again on every keystroke, for a corpus that
 * had not changed. The view keeps this answer while the catalogue, the tier and the class picks
 * hold, and a keystroke is `spellbookRowsOf` over rows already read. THE ROWS ARE SHARED across
 * those keystrokes on purpose: a row still on screen after one is the same object, which is what
 * lets the view's row memo leave it alone. Nothing downstream writes on a corpus row (`uniqueKeys`
 * copies the one case that used to).
 */
export function spellbookCorpus(
  spells: readonly UnlockSpell[],
  tier: number,
  classes?: readonly ClassAbbr[]
): SpellAtTier[] {
  const picked = classes !== undefined && classes.length > 0 ? new Set(classes) : null
  return spells.map((spell) => {
    const row = spellbookRow(spell, tier)
    narrowClasses(row, picked)
    return { spell, row }
  })
}

/**
 * THE WHOLE LIST, filtered, read at a tier, and ordered - the two halves composed, for a caller
 * with no keystroke to amortise over (the tests).
 *
 * ONE PASS OVER ~1,900 ROWS. The gear tab measured its own 6,766-row scale at ~18 ms, which is what
 * let it ship a LIVE slider; this corpus is a third of that and does strictly less per row, so the
 * same affordance is affordable here. The view still reads the tier through `useDeferredValue`, so
 * the slider thumb never waits on the list - the standing law for every control in this app that
 * moves a whole table.
 *
 * AN ABSENT FIGURE IS NEVER A ZERO (`bestSpells.ts`'s law). A spell with no healing line has no
 * `heal`, which is not the claim `heal: 0`; it sorts LAST on that column in both directions rather
 * than being read as the worst answer.
 */
export function spellbookRows(
  spells: readonly UnlockSpell[],
  q: SpellbookQuery,
  tier: number
): SpellbookRow[] {
  return spellbookRowsOf(spellbookCorpus(spells, tier, q.classes), q)
}

/** The filter and the order over a corpus already read at its tier - what a keystroke pays. */
export function spellbookRowsOf(corpus: readonly SpellAtTier[], q: SpellbookQuery): SpellbookRow[] {
  const text = (q.text ?? '').trim().toLowerCase()
  // TWO PASSES WHEN THE CHIP IS ON: everything that survives the ordinary filters, then the rungs
  // a SURVIVOR replaces. See `supersededNames` for why the replacement has to survive too.
  const admitted = corpus.filter((e) => admits(e.spell, q, text))
  const superseded =
    q.newestOnly === true ? supersededNames(admitted.map((e) => e.spell), q.classes) : null
  const kept: SpellbookRow[] = []
  for (const { spell, row } of admitted) {
    if (superseded?.has(spell.name) === true) continue
    if (q.payoffMagnitudeOnly !== undefined && row.payoff.magnitude !== q.payoffMagnitudeOnly) {
      continue
    }
    kept.push(row)
  }
  const out = uniqueKeys(kept)
  const by = q.sort ?? 'level'
  const dir = q.desc === true ? -1 : 1
  out.sort((a, b) => {
    const av = sortValue(a, by)
    const bv = sortValue(b, by)
    if (av === null && bv === null) return a.name.localeCompare(b.name)
    if (av === null) return 1
    if (bv === null) return -1
    if (av === bv) return a.name.localeCompare(b.name)
    return (av < bv ? -1 : 1) * dir
  })
  return out
}

// =================================================================================================
// DISPLAY HELPERS - one place, so the table and the page cannot word a verdict differently
// =================================================================================================

/**
 * The compact payoff glyphs: which of the five things a tier moves for this spell.
 *
 * The owner's question 2 answered ACROSS A WHOLE LIST rather than one spell at a time, which is the
 * thing a page cannot do. Order is fixed so a column of them reads down.
 */
export const PAYOFF_MARKS: readonly { key: keyof UpgradePayoff; glyph: string; title: string }[] = [
  { key: 'magnitude', glyph: 'N', title: 'the numbers get bigger' },
  { key: 'duration', glyph: 'T', title: 'it lasts longer' },
  { key: 'mana', glyph: 'M', title: 'it costs less mana' },
  { key: 'cast', glyph: 'C', title: 'it casts faster' },
  { key: 'resist', glyph: 'R', title: 'it is harder to resist' }
]

/** Is there anything at all worth saying about upgrading this row? */
export function anyPayoff(p: UpgradePayoff): boolean {
  return !p.nothing
}

/**
 * The rate this category's magnitudes move at, as a whole percent, or null where they do not move.
 *
 * Read by the tier slider's caption so it can say what the reader is looking at rather than making
 * them remember which categories scale.
 */
export function magnitudeRatePercent(c: UpgradeCategory): number | null {
  const r = UPGRADE_RATES[c]
  const rate = r.damage ?? r.heal
  return rate === null || rate === undefined ? null : Math.round(rate * 100)
}

/**
 * The ladder for one row, for the surfaces that draw a whole table rather than one tier.
 *
 * Its magnitudes are `tierMagnitudes`' too, rung by rung, so the Upgrades tab's "from -> to" is
 * the pair of numbers the Spellbook prints at those two tiers and not a total scaled on its own.
 */
export function spellbookLadder(s: UnlockSpell): SpellTierReading[] {
  const base = tierBase(s)
  return spellTierLadder(base).map((reading) => {
    const { damage: _damage, heal: _heal, ...rest } = reading
    return { ...rest, ...tierMagnitudes(s, base, reading) }
  })
}

export { SPELL_MAX_RANK }
