// itemDelevel.ts — a `+N` item window's statsblock taken back to +0 with the planner's own upgrade
// rule (itemUpgrade.ts, ported from the wiki's ItemLevelSlider), only where the rule inverts exactly.
// Owner, 2026-10-21 (D3): "can't we use that same function/logic to 'delevel' an item to +0? If not,
// just warn." A window of a +N item shows the +N numbers; the wiki's page is the base item. So:
//   - every number on the block is run back through the forward rule: the one base value that gives
//     the read value at that state, over every merge fraction the window could hold when the tier is
//     below the cap (the name states the tier and stops; itemUpgrade.ts `upgradeStateForTier`);
//   - a line with no number to scale (Skill, Class, flags) or a key the rule leaves alone is copied;
//   - the synthetic `SV VOID: +N` an upgrade grants is dropped when the block earns it;
//   - when any number has none or several bases (Weight's ceiling maps many to one), there is no
//     estimate, only the list of what could not be taken back. Never a +N number as a base one.

import { normalizeStatKey, scaleDamage, scaleFlat, scalePrimary, scaleWeight, upgradeStatClass, type ItemUpgradeState } from './itemUpgrade'
import { ITEM_MAX_TIER } from './itemStats'

export interface Delevel {
  /** The +0 statsblock, when every number inverts to exactly one base. */
  block?: string
  /** The lines whose base is not one number (`WT: 0.4`), when there is no block. */
  inexact: string[]
}

/** The states the window can be in: the tier is read, the merge fraction is not (none at the cap). */
function statesAt(tier: number): ItemUpgradeState[] {
  const full = Math.min(ITEM_MAX_TIER, Math.max(0, tier))
  const fractions = full >= ITEM_MAX_TIER ? 1 : 2 ** full
  return Array.from({ length: fractions }, (_, fraction) => ({ full, fraction }))
}

type Rule = (base: number, s: ItemUpgradeState) => number

const RULES: Partial<Record<ReturnType<typeof upgradeStatClass>, Rule>> = { primary: scalePrimary, flat: scaleFlat, damage: scaleDamage, weight: scaleWeight }

/** Every base the rule takes to `read` at some state: whole numbers, or tenths for Weight. */
function basesOf(rule: Rule, read: number, states: readonly ItemUpgradeState[], tenths: boolean): number[] {
  const step = tenths ? 0.1 : 1
  // A positive value comes from a positive base (every rule keeps a base's sign); a penalty only shrinks.
  const lo = read > 0 ? step : read - 300 * step
  const hi = Math.max(read, 0) * (tenths ? 12 : 1) + step
  const found = new Set<number>()
  for (let i = Math.round(lo / step); i * step <= hi; i++) {
    const b = Number((i * step).toFixed(tenths ? 1 : 0))
    if (states.some((s) => rule(b, s) === read)) found.add(b)
  }
  return [...found]
}

/** `KEY: number` as the statsblock writes it; a two-word key only with its known first word (`SV MAGIC`, `HP Regen`). */
const PAIR = /(?<![A-Za-z])((?:(?:SV|HP|Mana|End|Atk|Dmg|Bane|Heal|Spell|Damage|Combat|Stun|DoT) )?[A-Za-z]+):\s*([+-]?\d+(?:\.\d+)?)(%?)/g

/** One line back to +0, or the reason it cannot be. */
function lineBack(line: string, states: readonly ItemUpgradeState[], inexact: string[]): string {
  return line.replace(PAIR, (whole, key: string, num: string, pct: string) => {
    const cls = upgradeStatClass(key)
    const rule = RULES[cls]
    if (rule === undefined) return whole
    const bases = basesOf(rule, Number(num), states, cls === 'weight')
    if (bases.length !== 1) {
      inexact.push(`${key.trim()}: ${num}${pct}`)
      return whole
    }
    const b = bases[0]
    const text = cls === 'weight' ? b.toFixed(1) : `${num.startsWith('+') && b > 0 ? '+' : ''}${String(b)}`
    return `${key}: ${text}${pct}`
  })
}

/** Whether the block earns the upgrade's synthetic SV VOID (two of the attributes and saves). */
function earnsVoid(lines: readonly string[]): boolean {
  const keys = new Set(lines.flatMap((l) => [...l.matchAll(PAIR)].map((m) => normalizeStatKey(m[1]))))
  return ['STR', 'STA', 'INT', 'AGI', 'DEX', 'CHA', 'WIS', 'SV_FIRE', 'SV_COLD', 'SV_POISON', 'SV_MAGIC', 'SV_DISEASE'].filter((k) => keys.has(k)).length >= 2
}

/** The `+N` window's statsblock at +0, or what kept it from one (D3). */
export function delevel(statsblock: string, tier: number): Delevel {
  const states = statesAt(tier)
  const full = states[0].full
  const lines = statsblock.split('\n').map((l) => l.replace(/<br>$/, ''))
  const inexact: string[] = []
  // The upgrade's own SV VOID is +full exactly; a native one scales past it (itemUpgrade.ts).
  const voidLine = new RegExp(`(^|\\s)SV VOID: \\+${String(full)}(?=\\s|$)`)
  const synthetic = full > 0 && earnsVoid(lines)
  const back = lines.map((l) => lineBack(synthetic ? l.replace(voidLine, '').trim() : l, states, inexact))
  if (inexact.length > 0) return { inexact }
  const block = back.map((l, i) => (lines[i] === '' ? '' : l === '' ? null : `${l}<br>`)).filter((l): l is string => l !== null)
  return { block: block.join('\n'), inexact }
}
