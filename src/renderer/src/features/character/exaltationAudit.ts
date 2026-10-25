// character/exaltationAudit.ts — THE EXALTATION CLEANUP ADVISOR (fork ask, kaltinril 2026-09-09:
// "if I have Burning Affliction I and II, it should tell me to get rid of I. If I have 2 of the
// same, tell me to get rid of one" - and the items are class-specific).
//
// PURE AND NODE-TESTED (tests/exaltationAudit.test.mts), the slotSockets.ts posture: relative
// value imports, no React, no IPC. It WRITES nothing and destroys nothing - every line it
// produces is advice over two things the app already holds, the inventory dump's own
// `(Exaltation)` rows and the committed gear index's effect table. The player does the deciding.
//
// TWO KINDS OF FINDING, EACH WITH ITS HONESTY CLAUSE:
//
//   DUPLICATES - more copies of one exaltation than the dump shows socketed. Reported as counts,
//   never as "get rid of it": a loose second copy may be waiting for the offhand (the user's own
//   Blood Fire pair is exactly that), so the row states copies / socketed / loose and stops.
//
//   SUPERSEDED TIERS - a ranked effect (Burning Affliction I) owned while a higher tier of the
//   SAME family (Burning Affliction III) is also owned on a donor the character's classes can
//   use. The class gate runs on the BETTER copy: an unusable higher tier supersedes nothing,
//   which is the "items are class-specific" half of the ask. Rank comes from the corpus's own
//   focus parse (`GearEffect.family`/`familyTier`) with a roman-numeral fallback for the effect
//   kinds that parse never covered - the fallback reads only a trailing I..X off the effect name,
//   the exact spelling the wiki uses for every ranked line.

import type { ClassAbbr } from '../../../../shared/classCombo'
import type { GearRow } from '../../../../shared/planner/gear'
import type { OwnedExaltation } from '../../../../shared/characterSheet'
import { socketTypeOf } from '../../../../shared/planner/normalize'
import { unusableReasons } from '../../../../shared/planner/usability'

/** One exaltation owned in more copies than are socketed — stated, never commanded. */
export interface DuplicateFinding {
  name: string
  copies: number
  socketed: number
  wheres: string[]
}

/** One owned tier of a ranked effect that a better owned-and-usable tier makes redundant. */
export interface SupersededFinding {
  /** the redundant gem's donor name */
  name: string
  /** the ranked effect it carries, as the corpus spells it */
  effect: string
  tier: number
  /** the donor that makes it redundant, and that donor's tier of the same family */
  betterName: string
  betterEffect: string
  betterTier: number
  /** every place the redundant copy sits */
  wheres: string[]
  /** true when at least one redundant copy is currently socketed in worn gear */
  socketed: boolean
}

export interface ExaltationAudit {
  duplicates: DuplicateFinding[]
  superseded: SupersededFinding[]
}

/** A ranked effect off a gear row: the family it belongs to and where in the ladder it sits. */
interface RankedEffect {
  family: string
  tier: number
  effect: string
}

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 }

/**
 * Every ranked effect a row states. The corpus's focus parse is preferred where it ran
 * (`family`/`familyTier`); the trailing-roman fallback covers the worn/click/proc lines it never
 * touches. An unranked effect contributes nothing — a family of one can supersede nothing.
 */
export function rankedEffects(row: GearRow): RankedEffect[] {
  const out: RankedEffect[] = []
  for (const e of row.effects) {
    if (e.family !== undefined && e.familyTier !== undefined) {
      out.push({ family: e.family.toLowerCase(), tier: e.familyTier, effect: e.name })
      continue
    }
    const m = /^(.+?)\s+([IVX]+)$/.exec(e.name.trim())
    const tier = m ? ROMAN[m[2]] : undefined
    if (m && tier !== undefined) out.push({ family: m[1].toLowerCase(), tier, effect: e.name })
  }
  return out
}

/**
 * WHO THIS CHARACTER IS, for the three engines that ask — bundled rather than passed loose because
 * deity arrived as R2's FOURTH condition (owner report 2026-09-11) and `recommendSockets`,
 * `planBoard` and `auditExaltations` were all already at the measured four-parameter ceiling.
 * A second scalar would have widened three signatures; one noun keeps them and reads better.
 */
export interface Loadout {
  classes: readonly ClassAbbr[]
  /** the FOLDED deity key (`planner/deity.deityKey`), or null when nothing has stated one */
  deity: string | null
}

/**
 * Can this character use the donor at all? CLASS and DEITY, the two halves that are about WHO YOU
 * ARE rather than about the seat (`socketRecommend.seatFits` owns slot and host-class).
 *
 * Every unknown passes, and they are four different unknowns with one answer (law 1): an item
 * stating no class, a loadout with no class chosen, an item stating no deity, and a character
 * whose deity nothing has told us. `planner/deity.deityFits` argues the last two.
 */
export function usable(row: GearRow, loadout: Loadout): boolean {
  // The Exaltations browser's marks read the same rule with its reasons (`planner/usability.ts`).
  // Level stays unchecked here, as it always was: the board's question is class and deity only.
  const who = { classes: loadout.classes, deity: loadout.deity, level: null }
  return unusableReasons({ classes: row.classes, deities: row.deities }, who).length === 0
}

