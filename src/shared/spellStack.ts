// spellStack.ts — WHICH TWO BUFFS CAN BOTH STAND (docs/plans/spell-upgrades-and-loadout.md §3.3).
//
// ============================================================================
// THE OWNER'S ASK, AND WHY IT NEEDED A REAL ENGINE
// ============================================================================
// Verbatim (2026-09-10): *"certain spells conflict with each-other like Spirit of Wolf and the
// shaman Spirit of Bih`Li and other attack speed modification spells."*
//
// MEASURED, and the example is sharper than the report: those two collide on MOVEMENT SPEED, not on
// haste. Spirit of Wolf grants `Increase Movement Speed by 30% (L1) to 55% (L50)`; Spirit of Bih`Li
// grants `Increase Movement Speed by 55%` AND `Increase Attack by 15`. So the useful half of the
// answer is not "these conflict" - it is "casting SoW over Bih`Li silently costs you the ATK".
//
// A HEURISTIC WOULD HAVE BEEN WRONG ON EXACTLY THE CASES THAT MATTER. "Same stat, higher wins" gets
// Bih`Li right and then gets bard songs wrong (they stack alongside non-songs), gets overhaste wrong
// (SPA 98 stacks with SPA 11), gets group-versus-single ties wrong, and cannot see a blocking
// directive at all. So this is the real algorithm.
//
// ============================================================================
// WHAT THIS IS: A PORT OF EQEmu'S `CheckStackConflict`
// ============================================================================
// From `zone/spells.cpp`, with its tables generated from `common/spdat.h` / `.cpp`. Read against the
// community browser's own JS port at <https://amerzel.github.io/eql-info/> as a second reading, so
// two independent transcriptions had to agree before a line was written here.
//
// THE VERDICT IS FROM THE CAST SPELL'S POINT OF VIEW: `'stacks'` (unrelated, both stand),
// `'overwrites'` (the cast spell replaces the worn one), `'blocked'` (the cast spell is refused).
// Words rather than EQEmu's 0 / 1 / -1, because a `-1` returned across three files is a number
// somebody eventually reads as "error".
//
// ============================================================================
// WHERE THE DATA COMES FROM, AND WHAT IS NOT MODELLED
// ============================================================================
// The twelve effect slots out of the PLAYER'S OWN `spells_us.txt` (`SpellResistInfo.slots`), which
// this app already reads for the resist table. Nothing derived from that file is ever committed, so
// every test here is driven by hand-authored rows.
//
// TWO DEVIATIONS FROM THE SERVER, BOTH STATED RATHER THAN HIDDEN:
//
//   1. `unstackableDot` IS ALWAYS FALSE. The server has a per-spell flag; this app has not
//      identified its column in the file and will not guess at one (the awaiting-sample law). The
//      consequence is narrow and it errs SAFE: a DoT compared against itself reads `blocked` where
//      the server might allow a second application. Nothing reads a self-comparison today.
//   2. THE RUNTIME-STATE BRANCHES ARE APPROXIMATED PAIRWISE. The server can see every buff in a
//      slot at once; this compares two spells. The community port documents the same limitation, and
//      it is the honest shape for a planner that is reasoning about a set rather than a live bar.
//
// Pure: no React, no Electron, no catalog, no clock.

// =================================================================================================
// THE SPA VOCABULARY
// =================================================================================================
//
// GENERATED FROM EQEmu, NOT HAND-CHOSEN. `IGNORED_IN_STACKING` is the server's own list of effects
// that never contest a slot; the named constants are the handful the algorithm branches on. A
// number added here without the server having added it is an invention.

/** Effects that never contest a slot - EQEmu `spdat.cpp`. */
const IGNORED_IN_STACKING: ReadonlySet<number> = new Set([
  13, 35, 36, 39, 57, 65, 66, 79, 116, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135,
  136, 137, 138, 139, 140, 141, 142, 143, 144, 148, 149, 167, 220, 235, 254, 286, 287, 296, 297,
  302, 303, 310, 311, 335, 340, 348, 369, 374, 382, 385, 391, 392, 393, 394, 395, 396, 411, 412,
  413, 415, 418, 420, 421, 422, 423, 424, 425, 476, 479, 480, 483, 484, 485, 486, 490, 491, 492,
  493, 495, 500, 501, 511, 512
])

/** The bard's pulsing AE damage - two SONGS may both carry it. */
const BARD_ONLY_STACK_EFFECTS: ReadonlySet<number> = new Set([334])

const SE_CURRENTHP = 0
const SE_ARMORCLASS = 1
const SE_MOVEMENTSPEED = 3
const SE_CHA = 10
const SE_ATTACKSPEED = 11
const SE_ATTACKSPEED2 = 98
const SE_COMPLETEHEAL = 101
const SE_SCREECH = 123
const SE_STACKINGCOMMAND_BLOCK = 148
const SE_STACKINGCOMMAND_OVERWRITE = 149
const SE_BLANK = 254
const SE_MANABURN = 350
const SE_ACV2 = 416
const SE_GRAVITYEFFECT = 424
const SE_IMPROVEDTAUNT = 444
/** The four "A beats B beats C beats D" ladders. Order is the ladder and is load-bearing. */
const STACKERS = [446, 447, 448, 449]

