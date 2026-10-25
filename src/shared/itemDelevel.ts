// itemDelevel.ts — a `+N` item window's statsblock taken back to +0 with the app's own upgrade rules
// (itemUpgrade.ts: the wiki slider's port plus what was read off the game), run backwards. Owner,
// 2026-10-21 (D3): "can't we use that same function/logic to 'delevel' an item to +0?"; 2026-10-25:
// "uses the same formulas in reverse to find the +0 stats, so that we can paste ANY item in (+5, +10,
// +4 with 16/32, etc) and it will figure out the +0 value for us".
//
//   THE STATE. The name states the tier; the window's Tier bar (`Tier 5  16/32`) states the merge
//   progress toward the next one, which the rules for stats over ten, DMG, Backstab, Weight and a
//   weapon's Accuracy read (itemUpgrade.ts `effectiveLevel`, `totalProgression`). Read, the state is
//   one; unread, every fraction the tier allows is tried, and a melee weapon's Accuracy (the upgrade's
//   own, a function of the state alone) keeps only the states that give it.
//   THE INVERSE. Every number with a rule is run back through THAT rule (never a copy of it): its +0
//   values are the bases the rule takes to the number read. One state must explain every number at
//   once, so the states are narrowed together. A number with one base over the states left is taken
//   back; one with several (Weight's ceiling, a penalty the cap wipes out) or none (a misread) is
//   written `?` and named, for the player to fill. Never a guess, never a +N number as a base.
//   THE PROOF. The +0 block is scaled forward again (`scaleStatBlock`) at the state found and must give
//   the window's numbers back; a number that does not is left to the player too.

import { normalizeStatKey, scaleBackstab, scaleDamage, scaleFlat, scalePrimary, scaleRange, scaleWeight, upgradeStatClass, weaponAccuracy, type ItemUpgradeState } from './itemUpgrade'
import { ITEM_MAX_TIER } from './itemStats'
import { roundTripMisses } from './itemDelevelCheck'

export interface Delevel {
  /** The +0 statsblock: every number taken back, those that cannot be written `?`. */
  block?: string
  /** True when every number took back to one +0 value and the block scales forward to the window's numbers. */
  exact: boolean
  /** The numbers left for the player (`WT: 0.4`), as the window shows them. */
  inexact: string[]
  /** Why each was left, and what the state came to, in words. */
  notes: string[]
}

type Rule = (base: number, s: ItemUpgradeState) => number

/** The forward rule of each kind of number (itemUpgrade.ts `upgradeStatClass`); a kind without one is copied. */
const RULES: Partial<Record<ReturnType<typeof upgradeStatClass>, Rule>> = {
  primary: scalePrimary,
  flat: scaleFlat,
  damage: scaleDamage,
  weight: scaleWeight,
  range: scaleRange,
  backstab: scaleBackstab
}

/** The states the window can be in: the read fraction, else every one the tier allows (none at the cap). */
export function statesAt(tier: number, fraction?: number): ItemUpgradeState[] {
  const full = Math.min(ITEM_MAX_TIER, Math.max(0, tier))
  if (full === 0 || full >= ITEM_MAX_TIER) return [{ full, fraction: 0 }]
  if (fraction !== undefined && Number.isInteger(fraction) && fraction >= 0 && fraction < 2 ** full) return [{ full, fraction }]
  return Array.from({ length: 2 ** full }, (_, f) => ({ full, fraction: f }))
}

/** Every base the rule takes to `read` at state `s`: whole numbers, or tenths for Weight. */
function basesAt(rule: Rule, read: number, s: ItemUpgradeState, tenths: boolean): number[] {
  const step = tenths ? 0.1 : 1
  // An upgrade only adds (Weight only takes off): a positive base is at most the number, a penalty at most it.
  const lo = read > 0 ? (tenths ? read : step) : read - 300 * step
  const hi = tenths ? Math.max(read, 0) * 12 + step : Math.max(read, 0) + step
  const out: number[] = []
  for (let i = Math.round(lo / step); i * step <= hi + 1e-9; i++) {
    const b = Number((i * step).toFixed(tenths ? 1 : 0))
    if (rule(b, s) === read) out.push(b)
  }
  return out
}