/** One effect ranked for comparison — an UNRANKED effect keeps tier 0: socketable, never "better". */
export interface KindEffect {
  family: string
  tier: number
  effect: string
  detail?: string
}

/**
 * The donor's best effect FOR ONE SOCKET TYPE — the effect the gem grants when it sits in that
 * socket (the JOS-452 numbering read forward: a gem in the Proc socket gives its combat line).
 * Null when the corpus row states no effect of that kind, or the corpus does not know the donor.
 */
export function bestEffectFor(row: GearRow | undefined, type: string): KindEffect | null {
  if (row === undefined) return null
  const want = type.toLowerCase()
  let best: KindEffect | null = null
  for (const e of row.effects) {
    if (socketTypeOf(e.kind) !== want) continue
    const k = kindEffectOf(e)
    if (best === null || k.tier > best.tier) best = k
  }
  return best
}

/** One effect line as a comparable: the corpus rank first, the roman fallback, tier 0 last. */
function kindEffectOf(e: GearRow['effects'][number]): KindEffect {
  const ranked =
    e.family !== undefined && e.familyTier !== undefined
      ? { family: e.family.toLowerCase(), tier: e.familyTier }
      : romanRank(e.name)
  return {
    family: ranked?.family ?? e.name.trim().toLowerCase(),
    tier: ranked?.tier ?? 0,
    effect: e.name,
    ...(e.detail === undefined ? {} : { detail: e.detail })
  }
}

function romanRank(name: string): { family: string; tier: number } | null {
  const m = /^(.+?)\s+([IVX]+)$/.exec(name.trim())
  const tier = m ? ROMAN[m[2]] : undefined
  return m && tier !== undefined ? { family: m[1].toLowerCase(), tier } : null
}

/** The audit's own copy shape — the `.map` projection out of the domain type (ruling 4's
 *  sanctioned escape), so every fold below runs on feature-local rows. */
interface ExaltCopy {
  name: string
  key: string
  where: string
  socketed: boolean
}

/** The copies of one key, folded: every place, and how many are socketed. */
interface KeyGroup {
  name: string
  copies: ExaltCopy[]
}

function byKey(owned: readonly ExaltCopy[]): Map<string, KeyGroup> {
  const out = new Map<string, KeyGroup>()
  for (const o of owned) {
    const held = out.get(o.key)
    if (held) held.copies.push(o)
    else out.set(o.key, { name: o.name, copies: [o] })
  }
  return out
}

function duplicateFindings(groups: Map<string, KeyGroup>): DuplicateFinding[] {
  const out: DuplicateFinding[] = []
  for (const g of groups.values()) {
    if (g.copies.length < 2) continue
    out.push({
      name: g.name,
      copies: g.copies.length,
      socketed: g.copies.filter((c) => c.socketed).length,
      wheres: g.copies.map((c) => c.where)
    })
  }
  return out.sort((a, b) => b.copies - a.copies)
}

/** One family's owned holders: rows that carry the family, with the tier each carries. */
interface Holder {
  key: string
  name: string
  tier: number
  effect: string
  usable: boolean
}

function supersededFindings(
  groups: Map<string, KeyGroup>,
  rowByKey: ReadonlyMap<string, GearRow>,
  loadout: Loadout
): SupersededFinding[] {
  const families = new Map<string, Holder[]>()
  for (const [key, g] of groups) {
    const row = rowByKey.get(key)
    if (!row) continue
    for (const r of rankedEffects(row)) {
      const holder: Holder = { key, name: g.name, tier: r.tier, effect: r.effect, usable: usable(row, loadout) }
      const held = families.get(r.family)
      if (held) held.push(holder)
      else families.set(r.family, [holder])
    }
  }
  const out: SupersededFinding[] = []
  for (const holders of families.values()) {
    const best = holders.filter((h) => h.usable).sort((a, b) => b.tier - a.tier)[0]
    if (best === undefined) continue
    for (const h of holders) {
      if (h.tier >= best.tier || h.key === best.key) continue
      const copies = groups.get(h.key)?.copies ?? []
      out.push({
        name: h.name,
        effect: h.effect,
        tier: h.tier,
        betterName: best.name,
        betterEffect: best.effect,
        betterTier: best.tier,
        wheres: copies.map((c) => c.where),
        socketed: copies.some((c) => c.socketed)
      })
    }
  }
  return out.sort((a, b) => b.betterTier - b.tier - (a.betterTier - a.tier))
}

/**
 * The whole audit: the dump's exaltation rows against the gear index, through the class gate.
 * `rows` is the served gear index; a refused or empty index yields only the duplicate half,
 * because tiers are a corpus fact and the corpus is not there to state them.
 */
export function auditExaltations(
  owned: readonly OwnedExaltation[],
  rows: readonly GearRow[],
  loadout: Loadout
): ExaltationAudit {
  // The one projection out of the domain shape (ruling 4): every fold below is feature-local.
  const copies = owned.map(
    (o): ExaltCopy => ({ name: o.name, key: o.key, where: o.where, socketed: o.socketed })
  )
  const groups = byKey(copies)
  const rowByKey = new Map(rows.map((r) => [r.key, r]))
  return {
    duplicates: duplicateFindings(groups),
    superseded: supersededFindings(groups, rowByKey, loadout)
  }
}
