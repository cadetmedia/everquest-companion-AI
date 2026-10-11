// shared/tradeskills.ts — the tradeskills, one spelling each, for the Bazaar's Tradeskill filter.
//
// items.json writes a recipe's tradeskill the way its wiki page did, and the wiki is not tidy:
// "Jewelry Making" beside "Jewelcrafting", "Research" and "Skill Research" beside "Spell Research",
// ":Tailoring", "Brew Barrel" (the container) for Brewing, "Spell Research - Necromancer". One
// canonical name per skill, and a fold from any spelling to it, or to nothing for what names no
// tradeskill ("Non-Tradeskill", "None", a quest's name).

export const TRADESKILLS = [
  'Alchemy',
  'Baking',
  'Blacksmithing',
  'Brewing',
  'Fishing',
  'Fletching',
  'Jewelcrafting',
  'Poison Making',
  'Pottery',
  'Spell Research',
  'Tailoring',
  'Tinkering'
] as const

export type Tradeskill = (typeof TRADESKILLS)[number]

/** The other spellings seen in items.json, lower-cased. */
const ALIAS: Record<string, Tradeskill> = {
  'jewelry making': 'Jewelcrafting',
  research: 'Spell Research',
  'skill research': 'Spell Research',
  'make poison': 'Poison Making',
  'brew barrel': 'Brewing',
  'skill fletching': 'Fletching'
}

const BY_NAME = new Map<string, Tradeskill>(TRADESKILLS.map((t) => [t.toLowerCase(), t]))

/** The tradeskill a recipe's spelling means, or undefined when it names none. */
export function tradeskillOf(raw: string | undefined): Tradeskill | undefined {
  if (raw === undefined) return undefined
  // A leading colon is a wiki link left in; a " - Necromancer" tail names the class, not the skill.
  const s = raw.replace(/^[\s:]+/, '').split(' - ')[0].trim().toLowerCase()
  return BY_NAME.get(s) ?? ALIAS[s]
}