/**
 * EFFECTS THAT CAST A SECOND SPELL ON THE TARGET: `limit` is that spell's id, `base` the chance.
 *
 * MEASURED, and it is the owner's report (2026-09-26, with the screenshot): the buff set kept Form
 * of the Great Wolf AND Spirit of Bih`Li, *"movement speed stacking that doesn't work"*. In his
 * file the wolf form's own row is an illusion and a 475 naming a second spell, and the run speed and
 * the ATK its page states sit on THAT spell - movement in slot 2, which is Bih`Li's slot. A check
 * that reads only the row that was cast sees an illusion and nothing to contest.
 *
 * 475 is the measured one. 340 and 374 are the same statement in the same two fields on the other
 * castable buffs in that file, every one of them an illusion handing over a levitate or a breath.
 */
const TRIGGER_EFFECTS: ReadonlySet<number> = new Set([340, 374, 475])

/**
 * HOW MANY EFFECT SLOTS THE ENGINE COMPARES. Gaps are blanks so positions stay exact.
 *
 * EQEmu's own constant is twelve and this port carried that number over. THE OWNER'S CLIENT FILE
 * DOES NOT AGREE, measured 2026-09-10 over his 73,975 slot-bearing rows: the highest slot a row
 * uses runs to 67, and 2,160 rows use one above 12 - so a twelve-slot array silently dropped every
 * effect past the twelfth, including slot 12 itself on 2,430 rows (see the 1-based reading in
 * `stackView`, which is the other half of that same bug). Sized to the measurement plus one so the
 * highest slot observed has an index; anything beyond is still dropped rather than clamped, for
 * `stackView`'s stated reason.
 */
export const EFFECT_COUNT = 68

/** Target types the server treats as a GROUP spell, for the tie rule at the very end. */
const GROUP_TARGET_TYPES: ReadonlySet<number> = new Set([0x03, 0x28, 0x29])

// =================================================================================================
// THE VIEW
// =================================================================================================

/** One slot as the engine reads it. Positional: index 3 of the array IS slot 3. */
export type StackSlot = readonly [effect: number, base: number, limit: number, calc: number, max: number]

const BLANK_SLOT: StackSlot = [SE_BLANK, 0, 0, 100, 0]

/**
 * The engine's view of one spell.
 *
 * A view rather than the client row itself, so a caller can build one from anywhere - a test's hand
 * authored rows, the app's parsed table, or a future engine reply - without this file importing any
 * of them.
 */
export interface StackSpellView {
  /**
   * The client's spell id. Two views with one id are ONE spell.
   *
   * ZERO MEANS UNKNOWN and never matches another unknown - see `sameIdentity`, which records what
   * treating it as an ordinary value cost.
   */
  id: number
  name: string
  /** True for a beneficial spell (`good_effect`). */
  goodEffect: boolean
  targetType: number
  buffDurationFormula: number
  buffDuration: number
  /** A bard song is a non-discipline a bard can sing; it stacks alongside non-songs. */
  isBardSong: boolean
  /** See the header, deviation 1: this app cannot answer it and always says false. */
  unstackableDot: boolean
  /** Exactly `EFFECT_COUNT` entries, gaps filled with blanks. Build it with `stackView`. */
  effects: readonly StackSlot[]
  /** The spells casting this one also lands on the target. See `TRIGGER_EFFECTS`. */
  triggered?: readonly StackSpellView[]
}

/** What one spell does to another. From the CAST spell's point of view. */
export type StackVerdict = 'stacks' | 'overwrites' | 'blocked'

/** The fields `stackView` needs from a parsed client row. Structural, so no import is required. */
export interface StackSource {
  id?: number
  name?: string
  goodEffect?: boolean
  targetType?: number
  durationFormula?: number
  durationValue?: number
  song?: boolean
  slots?: readonly { slot: number; effect: number; base: number; limit: number; calc: number; max: number }[]
  /** The rows `triggeredSpellIds` names, resolved by whoever holds the table. One level deep. */
  triggers?: readonly StackSource[]
}

/**
 * The spells a row is CERTAIN to cast with itself, by id.
 *
 * ONLY A CHANCE OF 100. A row that rolls between three spells (the file has them, at 60/30/10)
 * lands one of them, and which one is not something a planner can know.
 */
export function triggeredSpellIds(slots: StackSource['slots']): number[] {
  const out: number[] = []
  for (const e of slots ?? []) {
    if (TRIGGER_EFFECTS.has(e.effect) && e.base >= 100 && e.limit > 0) out.push(e.limit)
  }
  return out
}

