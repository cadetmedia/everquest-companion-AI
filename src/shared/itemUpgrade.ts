// itemUpgrade.ts — what an item's stat block reads at any ` +N` upgrade state.
//
// ============================================================================
// SOURCE (world-model law 1 — never invent arithmetic)
// ============================================================================
// Every rule below is PORTED from the eqlwiki ItemLevelSlider ResourceLoader module
// (eqlwiki.com, `load.php?modules=ext.itemLevelSlider`) — the script that drives the item
// level slider on every item page. It was extracted verbatim and checkpoint-verified by
// independent re-execution against two real items before this file existed; the extraction,
// the three corrections it forced on this repo's older research note, and the fixture
// numbers are recorded in JOS-281 (comments "THE ALGORITHM" and "VERIFICATION FIXTURES")
// and pinned in tests/itemUpgrade.test.mts.
//
// Nothing here is derived, averaged, or tidied up. Where the reference disagrees with
// clean decimal arithmetic — see THE FLOAT ARTIFACT — the REFERENCE WINS, because the
// number a player reads on the wiki page is the number this planner has to reproduce.
// "Fixing" the artifact would make the planner quietly disagree with its own source.
//
// The wiki page `MediaWiki:ItemLevelMultipliers` ({1:1.3, 2:1.6, …}) is DEAD DATA: no
// module loads it and it contradicts the real progression. It is not ported. Do not port it.
//
// ============================================================================
// THE STATE
// ============================================================================
// An upgrade state is the in-game item window's `Tier N   x / y` row:
//   full     = N, the tier, 0..10
//   fraction = x, merge exp banked toward the next tier, 0 .. 2^full - 1  (y IS 2^full,
//              which `itemStats.expToNextTier` already states — one home for that curve)
// so effectiveLevel = full + fraction / 2^full, the percent label is effectiveLevel * 10,
// and totalProgression = 2^full + fraction (the argument the WEIGHT curve takes, and the
// only place fraction enters a non-linear term). Tier 10 is the cap and banks nothing, so
// there are exactly 1024 reachable states: Σ(2^full for full 0..9) + 1.
//
// ============================================================================
// THE ROUNDING (load-bearing — the fixtures fail on any other spelling)
// ============================================================================
// `excelRound` is round-HALF-AWAY-FROM-ZERO, not JS `Math.round` (which is half-toward
// +Infinity and so disagrees on every negative half). `excelRoundUp` is ceil-away-from-zero.
// For a PRIMARY stat the increment rounds BEFORE it is added and the SUM is floored —
// `floor(base + round(base * effective / 10))`, never `floor(base * (1 + effective/10))`:
// WIS 15 at tier 2 + 3/4 is floor(15 + round(4.125)) = 19, and the one-step spelling says 20.
//
// ============================================================================
// THE FLOAT ARTIFACT (replicate, do not fix — pinned in the test)
// ============================================================================
// The weight curve is evaluated in IEEE754 doubles, and at full = 10 the subtraction lands
// just ABOVE the exact decimal: `3.0 * (1 - 0.09 * 10)` is 0.30000000000000027, not 0.3, so
// the ceiling-to-one-decimal returns 0.4 where exact-decimal math would return 0.3. 0.4 is
// what the wiki slider displays. Same artifact at base 1.0 (0.2, not 0.1). Any
// re-implementation in decimal/rational arithmetic would silently disagree with the source.

import type { ItemStat, ItemStatBlock } from './itemStats'
import { ITEM_MAX_TIER } from './itemStats'

// ---- state ---------------------------------------------------------------------

/** The in-game `Tier N   x / y` row: `full` = N, `fraction` = x (and y is always 2^full). */
export interface ItemUpgradeState {
  full: number
  fraction: number
}

export const ITEM_UPGRADE_BASE: ItemUpgradeState = { full: 0, fraction: 0 }

/** Total number of reachable states (0..9 with their fractions, plus the capped tier 10). */
export const ITEM_UPGRADE_STATE_COUNT = 1024

/**
 * The only legal spelling of a state: `full` an integer in 0..10, `fraction` an integer in
 * 0 .. 2^full - 1, and FORCED to 0 at both ends — tier 0 has no denominator to bank against
 * and tier 10 is the cap, so neither can carry partial exp. Everything downstream may assume
 * a normalized state; `scaleStatBlock` normalizes what it is handed.
 */
