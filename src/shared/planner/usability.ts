// planner/usability.ts — CAN THIS CHARACTER USE IT, AND IF NOT, WHY (owner, 2026-10-25: "mark the
// items they can't wear somehow so they know they can't wear it because of race or class or deity
// or whatever").
//
// ONE RULE, READ BY EVERY SURFACE THAT ASKS. The Character tab's socket advice asked "is this donor
// usable" as a yes/no (`exaltationAudit.usable`, class and deity); the Exaltations browser needs
// the same question answered with its REASONS, so a row can say which restriction it failed. The
// yes/no is now this list being empty, so the two can never disagree.
//
// EVERY UNKNOWN PASSES (law 1), and each is a different unknown with one answer: an item stating no
// class, a browse with no class chosen, an item stating no deity, a character whose deity nothing
// has stated (`deity.deityFits` argues both), an effect stating no level, and a character whose
// level the log has not stated yet. Unknown is never "can't".
//
// RACE IS NOT HERE, and that is measured rather than forgotten. Nothing in the app records the
// character's race (the `/who` row's race is parsed and never folded), and the items carry almost
// no race rule to check: measured 2026-10-25, 1,210 of the 1,587 donor rows have a gear row, 1,209
// of those state `ALL` and one the truncated `ALL EXCEPT` (`rules.ts` carries the race argument).

import type { ClassAbbr } from '../classCombo'
import { deityFits } from './deity'

/** Which restriction a character fails. One entry per restriction, in this order. */
export type UnusableKind = 'class' | 'deity' | 'level'

export interface UnusableReason {
  kind: UnusableKind
  /** the chip's short word: `class`, `deity`, `level 45` */
  label: string
  /** the sentence behind it, naming the item's rule and the character's own answer */
  why: string
}

/** WHO is asking. Every field may be unknown, and an unknown checks nothing. */
export interface Wearer {
  /** the classes the browse is for; `[]` = no class chosen */
  classes: readonly ClassAbbr[]
  /** the FOLDED deity key (`deity.deityKey`), or null when nothing has stated one */
  deity: string | null
  /** the level the log last stated, or null when it never has */
  level: number | null
}

/** What an item states about who may use it. A `PlannerDonor` and a `GearRow` both satisfy it. */
export interface Restricted {
  /** `[]` = the page stated none (unknown, never "nobody") */
  classes: readonly ClassAbbr[]
  /** folded deity keys; absent or `[]` = no deity restriction */
  deities?: readonly string[]
  /** the effect's `Req Level` (`at Level N`); absent when the page stated none */
  reqLevel?: number
}

/** `CAZIC THULE` → `Cazic Thule`: the folded key spelled for a sentence. */
export function deityName(key: string): string {
  return key
    .toLowerCase()
    .split(' ')
    .map((w) => (w === '' ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ')
}

function classReason(item: Restricted, who: Wearer): UnusableReason | null {
  if (item.classes.length === 0 || who.classes.length === 0) return null
  if (item.classes.some((c) => who.classes.includes(c))) return null
  return {
    kind: 'class',
    label: 'class',
    why: `Only ${item.classes.join(', ')} can use it - you are ${who.classes.join(', ')}.`
  }
}

function deityReason(item: Restricted, who: Wearer): UnusableReason | null {
  const deities = item.deities ?? []
  if (deityFits(deities, who.deity) || who.deity === null) return null
  return {
    kind: 'deity',
    label: 'deity',
    why: `Only followers of ${deities.map(deityName).join(', ')} can use it - you follow ${deityName(who.deity)}.`
  }
}

function levelReason(item: Restricted, who: Wearer): UnusableReason | null {
  if (item.reqLevel === undefined || who.level === null || who.level >= item.reqLevel) return null
  const req = String(item.reqLevel)
  return {
    kind: 'level',
    label: `level ${req}`,
    why: `Its effect needs level ${req} - you are level ${String(who.level)}.`
  }
}

/**
 * Every restriction this character fails, in a fixed order (class, deity, level); `[]` when the
 * item is usable or nothing known says otherwise. Shows ALL that apply, so a row can name each.
 */
export function unusableReasons(item: Restricted, who: Wearer): UnusableReason[] {
  const out: UnusableReason[] = []
  for (const reason of [classReason(item, who), deityReason(item, who), levelReason(item, who)]) {
    if (reason !== null) out.push(reason)
  }
  return out
}

/** The chip's whole text: `can't use: deity, level 45`. */
export function unusableLabel(reasons: readonly UnusableReason[]): string {
  return `can't use: ${reasons.map((r) => r.label).join(', ')}`
}