/** `KEY: number` as the statsblock writes it; a two-word key only with its known first word (`SV MAGIC`, `HP Regen`). */
// A number that opens a list (`Range: 5 / 25 / 50`) is not one value: the rules leave such a line as it is.
const PAIR = /(?<![A-Za-z])((?:(?:SV|HP|Mana|End|Atk|Dmg|Bane|Heal|Spell|Damage|Combat|Stun|DoT) )?[A-Za-z]+):\s*([+-]?\d+(?:\.\d+)?)(%?)(?!\s*\/|[\d.])/g

/** One number of the window that a rule scales. */
interface Read {
  key: string
  num: string
  pct: string
  rule: Rule
  tenths: boolean
}

const readsOf = (line: string): Read[] =>
  [...line.matchAll(PAIR)].flatMap((m) => {
    const rule = RULES[upgradeStatClass(m[1])]
    return rule === undefined ? [] : [{ key: m[1], num: m[2], pct: m[3], rule, tenths: upgradeStatClass(m[1]) === 'weight' }]
  })

/** Whether the block earns the upgrade's synthetic SV VOID (two of the attributes and saves). */
function earnsVoid(lines: readonly string[]): boolean {
  const keys = new Set(lines.flatMap((l) => [...l.matchAll(PAIR)].map((m) => normalizeStatKey(m[1]))))
  return ['STR', 'STA', 'INT', 'AGI', 'DEX', 'CHA', 'WIS', 'SV_FIRE', 'SV_COLD', 'SV_POISON', 'SV_MAGIC', 'SV_DISEASE'].filter((k) => keys.has(k)).length >= 2
}

const ACCURACY = /(^|\s+)Accuracy: \+?([\d.]+)%/

/**
 * A weapon's Accuracy is the upgrade's own when some state gives exactly it (2.5% a tier on the merge
 * curve, none at +0: itemUpgrade.ts `weaponAccuracy`, read off the game): those states are the window's.
 * A value no state gives is the item's own and stays.
 */
function byAccuracy(lines: readonly string[], states: readonly ItemUpgradeState[]): { states: readonly ItemUpgradeState[]; own: boolean; note?: string } {
  const weapon = lines.some((l) => /(^|\s)DMG: \d/.test(l))
  const m = weapon ? lines.map((l) => ACCURACY.exec(l)).find((x) => x !== null) : undefined
  if (m === undefined || m === null || states[0].full === 0) return { states, own: false }
  const fit = states.filter((s) => weaponAccuracy(s) === Number(m[2]))
  if (fit.length > 0) return { states: fit, own: true }
  return { states, own: false, note: `Accuracy +${m[2]}% is not what the upgrade gives at +${String(states[0].full)}: kept as the item's own; check it.` }
}

/** The states in which every number has a base; all of them when none explains them all (a misread). */
function jointStates(reads: readonly Read[], states: readonly ItemUpgradeState[]): readonly ItemUpgradeState[] {
  const fit = states.filter((s) => reads.every((r) => basesAt(r.rule, Number(r.num), s, r.tenths).length > 0))
  return fit.length === 0 ? states : fit
}

/** One number's +0 values over the states left, best known first. */
function basesOver(r: Read, states: readonly ItemUpgradeState[]): number[] {
  const all = new Set<number>()
  for (const s of states) for (const b of basesAt(r.rule, Number(r.num), s, r.tenths)) all.add(b)
  return [...all].sort((a, b) => a - b)
}

const shown = (b: number, r: Read): string => (r.tenths ? b.toFixed(1) : `${r.num.startsWith('+') && b > 0 ? '+' : ''}${String(b)}`)

/** Why a number is left for the player, in words. */
function leftNote(r: Read, bases: readonly number[], tier: number): string {
  const read = `${r.key.trim()} ${r.num}${r.pct} at +${String(tier)}`
  if (bases.length === 0) return `${read}: no +0 value gives it (a misread?): fill it from the item at +0.`
  const list = bases.length <= 4 ? bases.map((b) => shown(b, r)).join(', ') : `${shown(bases[0], r)} to ${shown(bases[bases.length - 1], r)}`
  return `${read}: any of ${list} at +0 gives it, so it is left as ? for you to fill.`
}