export function normalizeUpgradeState(state: ItemUpgradeState): ItemUpgradeState {
  const full = Math.min(ITEM_MAX_TIER, Math.max(0, Math.trunc(state.full) || 0))
  if (full === 0 || full === ITEM_MAX_TIER) return { full, fraction: 0 }
  const max = 2 ** full - 1
  return { full, fraction: Math.min(max, Math.max(0, Math.trunc(state.fraction) || 0)) }
}

/**
 * THE ONE READING OF A ` +N` THE GAME WROTE DOWN (JOS-416).
 *
 * An inventory dump — and an item name anywhere else the client prints one — states the TIER and
 * stops: the `x / y` half of the item window's row is in no file this app can read. So a name that
 * says ` +5` is `{full: 5, fraction: 0}`, and a name that says nothing at all is the BASE state
 * rather than a guess. That makes every number derived from it a FLOOR on what the item really
 * reads, which is the only safe direction, and it is written here — not at each call site — so the
 * Character sheet's gear sum and the Gear tab's comparison cannot drift into two readings of the
 * same suffix.
 *
 * `undefined` is "the name carried no suffix", NEVER tier 0 arriving by another road; both answer
 * `ITEM_UPGRADE_BASE` because an un-upgraded item and an item at tier 0 read identically.
 */
export function upgradeStateForTier(tier: number | undefined): ItemUpgradeState {
  return tier === undefined ? ITEM_UPGRADE_BASE : normalizeUpgradeState({ full: tier, fraction: 0 })
}

/** `full + fraction / 2^full` — the slider's position, and the multiplier every stat reads. */
export function effectiveLevel(state: ItemUpgradeState): number {
  const s = normalizeUpgradeState(state)
  return s.full + s.fraction / 2 ** s.full
}

/** `2^full + fraction` — merge exp banked in total. Only the WEIGHT curve consumes it. */
export function totalProgression(state: ItemUpgradeState): number {
  const s = normalizeUpgradeState(state)
  return 2 ** s.full + s.fraction
}

/** The headline percentage: `effectiveLevel * 10` (tier 2 + 3/4 → 27.5). */
export function upgradePercent(state: ItemUpgradeState): number {
  return effectiveLevel(state) * 10
}

/** `upgradePercent` as the window draws it: `+27.5%`, `+30%`, `+100%`. */
export function percentLabel(state: ItemUpgradeState): string {
  return `+${Number(upgradePercent(state).toFixed(3)).toString()}%`
}

// ---- rounding helpers (ported verbatim; see THE ROUNDING above) -----------------

/** Round half AWAY FROM ZERO at `digits` decimals (Excel's ROUND, not `Math.round`). */
export function excelRound(value: number, digits = 0): number {
  const f = 10 ** digits
  const x = value * f
  return (x < 0 ? -Math.round(-x) : Math.round(x)) / f
}

/** Ceil AWAY FROM ZERO at `digits` decimals (Excel's ROUNDUP). */
export function excelRoundUp(value: number, digits = 0): number {
  const f = 10 ** digits
  return (value < 0 ? -Math.ceil(-value * f) : Math.ceil(value * f)) / f
}

// ---- stat keys ------------------------------------------------------------------

/**
 * How a stat key scales. `unchanged` is the DEFAULT and covers everything the reference
 * leaves alone: heroic stats, Attack, Dmg Bon, Size, Rec Level, charges,
 * effect magnitudes — anything not named in the three tables below. RANGE left that list on
 * 2026-09-26: see `scaleRange`; BACKSTAB on 2026-10-24: see `scaleBackstab`.
 */
export type UpgradeStatClass = 'primary' | 'flat' | 'damage' | 'backstab' | 'delay' | 'weight' | 'range' | 'unchanged'

/**
 * Key aliases, mirroring the slider's own table. Sorted LONGEST-FIRST so a compound key can
 * never be swallowed by one of its own words (`MANA REGEN` before `MANA`). Matching is on
 * the WHOLE normalized key, which is also what keeps `HEROIC STR` out of `STR`.
 */
const KEY_ALIASES: [string, string][] = (
  [
    ['MANA_REGEN', 'MANA_REGEN'],
    ['ENDURANCE', 'END'],
    ['HP_REGEN', 'HP_REGEN'],
    ['END_REGEN', 'END_REGEN'],
    ['DISEASE', 'SV_DISEASE'],
    ['POISON', 'SV_POISON'],
    ['DAMAGE', 'DMG'],
    ['ATK_DELAY', 'DELAY'],
    ['REGEN', 'HP_REGEN'],
    ['ENDUR', 'END'],
    ['MAGIC', 'SV_MAGIC'],
    ['MANA', 'MP'],
    ['FIRE', 'SV_FIRE'],
    ['COLD', 'SV_COLD'],
    ['WT', 'WEIGHT']
  ] as [string, string][]
).sort((a, b) => b[0].length - a[0].length)