/**
 * Build a view from a parsed client row.
 *
 * GAPS BECOME BLANKS AND POSITIONS STAY EXACT, which is the whole reason `SpellEffectSlot` carries
 * the file's own slot number: a row with effects in slots 1 and 4 must read blank between them, and
 * a reader that packed the array would compare slot 4 of one spell against slot 1 of another.
 *
 * THE FILE NUMBERS ITS SLOTS FROM ONE, and this used to index the array with that number directly
 * (measured 2026-09-10: slot 0 occurs on none of the owner's 73,975 slot-bearing rows, slot 1 on
 * 26,347 of them). Two costs, and the second is the one that bit: index 0 was permanently blank on
 * every spell in the game, and the LAST slot of a full row fell off the end of the array. Both
 * sides of a comparison shifted together, so the pairwise verdicts survived it - which is exactly
 * why it sat here unnoticed. `slot - 1` is the whole fix.
 *
 * A slot number outside the array is DROPPED rather than clamped - a clamp would silently overwrite
 * a real effect with an out-of-range one.
 */
export function stackView(row: StackSource): StackSpellView {
  const effects: StackSlot[] = Array.from({ length: EFFECT_COUNT }, () => BLANK_SLOT)
  for (const e of row.slots ?? []) {
    const i = e.slot - 1
    if (i >= 0 && i < EFFECT_COUNT) {
      effects[i] = [e.effect, e.base, e.limit, e.calc, e.max]
    }
  }
  return {
    id: row.id ?? 0,
    name: row.name ?? '',
    goodEffect: row.goodEffect ?? false,
    targetType: row.targetType ?? 0,
    buffDurationFormula: row.durationFormula ?? 0,
    buffDuration: row.durationValue ?? 0,
    isBardSong: row.song ?? false,
    unstackableDot: false,
    effects,
    ...triggeredViews(row.triggers)
  }
}

/** A spreadable fragment, because `stackView` sits at the complexity ceiling. */
function triggeredViews(triggers: StackSource['triggers']): Pick<StackSpellView, 'triggered'> {
  return triggers === undefined ? {} : { triggered: triggers.map(stackView) }
}

// =================================================================================================
// THE MAGNITUDE
// =================================================================================================

/**
 * What one slot is WORTH at a level - EQEmu's `CalcSpellValue`, in the subset the stacking check
 * needs.
 *
 * Only the level-scaling formulas matter here: everything else is its own base. The comparison is
 * on ABSOLUTE magnitude at the end, so a formula this does not model reads as its base, which is
 * the value the server would use at level 1 and errs toward calling two spells equal rather than
 * inventing a winner.
 */
/**
 * How much a formula adds per level. A TABLE rather than a branch chain, so the arithmetic is
 * readable against the server's own list and so this function stays under the tree's complexity
 * ceiling: 101..105 add a fraction or a multiple of the level, 107..110 divide it, 111..114
 * multiply it. A formula absent here scales with nothing and reads as its own base.
 */
function levelStep(formula: number, level: number): number | null {
  if (formula === 101) return Math.floor(level / 2)
  if (formula >= 102 && formula <= 105) return level * (formula - 101)
  if (formula >= 107 && formula <= 110) return Math.floor(level / (112 - formula))
  if (formula >= 111 && formula <= 114) return level * (formula - 108)
  const measured = MEASURED_STEPS[formula]
  return measured === undefined ? null : Math.floor(level / measured)
}

/**
 * FORMULAS THIS TREE HAS MEASURED RATHER THAN READ OFF A LIST, as `level / divisor`.
 *
 * The table above is EQEmu's own and covers the formulas EQEmu documents. This client uses others,
 * and an unmodelled formula reads as its bare base - which is silent, wrong, and exactly what the
 * owner caught (2026-09-10): *"when i cast mine it goes from 88 to 104, that's 16 not 11"*.
 * Chloroplast's hitpoint row is base 6, formula 139, cap 19, and he is level 50. `6 + 50/5 = 16`.
 *
 * ONE DATAPOINT PER ENTRY, AND THE ENTRY SAYS SO. A single reading cannot separate `level / 5` from
 * several other curves that also pass through 16 at level 50; what it does establish is that the
 * bare base (6) is wrong by ten. `level / 5` is the shape the rest of this table already uses, so
 * it is the least invented answer available - and a second reading at any other level would pin it
 * outright. Until one arrives this is the honest state: measured at one point, shaped by analogy.
 */
const MEASURED_STEPS: Readonly<Record<number, number>> = {
  // Chloroplast, owner's character sheet at level 50: Combat HP Regen 88 -> 104, so 16 a tick over
  // a base of 6. CORROBORATED BY THE CATALOG, which states the ramp outright - `Increase Hitpoints
  // by 10 (L39) to 16 (L50) per tick` - and puts a second point on the curve: +4 over eleven levels
  // is the same `level / 5` the character sheet gives at 50.
  139: 5
}