/** One line back to +0: each number its one base, else `?` and a note. */
function lineBack(line: string, states: readonly ItemUpgradeState[], tier: number, out: { inexact: string[]; notes: string[] }): string {
  return line.replace(PAIR, (whole, key: string, num: string, pct: string) => {
    const r = readsOf(whole)[0]
    if (r === undefined) return whole
    const bases = basesOver(r, states)
    if (bases.length === 1) return `${key}: ${shown(bases[0], r)}${pct}`
    out.inexact.push(`${key.trim()}: ${num}${pct}`)
    out.notes.push(leftNote(r, bases, tier))
    return `${key}: ?`
  })
}

const escaped = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** What the state came to, for the player: the merge progress read, worked out, or open. */
function stateNote(states: readonly ItemUpgradeState[], tier: number, fraction: number | undefined): string[] {
  if (tier >= ITEM_MAX_TIER || states.length === 0) return []
  const y = String(2 ** tier)
  if (fraction !== undefined && states.length === 1) return [`Merge progress ${String(fraction)}/${y} from the Tier bar.`]
  if (states.length === 1) return [`Merge progress worked out from the numbers: ${String(states[0].fraction)}/${y}.`]
  return []
}

/**
 * The `+N` window's statsblock at +0 (D3). `fraction`: the merge progress the Tier bar showed (`16` of
 * `Tier 5  16/32`), when it was read.
 */
export function delevel(statsblock: string, tier: number, fraction?: number): Delevel {
  const lines = statsblock.split('\n').map((l) => l.replace(/<br>$/, ''))
  const full = statesAt(tier)[0].full
  // The upgrade's own SV VOID is +full exactly; a native one scales past it (itemUpgrade.ts). An SV VOID
  // of exactly the tier is the upgrade's whatever else the item states (owner, 2026-10-24: Bloodsoaked
  // Gauntlets +1, only AC HP MANA END, read SV VOID 1).
  const voidLine = new RegExp(`(^|\\s)SV VOID: \\+${String(full)}(?=\\s|$)`)
  const synthetic = full > 0 && (earnsVoid(lines) || lines.some((l) => voidLine.test(l)))
  const acc = byAccuracy(lines, statesAt(tier, fraction))
  const kept = lines.map((l) => (acc.own ? l.replace(ACCURACY, '') : l)).map((l) => (synthetic ? l.replace(voidLine, '') : l).trim())
  const states = jointStates(kept.flatMap(readsOf), acc.states)
  const out = { inexact: [] as string[], notes: [] as string[] }
  const back = kept.map((l) => lineBack(l, states, full, out))
  const block = back
    .map((l, i) => (lines[i] === '' ? '' : l === '' ? null : `${l}<br>`))
    .filter((l): l is string => l !== null)
    .join('\n')
  const missed = roundTripMisses(block, kept.join('\n'), states)
  // A number the forward rules do not give back is the player's too (a key read as another's rule).
  const proven = missed.reduce((b, label) => b.replace(new RegExp(`(^|\\s)(${escaped(label)}):\\s*[+-]?\\d+(?:\\.\\d+)?%?`, 'g'), '$1$2: ?'), block)
  const notes = [...stateNote(states, full, fraction), ...(acc.note === undefined ? [] : [acc.note]), ...out.notes, ...missed.map((k) => `${k}: the +0 value does not scale back to the window's number: check it.`)]
  return { block: proven, exact: out.inexact.length === 0 && missed.length === 0, inexact: [...out.inexact, ...missed], notes }
}

/** The Tier bar beside Merge Item: `Tier 5  16/32` (OCR: `Tier5 16/32`, `Tier0 0/1`); at the cap `Tier: 10/10`. */
const TIER_BAR = /\bTier\W{0,2}\s*(\d{1,2})\s+(\d{1,4})\s*\/\s*(\d{1,4})\b/i

/**
 * The merge progress the window's Tier bar shows, when its numbers hold together: its tier the name's,
 * its `y` that tier's `2^N` and its `x` below it. A bar that does not is not used, and the player is told.
 */
export function tierBarFraction(lines: readonly string[], tier: number): { fraction?: number; note?: string } {
  const m = lines.map((l) => TIER_BAR.exec(l)).find((x) => x !== null)
  if (m === undefined || m === null || tier <= 0 || tier >= ITEM_MAX_TIER) return {}
  const [n, x, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (n === tier && y === 2 ** tier && x < y) return { fraction: x }
  return { note: `The Tier bar read "${m[0]}", which does not fit +${String(tier)} (Tier ${String(tier)} counts to ${String(2 ** tier)}): every merge progress was tried.` }
}