/** `sv magic` / `SV  MAGIC` / `Mana Regen` → `SV_MAGIC` / `SV_MAGIC` / `MANA_REGEN`. */
export function normalizeStatKey(key: string): string {
  const k = key.trim().toUpperCase().replace(/[\s-]+/g, '_').replace(/:+$/, '')
  const alias = KEY_ALIASES.find(([from]) => from === k)
  return alias ? alias[1] : k
}

const PRIMARY_KEYS = new Set(['AC', 'STR', 'STA', 'AGI', 'DEX', 'WIS', 'INT', 'CHA', 'HP', 'MP', 'END'])
const FLAT_KEYS = new Set(['HP_REGEN', 'MANA_REGEN', 'END_REGEN', 'HASTE'])

/** Which rule a key scales by. Takes a RAW key; normalization happens here. */
export function upgradeStatClass(key: string): UpgradeStatClass {
  const k = normalizeStatKey(key)
  if (k === 'DMG') return 'damage'
  if (k === 'DELAY') return 'delay'
  if (k === 'WEIGHT') return 'weight'
  if (k === 'RANGE') return 'range'
  if (k === 'BACKSTAB') return 'backstab'
  if (FLAT_KEYS.has(k)) return 'flat'
  if (PRIMARY_KEYS.has(k) || k.startsWith('SV_')) return 'primary'
  return 'unchanged'
}

// ---- the scaling rules ----------------------------------------------------------

/**
 * PRIMARY (AC, the seven attributes, HP/MP/END, every SV_*):
 *   base == 0            → 0            (an absent stat stays absent)
 *   0 < base <= 10       → base + full  (FRACTION IGNORED — this is the "+1 per tier" the
 *                                        old research note mistook for a floor rule)
 *   base > 10            → floor(base + round(base * effective / 10))
 *   -10 <= base < 0      → min(0, base + full)   penalties SHRINK toward zero, never past it
 *   base < -10           → min(0, base + round(|base| * effective / 10))
 *
 * THE LAST ROW joined on 2026-09-28. The slider's source states it (`scalePrimarySpreadsheetStat`,
 * "larger penalties improve by 10% per effective tier"), and the owner's reading agrees:
 * Stonemelder's Band, DEX -35 AGI -35, reads 0 on both at +10. Until then every penalty took the
 * row above it, which read that item -25.
 */
export function scalePrimary(base: number, state: ItemUpgradeState): number {
  const s = normalizeUpgradeState(state)
  if (base === 0) return 0
  if (base < -10) return Math.min(0, base + excelRound((-base * effectiveLevel(s)) / 10, 0))
  if (base < 0) return Math.min(0, base + s.full)
  if (base <= 10) return base + s.full
  return Math.floor(base + excelRound((base * effectiveLevel(s)) / 10, 0))
}

/** WEAPON DMG: `base + floor(base * effective / 10)` — +10% per level, and it reads the fraction. */
export function scaleDamage(base: number, state: ItemUpgradeState): number {
  if (base <= 0) return base
  return base + Math.floor((base * effectiveLevel(state)) / 10)
}

/** What one tier adds to a range. */
const RANGE_PER_TIER = 10

/**
 * RANGE: `base + 10 * full`. READ OFF THE SLIDER AND THE GAME, NOT OFF THE SLIDER'S SOURCE - the
 * port this file began as copied Range unchanged, and the owner's arrows showed it was wrong
 * (2026-09-26). Three readings, two items:
 *
 *   Mithril Champion Arrows, base 150:  220 at +7 in the game window, 250 at +10 on the slider
 *   Blessed Champion Arrows, base 170:  270 at +10 on the slider
 *
 * Two bases ten tiers up both gained exactly 100, which is what rules out a percentage (170 would
 * have read 283). TWO THINGS ARE NOT MEASURED and are stated rather than hidden: every reading is
 * an ARROW, so a bow following the same rule is this file reading the slider's rule as one rule
 * per key, the way every other rule here is; and every reading is a whole tier, so the fraction
 * is ignored, as the flat stats ignore it, until a reading says otherwise.
 */
export function scaleRange(base: number, state: ItemUpgradeState): number {
  if (base <= 0) return base
  return base + RANGE_PER_TIER * normalizeUpgradeState(state).full
}