export function calcSpellValue(base: number, formula: number, max: number, level: number): number {
  const step = levelStep(formula, level)
  if (step === null) return base
  // THE SCALING IS ON THE MAGNITUDE AND THE SIGN IS RE-APPLIED AFTER, which is EQEmu's own shape
  // (`CalcSpellEffectValue_formula` takes `ubase = abs(base_value)`, keeps `updownsign`, and
  // multiplies at the end). Adding the step to a NEGATIVE base directly would make a debuff get
  // WEAKER with caster level and eventually flip positive - a level-30 caster's `-10, formula 102`
  // would read +20 instead of -40. Caught by `tests/spellStack.test.mts`, which is what the fixture
  // for the negative cap is there for.
  const sign = base < 0 ? -1 : 1
  const value = Math.abs(base) + step
  const cap = Math.abs(max)
  return sign * (max !== 0 && value > cap ? cap : value)
}

const slotValue = (sp: StackSpellView, i: number, level: number): number => {
  const e = sp.effects[i]
  return calcSpellValue(e[1], e[3], e[4], level)
}

const isDetrimental = (sp: StackSpellView): boolean => !sp.goodEffect
const isGroupSpell = (sp: StackSpellView): boolean => GROUP_TARGET_TYPES.has(sp.targetType)
const hasEffect = (sp: StackSpellView, spa: number): boolean => sp.effects.some((e) => e[0] === spa)

/** A slot that contests nothing: a real blank, a zero-CHA filler, or a directive. */
function isBlankSlot(e: StackSlot): boolean {
  const [spa, base, , formula] = e
  return (
    spa === SE_BLANK ||
    (spa === SE_CHA && base === 0 && formula === 100) ||
    spa === SE_STACKINGCOMMAND_BLOCK ||
    spa === SE_STACKINGCOMMAND_OVERWRITE
  )
}

function isStackableDot(sp: StackSpellView): boolean {
  if (sp.unstackableDot || sp.goodEffect || !sp.buffDurationFormula) return false
  return hasEffect(sp, SE_CURRENTHP) || hasEffect(sp, SE_GRAVITYEFFECT)
}

// =================================================================================================
// THE CHECK
// =================================================================================================

/** The same spell cast over itself, or null when this is not that case. */
/**
 * ARE THESE TWO VIEWS THE SAME SPELL?
 *
 * ============================================================================
 * IDENTITY IS NOT A DEFAULTABLE FIELD, and defaulting it is what broke the Loadout tab
 * ============================================================================
 * `stackView` writes `id: row.id ?? 0`, and the IPC that feeds it reads the parsed client table,
 * which carried no spell id at all. So EVERY view arrived with `id: 0`, `worn.id === cast.id` held
 * for every pair in the game, and `sameSpell` answered `'overwrites'` for all of them - the verdict
 * for recasting a spell over itself. The Loadout tab therefore believed all 76 buffs a MNK/SHM/WAR
 * trio can cast contested each other, collapsed them into one component, and recommended a set of
 * ONE (owner report, 2026-09-10, with the screenshot: thirty-five rejections every one of which
 * read "probably contests Focus of Spirit", including Spirit of Cheetah, which shares not one stat
 * with it).
 *
 * The id is now carried end to end (`SpellResistInfo.id`), so the ordinary path is an id match. The
 * guard below is the part that makes the class of bug impossible rather than fixed: a ZERO id means
 * UNKNOWN, never "spell number zero", so two unknowns are not each other. Name is the fallback
 * identity - it is what the wiki catalog joins on anyway - and two views with neither are simply
 * different spells, which is the answer that lets a set stand rather than the one that collapses it.
 */
function sameIdentity(a: StackSpellView, b: StackSpellView): boolean {
  if (a.id !== 0 && b.id !== 0) return a.id === b.id
  return a.name !== '' && a.name === b.name
}

function sameSpell(worn: StackSpellView, cast: StackSpellView, wornLevel: number, castLevel: number): StackVerdict | null {
  if (!sameIdentity(worn, cast)) return null
  if (!isStackableDot(worn) && !hasEffect(worn, SE_MANABURN)) {
    // A higher-level copy of the same spell is not replaced by a lower one - except a taunt, where
    // the server lets the newer one win.
    if (wornLevel > castLevel) return hasEffect(worn, SE_IMPROVEDTAUNT) ? 'overwrites' : 'blocked'
    return 'overwrites'
  }
  return hasEffect(worn, SE_MANABURN) ? 'blocked' : null
}

/** Do the two spells carry the SAME effect in every slot? Drives the group-tie rule at the end. */
function effectsMatch(worn: StackSpellView, cast: StackSpellView): boolean {
  if (sameIdentity(worn, cast)) return true
  for (let i = 0; i < EFFECT_COUNT; i++) {
    if (worn.effects[i][0] !== cast.effects[i][0] || worn.effects[i][0] === SE_MANABURN) return false
  }
  return true
}

/** The four stacker ladders and the screech rule - a refusal that is about identity, not magnitude. */
function laddersBlock(worn: StackSpellView, cast: StackSpellView, i: number): boolean {
  const e2 = cast.effects[i]
  if (e2[0] === SE_SCREECH && e2[1] === -1 && worn.effects.some((x) => x[0] === SE_SCREECH && x[1] === 1)) {
    return true
  }
  for (let k = 0; k < STACKERS.length; k++) {
    const stacker = STACKERS[k]
    if (e2[0] === stacker) {
      const held = worn.effects.filter((x) => x[0] === stacker).map((x) => x[1])
      if (held.length > 0 && e2[1] <= Math.max(...held)) return true
    }
    // …and a rung never lands under one already held higher up the ladder.
    if (k > 0 && e2[0] === STACKERS[k - 1] && hasEffect(worn, stacker)) return true
  }
  return false
}

