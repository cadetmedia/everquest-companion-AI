// shared/bazaarFacts.ts — which items the Bazaar's Hide No Drop, Tradeskill and Quest filters keep,
// read off each item's marks (shared/itemKnowledge.ts) as the tab holds them. Here rather than in
// the renderer because the renderer never filters served data (owner ruling 4).

/** What the filters read of an item: the `items:marks` fields the Bazaar keeps. */
export interface BazaarFacts {
  /** The wiki's No Drop, No Trade or NODROP flag. */
  noTrade: boolean
  /** The tradeskills it is an ingredient of or made by, one spelling each (shared/tradeskills.ts). */
  tradeskills: readonly string[]
  /** The known quests that use it. */
  quests: readonly string[]
}

/** The toolbar's three facts filters; '' asks nothing. */
export interface FactsFilter {
  hideNoTrade: boolean
  tradeskill: string
  /** Part of a quest name, any case. */
  quest: string
}

/** Whether any of the filters is on, so the list needs a keep at all. */
export function factsAsked(f: FactsFilter): boolean {
  return f.hideNoTrade || f.tradeskill !== '' || f.quest.trim() !== ''
}

/**
 * Whether an item's facts pass the filters. An item the DB does not know (undefined) passes Hide
 * No Drop, which only leaves out what the wiki marks, and fails Tradeskill and Quest, which ask
 * for something the item is known to be.
 */
export function factsPass(facts: BazaarFacts | undefined, f: FactsFilter): boolean {
  if (f.hideNoTrade && facts?.noTrade === true) return false
  if (f.tradeskill !== '' && !(facts?.tradeskills.includes(f.tradeskill) ?? false)) return false
  const quest = f.quest.trim().toLowerCase()
  return quest === '' || (facts?.quests.some((q) => q.toLowerCase().includes(quest)) ?? false)
}

/** The Quest box's choices: every known quest of `names`, once each, in alphabetical order. */
export function questNamesOf(names: readonly string[], factsOf: (name: string) => BazaarFacts | undefined): string[] {
  const out = new Set<string>()
  for (const n of names) for (const q of factsOf(n)?.quests ?? []) out.add(q)
  return [...out].sort((a, b) => a.localeCompare(b))
}