/**
 * BACKSTAB: `base + floor(base * effective / 20)`, +5% per level, half DMG's rate. READ OFF THE GAME
 * (owner, 2026-10-24), not the slider, which copies Backstab unchanged: Torturer's Signature, base 15,
 * reads 15 16 17 18 18 19 20 at +1..+7 and 22 at +10, and 16 at tier 1 + 1/2 (so the fraction counts;
 * "one per two tiers" would read 15 there). One weapon measured.
 */
export function scaleBackstab(base: number, state: ItemUpgradeState): number {
  if (base <= 0) return base
  return base + Math.floor((base * effectiveLevel(state)) / 20)
}

/**
 * A WEAPON's Accuracy at `state`, in percent: `2.5 * log2(totalProgression)` floored to a tenth, none
 * at +0. READ OFF THE GAME (owner, 2026-10-24); the slider has no Accuracy at all. Two weapons with
 * none at +0 (Torturer's Signature, Remnant of the Betrayer) gain it: +2.5% a tier, 25% at +10, and
 * on the weight curve between tiers (tier 1 + 1/2 reads 3.9%, `2.5 * log2(3)` = 3.96; a straight
 * line would read 3.75). Non-weapons are not measured and gain nothing here.
 */
export function weaponAccuracy(state: ItemUpgradeState): number {
  const s = normalizeUpgradeState(state)
  if (s.full === 0) return 0
  return Math.floor(ACCURACY_PER_TIER * 10 * Math.log2(totalProgression(s)) + 1e-9) / 10
}
const ACCURACY_PER_TIER = 2.5

/** FLAT (the three regens, Haste): `base + full`, fraction ignored. */
export function scaleFlat(base: number, state: ItemUpgradeState): number {
  if (base <= 0) return base
  return base + normalizeUpgradeState(state).full
}

/**
 * WEIGHT: `max(0, ceilToOneDecimal(base * (1 - 0.09 * log2(totalProgression))))`.
 * The `base <= 0.1` test is an ENTRY GUARD (a feather-light item is never touched at all),
 * NOT an output clamp — the output clamps at 0. The CEILING is load-bearing: 3.0 at tier
 * 2 + 3/4 is 2.2420…, which ceils to 2.3 where round-to-nearest would say 2.2.
 */
export function scaleWeight(base: number, state: ItemUpgradeState): number {
  const s = normalizeUpgradeState(state)
  if (s.full === 0 || base <= 0.1) return base
  return Math.max(0, excelRoundUp(base * (1 - 0.09 * Math.log2(totalProgression(s))), 1))
}

// ---- SV VOID synthesis ----------------------------------------------------------

/**
 * The upgrade grants a synthetic `SV VOID: +full` line to any upgraded item carrying at
 * least TWO distinct fields from this set. AC, HP and MP are deliberately NOT in it.
 */
const VOID_TRIGGER_KEYS = new Set([
  'STR', 'STA', 'INT', 'AGI', 'DEX', 'CHA', 'WIS',
  'SV_FIRE', 'SV_COLD', 'SV_POISON', 'SV_MAGIC', 'SV_DISEASE'
])

/** Whether an upgraded copy of this block gains the synthetic SV VOID line. */
export function synthesizesVoidSave(block: ItemStatBlock, state: ItemUpgradeState): boolean {
  if (normalizeUpgradeState(state).full === 0) return false
  // An item that already states SV VOID keeps its own (scaled) line; we never draw a second.
  if (block.saves.some((s) => normalizeStatKey(s.key) === 'SV_VOID')) return false
  const seen = new Set<string>()
  for (const st of [...block.stats, ...block.saves]) {
    const k = normalizeStatKey(st.key)
    if (VOID_TRIGGER_KEYS.has(k)) seen.add(k)
  }
  return seen.size >= 2
}

// ---- stat-value text ------------------------------------------------------------

/** `+15` → 15, `36%` → 36, `-5` → -5. `undefined` when the value states no number. */
function statNumber(value: string): number | undefined {
  const m = /-?\d+(?:\.\d+)?/.exec(value)
  return m ? Number(m[0]) : undefined
}

/**
 * Re-render a scaled value in the SOURCE's own spelling: the leading `+` survives only if
 * the item wrote one, and any trailing unit (`%`) is carried across verbatim.
 */
function renderStatValue(source: string, scaled: number): string {
  const hadPlus = /^\s*\+/.test(source)
  const suffix = /\d\s*(%)\s*$/.exec(source)?.[1] ?? ''
  const body = scaled > 0 && hadPlus ? `+${scaled}` : String(scaled)
  return `${body}${suffix}`
}