/**
 * THE TWO CASTER LEVELS, as one value.
 *
 * They travel together through every magnitude comparison below, and a pair of bare numbers in that
 * position is a swap waiting to happen - `(worn, cast)` and `(cast, worn)` are both plausible
 * readings of two adjacent `number` parameters and only one of them is right.
 */
export interface StackLevels {
  worn: number
  cast: number
}

/**
 * THE DIRECTIVE THRESHOLD. A stacking command's `max` carries a 1000 offset on this client - a
 * `BLOCK STR` written as 1067 means "refuse anything granting less than 67 STR".
 *
 * Measured rather than assumed (owner's install, 2026-09-10): Harnessing of Spirit carries
 * `BLOCK{STR, 1067}` and `BLOCK{DEX, 1050}`, and its own STR and DEX rows read 42 and 1 with caps
 * of 67 and 50. Those two numbers are the caps, so the offset is exactly 1000 and the comparison is
 * against the plain magnitude. It is what makes that one spell refuse nine different stat buffs in
 * the owner's log, which is the behaviour this function exists to reproduce.
 */
function directiveThreshold(max: number): number {
  return max > 1000 ? max - 1000 : max
}

/**
 * Does `other` carry this directive's effect IN THE SLOT THE DIRECTIVE NAMES, below its threshold?
 *
 * ============================================================================
 * THE SLOT, NOT ANYWHERE (owner, 2026-10-20: *"RAGE is missing from this list?"*)
 * ============================================================================
 * Until 2026-10-20 this searched every slot of `other` for the effect. That reproduced the nine
 * stat buffs Harnessing of Spirit refuses in the owner's log, and it also refused Rage, so the
 * Loadout tab listed Rage under "Left out" behind Harnessing for a Shaman who keeps both up. The log
 * says the game runs them together, in both orders (Quick Buff, 2026-08-22): at 18:00:36 Rage
 * landed with Harnessing worn since 17:20:56 (72 minutes, no fade between), and at 18:30:43
 * Harnessing landed over a worn Rage that then stayed up until 21:59:40. No `Blocked by Harnessing
 * of Spirit` line names Rage in either log.
 *
 * `limit` is the slot, 1-based, and it is a real slot number: across the owner's client file the
 * 1,422 directive rows name slots 1, 2, 3, 4, 6, 10 and more, so it is not a constant. The wiki
 * prints it in the same words (`Stacking: Block New Spell if Slot 1 is Strength and Less Than
 * 1067`). The nine stat buffs Harnessing refuses all keep their STR or DEX in slot 1, which is why
 * the effect search reproduced them; Rage keeps its STR in slot 6 and its DEX in slot 7, which is
 * why it is not refused. `tests/stackGroundTruth.test.mts` holds both halves, Rage included.
 *
 * IT COMPARES THE ROW'S BASE MAGNITUDE, NOT ITS LEVEL-SCALED VALUE, and that is measured rather
 * than reasoned. Harnessing of Spirit's `BLOCK{STR, 67}` refuses Strength in the owner's log, and
 * Strength's STR row is base 42 with a cap of 67 - so a check against the scaled value at level 50
 * compares 67 against 67, does not bite, and contradicts the log. Against the base it compares 42
 * and bites. Dexterity says the same thing louder: base 1, cap 50, threshold 50.
 *
 * The thresholds themselves are the DIRECTIVE-HOLDER'S own caps (Harnessing grants STR 42/67 and
 * DEX 1/50), so the rule reads as "refuse anything weaker than what I give at my best" - which is
 * the shape that makes one spell refuse nine different stat buffs. Scored over the owner's log the
 * base comparison is exact on both sides; the scaled one is not.
 */
function directiveBites(other: StackSpellView, directive: StackSlot): boolean {
  const at = directive[2] - 1
  if (at < 0 || at >= EFFECT_COUNT) return false
  const target = other.effects[at]
  if (target[0] !== directive[1]) return false
  return Math.abs(target[1]) < directiveThreshold(directive[4])
}

/**
 * THE EXPLICIT BLOCK/OVERWRITE DIRECTIVES - the half of the model that decides cross-line stacking.
 *
 * EQEmu encodes a directive's target slot in the formula field (`formula - 201`); this client does
 * not - its stacking rows read `calc: 100` like everything else and carry the slot, 1-based, in
 * `limit`. A directive names a SLOT, an EFFECT and a magnitude, and it bites on a spell carrying that
 * effect in that slot below that magnitude (`directiveBites`, whose header has the 2026-10-20 Rage
 * evidence that retired the 2026-09-10 "wherever the effect sits" reading). Scored against the
 * owner's log it is exact - 40 of 40 blocks reproduced, and every coexisting pair left alone,
 * Harnessing of Spirit with Rage among them.
 *
 * NO LEVEL ARGUMENT, unlike every other pass here: `directiveBites` compares BASE magnitudes, and
 * its own header carries the measurement that says it must.
 */
