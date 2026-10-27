// planner/focusBenefit.ts — WHO A FOCUS EXALTATION CAN HELP (Malkil via the owner, 2026-10-26: "it
// should only recommend instrument exaltations if BRD is in the current loadout"; owner: "only
// recommend exaltations that would actually be able to benefit you").
//
// Read from the committed spell list, where every focus is a spell row of its own with its limits
// ("Limit Effect: Summon Skeleton Pet", "Limit Type: Detrimental"). Three rules, each one the row's
// own statement, and NOTHING where no rule applies (law 1: an unknown helps anyone):
//
//   STATED CLASS - the row names its classes as codes ("BRD" on every Resonance row; their effect
//     line reads "bard songs"). A tier missing from the list takes its family's rows.
//   PET LIMIT - "Limit Effect: Summon Skeleton Pet" / "Summon Pet", or a "Pet Power Increase" line:
//     only classes with such a spell. The list writes most skeleton summons as "Summon Pet: Level N
//     Skeletal Pet", so the pet's name marks them (measured 2026-10-26: NEC and SHD only).
//   SPELL FOCUS - any other row with a Limit line changes spells you cast: only classes with a spell
//     in the list (BER, MNK and WAR have none, spellClasses.ts).
//
// NOT CHECKED, and so never claimed: the spell kind a limit names (detrimental, a duration, a heal),
// and the character's level (a level-20 shaman has no pet yet). Each would need the spell list's
// effect text read as a category, and a wrong read would hide a gem that does help.

import type { ClassAbbr } from '../../shared/classCombo'
import { isClassAbbr } from '../../shared/classCombo'
import type { FocusBenefit } from '../../shared/planner/gear'
import { parseFocusEffect } from '../../shared/planner/normalize'
import type { SpellEntry } from '../../shared/types'
import { parseSpellClassString } from '../data/spellClasses'
import { applySpellCorrections } from '../data/spellCorrections'
import { applySpellRemovals } from '../data/spellRemovals'
import spellsJson from '../data/spells.json'
import type { SpellDbFile } from '../../shared/types'

/** What the castable spell list says each class can do, for the pet and spell rules. */
interface ClassPowers {
  casters: Set<ClassAbbr>
  pets: Set<ClassAbbr>
  skeletons: Set<ClassAbbr>
}

const SKELETON_SUMMON = /^Summon Skeleton Pet\b|^Summon Pet:.*\bskelet(al|on)\b/i
const ANY_SUMMON = /^Summon (\w+ )?Pet\b/i

function classPowers(spells: readonly SpellEntry[]): ClassPowers {
  const out: ClassPowers = { casters: new Set(), pets: new Set(), skeletons: new Set() }
  for (const s of spells) {
    const classes = parseSpellClassString(s.classes)
    const effects = s.effects ?? []
    const pet = effects.some((e) => ANY_SUMMON.test(e))
    const skeleton = effects.some((e) => SKELETON_SUMMON.test(e))
    for (const c of classes) {
      out.casters.add(c)
      if (pet) out.pets.add(c)
      if (skeleton) out.skeletons.add(c)
    }
  }
  return out
}

/** A row's classes when it names them as bare codes ("BRD"), else null. */
function statedCodes(classes: string | undefined): ClassAbbr[] | null {
  const tokens = (classes ?? '').trim().split(/[\s,]+/)
  if (tokens.length === 0 || !tokens.every(isClassAbbr)) return null
  return tokens
}

const sorted = (s: ReadonlySet<ClassAbbr>): ClassAbbr[] => [...s].sort()

/** One focus row's rule, or null when none applies. */
function ruleOf(row: SpellEntry, powers: ClassPowers): FocusBenefit | null {
  const codes = statedCodes(row.classes)
  if (codes !== null) return { classes: codes, needs: codes.join('/') }
  const effects = row.effects ?? []
  if (effects.some((e) => /^Limit Effect: Summon Skeleton Pet/i.test(e))) {
    return { classes: sorted(powers.skeletons), needs: 'a class with a skeleton pet spell' }
  }
  if (effects.some((e) => /^Limit Effect: Summon Pet/i.test(e) || /^Pet Power Increase/i.test(e))) {
    return { classes: sorted(powers.pets), needs: 'a class with a pet spell' }
  }
  if (effects.some((e) => /^Limit\b/i.test(e))) return { classes: sorted(powers.casters), needs: 'a spell-casting class' }
  return null
}

/** Focus name → who it can help. Exact name first, then the first row of its family with a rule. */
export function buildFocusBenefit(spells: readonly SpellEntry[]): (focus: string) => FocusBenefit | null {
  const present = applySpellCorrections(applySpellRemovals(spells).spells).spells
  const powers = classPowers(present)
  const byName = new Map<string, FocusBenefit>()
  const byFamily = new Map<string, FocusBenefit>()
  for (const row of spells) {
    const rule = ruleOf(row, powers)
    if (rule === null) continue
    const key = row.name.trim().toLowerCase()
    if (!byName.has(key)) byName.set(key, rule)
    const family = parseFocusEffect(row.name).family.toLowerCase()
    if (!byFamily.has(family)) byFamily.set(family, rule)
  }
  // A row with no rule falls to its family: "Wind Resonance 8" is filed NPC-only, its family BRD.
  return (focus) =>
    byName.get(focus.trim().toLowerCase()) ?? byFamily.get(parseFocusEffect(focus).family.toLowerCase()) ?? null
}

/** The committed list's answer, built once for the process. */
export const COMMITTED_FOCUS_BENEFIT = buildFocusBenefit((spellsJson as SpellDbFile).spells)