function scaleStat(stat: ItemStat, state: ItemUpgradeState): ItemStat {
  const cls = upgradeStatClass(stat.key)
  if (cls !== 'primary' && cls !== 'flat') return stat
  const base = statNumber(stat.value)
  if (base === undefined) return stat
  const scaled = cls === 'primary' ? scalePrimary(base, state) : scaleFlat(base, state)
  return scaled === base ? stat : { key: stat.key, value: renderStatValue(stat.value, scaled) }
}

/** WT is stored as TEXT ("3.0"), so an unreadable or unscaled weight survives verbatim. */
function scaleWeightText(weight: string | undefined, state: ItemUpgradeState): string | undefined {
  if (weight === undefined) return undefined
  const base = statNumber(weight)
  if (base === undefined) return weight
  const scaled = scaleWeight(base, state)
  return scaled === base ? weight : scaled.toFixed(1)
}

/**
 * Range is stored as TEXT, and only a range that is ONE whole number scales. The thirty arrow
 * pages that state a triple ("50 / 75 / 100") survive verbatim: which third is the base is not
 * something this file knows.
 */
function scaleRangeText(range: string | undefined, state: ItemUpgradeState): string | undefined {
  if (range === undefined || !WHOLE_NUMBER.test(range.trim())) return range
  return String(scaleRange(Number(range.trim()), state))
}
const WHOLE_NUMBER = /^[0-9]+$/

/**
 * A melee weapon: damage, a delay, and a PRIMARY or SECONDARY slot, the two measured. Ammo is not one
 * (the owner's +7 arrows show no Accuracy, tests/itemElementalDamage.test.mts); a bow is not measured.
 */
const isMeleeWeapon = (block: ItemStatBlock): boolean => (block.dmg ?? 0) > 0 && block.atkDelay !== undefined && /\b(PRIMARY|SECONDARY)\b/i.test(block.slot ?? '')

/** The stats with an upgraded melee weapon's `Accuracy: +X%` after them; an item stating its own keeps it. */
function withWeaponAccuracy(block: ItemStatBlock, stats: ItemStat[], state: ItemUpgradeState): ItemStat[] {
  const pct = weaponAccuracy(state)
  if (pct === 0 || !isMeleeWeapon(block) || stats.some((st) => normalizeStatKey(st.key) === 'ACCURACY')) return stats
  return [...stats, { key: 'Accuracy', value: `+${String(pct)}%` }]
}

// ---- the API --------------------------------------------------------------------

/**
 * The same item at `state`. Returns a NEW block; the input is never mutated.
 *
 * DELAY never scales, which is the whole reason a weapon's damage RATIO improves: the ratio
 * a caller draws is `damageRatio(scaled.dmg, scaled.atkDelay)` — scaled DMG over the BASE
 * delay — rendered `.toFixed(2)`, exactly as the item window does (Thelvorn at tier 2 + 3/4
 * is 25/26 = 0.9615… → "0.96"). `toFixed` is round-half-away-from-zero on the decimal
 * representation, which is the same direction as `excelRound`; no separate helper is needed.
 *
 * Everything the reference leaves alone is COPIED, not recomputed: flags, slot, class/race,
 * skill, Dmg Bon, Size, effects, exaltation sockets and `extras`. BACKSTAB scales and an upgraded
 * WEAPON gains an `Accuracy` line, both read off the game (`scaleBackstab`, `weaponAccuracy`).
 */
export function scaleStatBlock(block: ItemStatBlock, state: ItemUpgradeState): ItemStatBlock {
  const s = normalizeUpgradeState(state)
  const saves = block.saves.map((sv) => scaleStat(sv, s))
  if (synthesizesVoidSave(block, s)) saves.push({ key: 'SV VOID', value: `+${s.full}` })

  return {
    ...block,
    stats: withWeaponAccuracy(block, block.stats.map((st) => scaleStat(st, s)), s),
    saves,
    ...(block.ac === undefined ? {} : { ac: scalePrimary(block.ac, s) }),
    ...(block.dmg === undefined ? {} : { dmg: scaleDamage(block.dmg, s) }),
    ...(block.backstab === undefined ? {} : { backstab: scaleBackstab(block.backstab, s) }),
    weight: scaleWeightText(block.weight, s),
    ...(block.range === undefined ? {} : { range: scaleRangeText(block.range, s) }),
    flags: [...block.flags],
    effects: [...block.effects],
    exaltationSlots: [...block.exaltationSlots],
    extras: [...block.extras]
  }
}