function directiveVerdict(
  worn: StackSpellView,
  cast: StackSpellView,
  i: number
): StackVerdict | null {
  const e1 = worn.effects[i]
  const e2 = cast.effects[i]
  if (e2[0] === SE_STACKINGCOMMAND_OVERWRITE && directiveBites(worn, e2)) {
    return 'overwrites'
  }
  if (e1[0] === SE_STACKINGCOMMAND_BLOCK && directiveBites(cast, e1)) {
    // Live 2018 onward: a DETRIMENTAL spell bypasses a block directive.
    if (!isDetrimental(cast)) return 'blocked'
  }
  return null
}

/** Do these two slots even hold the same contestable effect? */
function sameContestableEffect(e1: StackSlot, e2: StackSlot): boolean {
  if (isBlankSlot(e1) || isBlankSlot(e2)) return false
  if (e1[0] !== e2[0]) return false
  return !IGNORED_IN_STACKING.has(e1[0])
}

/** WHERE one contested effect sits on each of the two spells. See `contestPass`. */
interface SlotPair {
  worn: number
  cast: number
}

/** Should this pair of same-SPA slots be skipped rather than compared on magnitude? */
function skipSlot(worn: StackSpellView, cast: StackSpellView, at: SlotPair): boolean {
  const e1 = worn.effects[at.worn]
  const e2 = cast.effects[at.cast]
  if (!sameContestableEffect(e1, e2)) return true
  // Two SONGS may both carry the bard's pulsing damage.
  if (BARD_ONLY_STACK_EFFECTS.has(e1[0]) && worn.isBardSong && cast.isBardSong) return true
  // An AC DEBUFF never contests an AC buff's slot.
  if ((e1[0] === SE_ARMORCLASS || e1[0] === SE_ACV2) && e2[1] < 0) return true
  // Two different DoTs both ticking hitpoints are two DoTs, not a conflict.
  return e1[0] === SE_CURRENTHP && !sameIdentity(worn, cast) && isDetrimental(worn) && isDetrimental(cast)
}

/** What one slot's magnitude contest decided: a verdict, or how it left the running totals. */
type SlotOutcome = StackVerdict | 'skip' | 'contested-equal' | 'contested-greater'

/**
 * THE PER-EFFECT SPECIAL RULES, as a dispatch rather than an if-chain.
 *
 * Four SPAs decide their slot on something other than magnitude, and the tree's complexity ceiling
 * is explicitly aimed at "dispatch tables wearing an if-chain" (eslint.config.mjs's own words), so
 * they are a table. Each returns a verdict, `'skip'`, or null to mean "carry on and compare".
 */
const SPECIAL_SLOT_RULES: Readonly<
  Record<number, (v1: number, v2: number, worn: StackSpellView, cast: StackSpellView) => SlotOutcome | null>
> = {
  // A complete heal never shares its slot with anything.
  [SE_COMPLETEHEAL]: () => 'blocked',
  // A SNARE AND A SPEED BUFF ARE NOT THE SAME QUESTION: a snare blocks a run buff, and a run buff
  // simply does not contest a snare's slot.
  [SE_MOVEMENTSPEED]: (v1, v2) => (v1 < 0 && v2 > 0 ? 'blocked' : v2 < 0 && v1 > 0 ? 'skip' : null),
  // A HEAL-OVER-TIME NEVER LOSES ITS SLOT TO A DoT, and a DoT never takes one from a HoT.
  [SE_CURRENTHP]: (_v1, _v2, worn, cast) => {
    if (!(worn.buffDuration > 0 && cast.buffDuration > 0)) return null
    if (!isDetrimental(worn) && isDetrimental(cast)) return 'skip'
    return isDetrimental(worn) && !isDetrimental(cast) ? 'blocked' : null
  }
}

/**
 * The number a slot is COMPARED at.
 *
 * Haste is stored as `100 + percent`, so a 41% haste reads 141 and a contest on the stored number
 * would rank every haste above every non-haste effect. Everything else compares as it stands.
 * Absolute, because a decrease of 40 and an increase of 40 are the same strength of effect.
 */
function comparedMagnitude(spa: number, value: number): number {
  return Math.abs(spa === SE_ATTACKSPEED || spa === SE_ATTACKSPEED2 ? value - 100 : value)
}

/**
 * ONE SLOT'S MAGNITUDE CONTEST - the body of the server's own final loop, lifted out.
 *
 * A seam the source already has rather than one invented for the ceiling: that loop does two things,
 * walk the slots and judge one, and only the second is about magnitudes. Returning a small union
 * rather than mutating two outer flags is what lets the caller stay a walk.
 */
