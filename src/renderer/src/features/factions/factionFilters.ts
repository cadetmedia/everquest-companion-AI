// factions/factionFilters.ts — the work panel's class and slot filters, and the wishlist join.
// PURE (no React, no IPC), node-testable — the factionQuests.ts arrangement.
//
// THE CLASS TOKENS ARE WIKI PROSE, NOT A VOCABULARY (measured across the committed catalog,
// 2026-09-05): clean full names dominate ("Warrior" ×91, "Cleric" ×102), but the long tail holds
// every spelling a wiki editor ever chose — "Shadow Knight" / "Shadowknight" / "SK" / "SHD",
// three-letter "War"/"Cle"/"Pal", abbr runs in one cell ("WAR PAL RNG SHD BRD ROG"), and prose
// nobody can filter on ("?", "Melee", "All except INT casters", "All (Iksar Non-Caster)").
//
// SO THE FILTER IS INCLUSIVE ON AMBIGUITY, and that is the load-bearing decision: a quest whose
// tokens ALL resolve to real classes is filterable and hides honestly; a quest carrying anything
// this table cannot read is OPEN — it matches every class selection — because hiding a maybe
// hides real work, while showing one costs a glance. "All"/"Any" are the common open spellings
// and just the readable case of the same rule.
//
// THE SLOT FILTER reads the gear index (which knows every equippable's slots); its 'ANY' value
// deliberately includes quests with NO gear rewards at all — the filter narrows only when a slot
// is actually chosen, so the default view never hides faction work over a reward's category.

import type { ClassAbbr } from '@shared/classCombo'
import type { EquipSlot } from '@shared/planner/types'
// RELATIVE value import — the node-testable-logic rule (gearOwnership.ts's header): the `@shared`
// alias is vite's and only type imports (which erase) may use it in a module a node test drives.
import { ownershipKey } from '../../../../shared/planner/ownership'
import { isCleanQuest } from './factionCare'
import type { FactionQuestRef, FactionWork } from './factionQuests'

/** Every spelling of a class the catalog has been measured to use, folded to the model's abbr. */
const TOKEN_TO_ABBR: Readonly<Record<string, ClassAbbr>> = {
  bard: 'BRD',
  brd: 'BRD',
  beastlord: 'BST',
  bst: 'BST',
  berserker: 'BER',
  ber: 'BER',
  cleric: 'CLR',
  cle: 'CLR',
  clr: 'CLR',
  druid: 'DRU',
  dru: 'DRU',
  enchanter: 'ENC',
  enc: 'ENC',
  magician: 'MAG',
  mag: 'MAG',
  monk: 'MNK',
  mnk: 'MNK',
  necromancer: 'NEC',
  nec: 'NEC',
  paladin: 'PAL',
  pal: 'PAL',
  ranger: 'RNG',
  rng: 'RNG',
  rogue: 'ROG',
  rog: 'ROG',
  'shadow knight': 'SHD',
  shadowknight: 'SHD',
  sk: 'SHD',
  shd: 'SHD',
  shaman: 'SHM',
  shm: 'SHM',
  warrior: 'WAR',
  war: 'WAR',
  wizard: 'WIZ',
  wiz: 'WIZ'
}

/** One token's classes, or null when it is not a clean class spelling (⇒ the quest goes OPEN). */
function tokenAbbrs(token: string): ClassAbbr[] | null {
  const t = token.trim().toLowerCase()
  const direct = TOKEN_TO_ABBR[t]
  if (direct !== undefined) return [direct]
  // An abbr RUN in one cell ("WAR PAL RNG SHD BRD ROG"): every word must resolve or none do.
  const words = t.split(/\s+/)
  if (words.length < 2) return null
  const out: ClassAbbr[] = []
  for (const w of words) {
    const a = TOKEN_TO_ABBR[w]
    if (a === undefined) return null
    out.push(a)
  }
  return out
}

/**
 * The classes a quest is FOR, or null when it is open to any selection — either stated openly
 * ("All", "Any") or stated in words this table cannot read (the header's inclusive rule).
 */
export function questClassAbbrs(classes: readonly string[] | undefined): Set<ClassAbbr> | null {
  if (classes === undefined || classes.length === 0) return null
  const out = new Set<ClassAbbr>()
  for (const token of classes) {
    const abbrs = tokenAbbrs(token)
    if (abbrs === null) return null
    for (const a of abbrs) out.add(a)
  }
  return out.size === 0 ? null : out
}

/** The slot filter's whole domain: a real slot, or the default that filters nothing. */
export type SlotFilter = EquipSlot | 'ANY'

