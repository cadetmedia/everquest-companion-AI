// The "notable pickup" predicate (Task #53), shared by main and the renderer.
//
// It used to live only in features/loot/useNotablePickups.ts, but the event-log overlay's
// feed module (main-side) needs the SAME rule — a notable loot is a feed event. One
// definition, imported by both, so the strip and the feed can never disagree about what
// counts as notable.

import type { ItemKnowledge, ItemRecipeUse } from './types'
import { tradeskillOf, type Tradeskill } from './tradeskills'

/** Is a knowledge record "notable" (worth flagging / listing)? Lore, quest-flagged, or used
 *  by at least one known quest. Everything else is ordinary vendor trash.
 *
 *  Tradeskill recipes deliberately do NOT make an item notable: this predicate drives the
 *  PUSH surfaces (the pickups strip, the event-log feed), and every bone chip / spider leg
 *  in the game is a recipe ingredient. Recipes answer "what is it for" on the PULL surfaces
 *  (the item dialog, the row tooltip) instead. */
export function isNotableKnowledge(k: ItemKnowledge): boolean {
  return k.lore || k.quest || k.questUses.length > 0
}

/** What a LIST ROW needs to know about an item, and nothing more: the icon and the badge facts.
 *  Asked for many names in one call (`items:marks`), answered off the committed DB, so a table of
 *  2,000 rows costs one round trip per paint instead of one full record per row. */
export interface ItemMarks {
  iconId?: number
  lore: boolean
  quest: boolean
  /** How many known quests use it (the `quest` badge, and notability). */
  questUses: number
  /** Those quests by name, once each (the Bazaar's Quest search). */
  quests: string[]
  /** How many known recipes use it (the `tradeskill` badge). */
  recipes: number
  /** The tradeskills it is an ingredient of or made by, one spelling each (the Bazaar's Tradeskill filter). */
  tradeskills: Tradeskill[]
  /** The stats block says NO DROP / NO TRADE (the Bazaar's keep rule). */
  noTrade: boolean
}

const NO_TRADE = new Set(['no drop', 'no trade', 'nodrop'])

export function marksOf(k: Omit<ItemKnowledge, 'cached'>): ItemMarks {
  const skills = [...(k.recipes ?? []), ...(k.craftedBy ?? [])].map((r) => tradeskillOf(r.tradeskill))
  return {
    ...(k.iconId === undefined ? {} : { iconId: k.iconId }),
    lore: k.lore,
    quest: k.quest,
    questUses: k.questUses.length,
    quests: [...new Set(k.questUses.map((u) => u.quest))],
    recipes: k.recipes?.length ?? 0,
    tradeskills: [...new Set(skills.filter((t): t is Tradeskill => t !== undefined))],
    noTrade: (k.stats?.flags ?? []).some((f) => NO_TRADE.has(f.toLowerCase()))
  }
}

/** The same rule as `isNotableKnowledge`, read off the marks. */
export function isNotableMarks(m: ItemMarks): boolean {
  return m.lore || m.quest || m.questUses > 0
}

/** ONE spelling of a recipe use: `Gnome Kabobs (Baking 56)`. Degrades as the page does —
 *  no tradeskill / no trivial simply drops out, never a guess. */
export function recipeUseLabel(r: ItemRecipeUse): string {
  const inner = [r.tradeskill, r.trivial != null ? String(r.trivial) : null].filter(Boolean).join(' ')
  return inner ? `${r.recipe} (${inner})` : r.recipe
}

/** ONE spelling of "how this item is made": `Baking 56 (Oven)`, joined with ` · ` across
 *  recipes, or the prose fallback. Undefined when the page said nothing. */
export function craftedByLabel(k: ItemKnowledge): string | undefined {
  const made = (k.craftedBy ?? [])
    .map((c) => {
      const head = [c.tradeskill, c.trivial != null ? String(c.trivial) : null].filter(Boolean).join(' ')
      return c.container ? `${head} (${c.container})` : head
    })
    .filter(Boolean)
  if (made.length > 0) return made.join(' · ')
  return k.craftedNote
}