function slotContest(
  worn: StackSpellView,
  cast: StackSpellView,
  at: SlotPair,
  levels: StackLevels
): SlotOutcome {
  if (skipSlot(worn, cast, at)) return 'skip'
  const spa = worn.effects[at.worn][0]
  const raw1 = slotValue(worn, at.worn, levels.worn)
  const raw2 = slotValue(cast, at.cast, levels.cast)
  const special = SPECIAL_SLOT_RULES[spa]?.(raw1, raw2, worn, cast)
  if (special != null) return special
  const v1 = comparedMagnitude(spa, raw1)
  const v2 = comparedMagnitude(spa, raw2)
  if (v2 < v1) return 'blocked'
  return v2 === v1 ? 'contested-equal' : 'contested-greater'
}

/**
 * THE DIRECTIVE PASS: the ladders, the screech rule and the two explicit stacking commands.
 *
 * Runs only when the two spells do NOT carry the same effects in the same slots - which is the
 * server's own guard, and the reason is that an identical pair is settled by magnitude alone.
 */
function directivePass(worn: StackSpellView, cast: StackSpellView): StackVerdict | null {
  for (let i = 0; i < EFFECT_COUNT; i++) {
    if (laddersBlock(worn, cast, i)) return 'blocked'
    const directive = directiveVerdict(worn, cast, i)
    if (directive !== null) return directive
  }
  return null
}

/** How the twelve magnitude contests came out, when none of them was decisive on its own. */
interface ContestTally {
  verdict: StackVerdict | null
  /** At least one slot was genuinely contested - the cast spell takes something over. */
  willOverwrite: boolean
  /** Every contested slot came out level. Drives the group-versus-single tie rule. */
  valuesEqual: boolean
}

/**
 * THE MAGNITUDE PASS: walk the slots in lockstep and tally what the contests decided.
 *
 * ============================================================================
 * SLOT FOR SLOT, WHICH IS EQEmu'S OWN RULE - AND I BRIEFLY REPLACED IT, WRONGLY
 * ============================================================================
 * On 2026-09-10 this matched by EFFECT wherever it sat, because lockstep appeared to miss most of
 * the conflicts anyone would ask about. It did catch all 40 of the blocks the owner's log records
 * - and it also called pairs conflicting that the game runs together happily. He proved that the
 * same evening by casting thirteen buffs in a row on his pet with not one refusal between them,
 * which is 78 pairs that must NOT conflict, including `Strength + Infusion of Spirit` and
 * `Dexterity + Infusion of Spirit`.
 *
 * Lockstep was never the problem. The DIRECTIVE PASS was: `directiveVerdict` was looking for its
 * target at a slot number that no row uses that way, so the 148/149 stacking commands - the things
 * that actually make one buff refuse another from a different line - never fired at all. With both
 * halves working the model scores 40/40 on the blocks and 81/81 on the pairs that stack.
 *
 * SO THE TWO HALVES DO DIFFERENT JOBS, and neither is sufficient: lockstep settles a spell meeting
 * another rank of ITSELF (where the slots line up by construction), and the directives settle
 * everything across lines. `directiveVerdict` carries the other half of this note.
 */
function contestPass(worn: StackSpellView, cast: StackSpellView, levels: StackLevels): ContestTally {
  let willOverwrite = false
  let valuesEqual = true
  for (let i = 0; i < EFFECT_COUNT; i++) {
    const outcome = slotContest(worn, cast, { worn: i, cast: i }, levels)
    if (outcome === 'skip') continue
    if (outcome === 'blocked' || outcome === 'overwrites' || outcome === 'stacks') {
      return { verdict: outcome, willOverwrite, valuesEqual }
    }
    if (outcome === 'contested-greater') valuesEqual = false
    willOverwrite = true
  }
  return { verdict: null, willOverwrite, valuesEqual }
}

/**
 * What the tally MEANS - the server's own closing lines.
 *
 * Its own function so `checkStackConflict` reads as the four passes it is (same-spell, song,
 * directives, magnitudes) rather than as three passes and an epilogue, which is what pushed it one
 * point over the tree's complexity ceiling.
 */
function settle(
  tally: ContestTally,
  worn: StackSpellView,
  cast: StackSpellView,
  effectsMatched: boolean
): StackVerdict {
  if (tally.verdict !== null) return tally.verdict
  if (!tally.willOverwrite) return 'stacks'
  // A SINGLE-TARGET SPELL DOES NOT REPLACE AN IDENTICAL GROUP ONE. Recasting a single haste over the
  // group haste you were just given would otherwise quietly drop you out of the group buff.
  if (tally.valuesEqual && effectsMatched && !isGroupSpell(cast) && isGroupSpell(worn)) return 'blocked'
  return 'overwrites'
}

/**
 * WHAT HAPPENS WHEN `cast` IS CAST ON A TARGET ALREADY CARRYING `worn`.
 *
 * `levels` are the CASTER levels the two were cast at - they decide the magnitudes a level-scaling
 * formula produces, and therefore who wins a same-slot contest.
 */