export interface WorkFilters {
  /** empty = any class */
  classes: readonly ClassAbbr[]
  slot: SlotFilter
  /** only the pure DONATION quests: a stated coin turn-in and no items to collect at all */
  coinOnly: boolean
  /**
   * The EFFECTIVE search inside one faction's work, lowercased — '' when the panel should show
   * everything. The caller (factionDerive.deriveRows) blanks it for a faction whose NAME matched
   * the search, which is the user's own rule: a name hit shows the whole faction, anything else
   * narrows the quests to the ones that carried the match.
   */
  query: string
  /**
   * Search REWARDS only: "soulfire" then finds the quest that GRANTS SoulFire — the chain's
   * final step — instead of every quest that consumes one as a turn-in.
   */
  rewardsOnly: boolean
  /**
   * Only the quests whose stated losses all land on DON'T-CARE factions (factionCare.ts) — the
   * find-an-easy-raise reading (owner ask, 2026-10-12). Narrows the raising list and drops the
   * home-zone candidates, whose pages state no receipt to judge.
   */
  cleanOnly: boolean
  /** the don't-care marks, as `factionNameKey`s — read only while `cleanOnly` */
  dontCare: ReadonlySet<string>
}

/** Is any narrowing actually selected? The QUERY is deliberately not counted: it already decides
 *  row visibility through the search haystack, and a name-matched faction with no work must not
 *  vanish for having none. */
export function filtersActive(f: WorkFilters): boolean {
  return f.classes.length > 0 || f.slot !== 'ANY' || f.coinOnly || f.cleanOnly
}

/** The gold-only reading: money changes hands and nothing has to be farmed first. */
function matchesCoinOnly(ref: FactionQuestRef, on: boolean): boolean {
  return !on || (ref.coin !== undefined && ref.items.length === 0)
}

/** Does one quest carry the search — everywhere, or (rewards-only) in what it GRANTS? */
function matchesQuery(ref: FactionQuestRef, q: string, rewardsOnly: boolean): boolean {
  if (q === '') return true
  for (const n of ref.rewards) if (n.toLowerCase().includes(q)) return true
  if (rewardsOnly) return false
  if (ref.name.toLowerCase().includes(q)) return true
  if (ref.giver?.toLowerCase().includes(q) === true) return true
  if (ref.startZone?.toLowerCase().includes(q) === true) return true
  for (const n of ref.items) if (n.toLowerCase().includes(q)) return true
  return false
}

function matchesClasses(ref: FactionQuestRef, selected: readonly ClassAbbr[]): boolean {
  if (selected.length === 0) return true
  const set = questClassAbbrs(ref.classes)
  if (set === null) return true
  return selected.some((c) => set.has(c))
}

/** The reward-name fold — the wiki's trailing `*` off, then the corpus's own key. */
export function rewardKey(name: string): string {
  return ownershipKey(name.replace(/\*+$/, '').trim())
}

function matchesSlot(
  ref: FactionQuestRef,
  slot: SlotFilter,
  slotsByKey: ReadonlyMap<string, readonly EquipSlot[]>
): boolean {
  if (slot === 'ANY') return true
  for (const n of ref.rewards) {
    if (slotsByKey.get(rewardKey(n))?.includes(slot) === true) return true
  }
  return false
}

/**
 * One faction's work, narrowed. The RAISE and NEARBY lists take both filters (they are the
 * reward hunt); the LOWER list takes only the class filter — a cost you cannot incur is noise,
 * but a cost is a cost whatever slot its rewards fill.
 */
export function filterWork(
  work: FactionWork,
  f: WorkFilters,
  slotsByKey: ReadonlyMap<string, readonly EquipSlot[]>
): FactionWork {
  const hunts = (q: FactionQuestRef): boolean =>
    matchesQuery(q, f.query, f.rewardsOnly) &&
    matchesClasses(q, f.classes) &&
    matchesSlot(q, f.slot, slotsByKey) &&
    matchesCoinOnly(q, f.coinOnly)
  return {
    raise: work.raise.filter((q) => hunts(q) && (!f.cleanOnly || isCleanQuest(q, f.dontCare))),
    // The LOWER list takes the query, the class filter and the gold-only reading, never the
    // slot: a cost is a cost whatever slot its rewards fill — but a search for an item must
    // narrow it like the rest (the Pestilence Scythe report), and a donation hunt has no use
    // for costs that demand farmed items.
    lower: work.lower.filter(
      (q) =>
        matchesQuery(q, f.query, f.rewardsOnly) &&
        matchesClasses(q, f.classes) &&
        matchesCoinOnly(q, f.coinOnly)
    ),
    ...(work.homeZone === undefined ? {} : { homeZone: work.homeZone }),
    // Silence is not a receipt: the clean reading has nothing to judge a candidate by.
    nearby: f.cleanOnly ? [] : work.nearby.filter(hunts)
  }
}

/** The distinct wished reward names a work list grants (raising AND home-zone quests — a wished
 *  item is worth shouting about whichever page failed to quote its receipt). */
export function wishedRewards(work: FactionWork, wishKeys: ReadonlySet<string>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const q of [...work.raise, ...work.nearby]) {
    for (const n of q.rewards) {
      const key = rewardKey(n)
      if (seen.has(key) || !wishKeys.has(key)) continue
      seen.add(key)
      out.push(n.replace(/\*+$/, '').trim())
    }
  }
  return out
}