export function checkStackConflict(
  worn: StackSpellView,
  cast: StackSpellView,
  levels: StackLevels
): StackVerdict {
  const same = sameSpell(worn, cast, levels.worn, levels.cast)
  if (same !== null) return same

  // A SONG AND A SPELL LIVE IN DIFFERENT SLOTS, so two beneficial ones never contest each other.
  if (worn.isBardSong !== cast.isBardSong && !isDetrimental(worn) && !isDetrimental(cast)) {
    return 'stacks'
  }

  const match = effectsMatch(worn, cast)
  const directive = match ? null : directivePass(worn, cast)
  if (directive !== null) return directive

  return settle(contestPass(worn, cast, levels), worn, cast, match)
}

// =================================================================================================
// THE CONFLICT GRAPH — what the Loadout tab's optimizer stands on
// =================================================================================================

/** One component of the conflict graph: a set of spells that contest each other and nobody else. */
export interface StackComponent {
  /** Indices into the array that was handed in, so a caller keeps its own row objects. */
  members: number[]
  /**
   * TRUE when every member contests every other one - a clique.
   *
   * It is the property the optimizer needs, because in a clique the best subset is trivially "the
   * single best member" and the answer is exact in O(n). A component that is NOT a clique needs a
   * search, and `spellLoadout.ts` states its own cap and refuses to claim optimality past it.
   */
  clique: boolean
}

/**
 * Do these two spells contest each other AT ALL, in either direction?
 *
 * The graph is UNDIRECTED on purpose. `checkStackConflict` is asymmetric - it answers "what happens
 * when I cast B onto A" - but the planner's question is "can these two both be up", and that is
 * symmetric: if either direction is anything but `'stacks'`, they cannot both stand.
 *
 * AND IT IS ASKED OF EVERYTHING EACH CAST LANDS, not only of the two rows that were cast: a spell
 * that hands its effects to a second one contests through that one (`TRIGGER_EFFECTS`).
 */
export function spellsConflict(a: StackSpellView, b: StackSpellView, levels: StackLevels): boolean {
  for (const x of [a, ...(a.triggered ?? [])]) {
    for (const y of [b, ...(b.triggered ?? [])]) {
      // Two spells that both hand over the SAME second spell share it rather than contest it.
      if (x !== a && y !== b && sameIdentity(x, y)) continue
      if (eitherRefuses(x, y, levels)) return true
    }
  }
  return false
}

function eitherRefuses(a: StackSpellView, b: StackSpellView, levels: StackLevels): boolean {
  if (checkStackConflict(a, b, levels) !== 'stacks') return true
  return checkStackConflict(b, a, { worn: levels.cast, cast: levels.worn }) !== 'stacks'
}

/**
 * PARTITION A CANDIDATE SET INTO CONNECTED COMPONENTS OF THE CONFLICT GRAPH.
 *
 * The optimizer's whole exactness argument rests on this (§3.5): maximum-weight independent set is
 * NP-hard in general, but if the graph decomposes into small components and most of those are
 * cliques, then the answer is "the best member of each clique" - exact, and linear.
 *
 * O(n^2) PAIRWISE, DELIBERATELY. The candidate set is the buffs one class trio can cast, which is
 * tens of spells rather than hundreds; a smarter build would cost more to read than it saves. The
 * caller is expected to narrow the corpus before asking, and `spellLoadout.ts` does.
 */
export function conflictComponents(
  spells: readonly StackSpellView[],
  levels: StackLevels
): StackComponent[] {
  const n = spells.length
  const adjacency: boolean[][] = Array.from({ length: n }, () => Array<boolean>(n).fill(false))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (spellsConflict(spells[i], spells[j], levels)) {
        adjacency[i][j] = true
        adjacency[j][i] = true
      }
    }
  }
  const seen = new Array<boolean>(n).fill(false)
  const out: StackComponent[] = []
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue
    const members = reachableFrom(i, adjacency, seen)
    out.push({ members, clique: isClique(members, adjacency) })
  }
  return out
}

/**
 * Every index reachable from `start`, marking them seen as it goes.
 *
 * Its own function because the walk nested four blocks deep inside the partition loop and this tree
 * caps nesting at three - which is the ceiling working: the inner block wanted a name, and the name
 * is "the component containing this spell".
 */
function reachableFrom(start: number, adjacency: readonly boolean[][], seen: boolean[]): number[] {
  const members: number[] = []
  const stack = [start]
  seen[start] = true
  while (stack.length > 0) {
    const cur = stack.pop()
    if (cur === undefined) break
    members.push(cur)
    for (let j = 0; j < adjacency.length; j++) {
      if (!adjacency[cur][j] || seen[j]) continue
      seen[j] = true
      stack.push(j)
    }
  }
  return members.sort((a, b) => a - b)
}

/** Does every member contest every other? A singleton is trivially one. */
function isClique(members: readonly number[], adjacency: readonly boolean[][]): boolean {
  for (let a = 0; a < members.length; a++) {
    for (let b = a + 1; b < members.length; b++) {
      if (!adjacency[members[a]][members[b]]) return false
    }
  }
  return true
}
