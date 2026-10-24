// itemEffects.ts — an item window's effects as the wiki's Item Page Blueprint writes them (Help:Contents,
// read 2026-10-23; owner's Petamorph Wand: Mummy against the hand-written Werewolf page): the effect as a
// styled link with its kind and timing in one bracket, and a pet illusion as its own line under Race.
// Split out of itemWindow.ts (its size bar); pure.

/** The blueprint's link: `[[Name|<span class='itemeff'>Name</span>]]`. */
export const effLink = (name: string, shown = name): string => `[[${name}|<span class='itemeff'>${shown}</span>]]`

/** The kind words the blueprint puts first: a click is `Clicky`, a proc `Combat`, a worn effect `Worn`. */
const KIND_WORD: Record<string, string> = { Click: 'Clicky', Combat: 'Combat', Worn: 'Worn' }

/**
 * `Effect: [[Summon Familiar: Mummy|<span class='itemeff'>...</span>]] (Clicky, Can Equip, Casting Time: 5.0,
 * Cooldown: 10 seconds) at Level 40`: the kind, the window's own bracket words (`Can Equip`, `Must Equip`,
 * `Any Slot`), the casting time, the cooldown, in the blueprint's order.
 */
export function effectText(kind: string, name: string, bracket: string | undefined, info: ReadonlyMap<string, string>): string {
  const cast = info.get('Casting Time')
  const cooldown = info.get('Cooldown')
  const notes = [
    KIND_WORD[kind] ?? kind,
    ...(bracket ?? '').split(/\s*,\s*/).filter((w) => w !== '' && w !== kind),
    ...(cast === undefined ? [] : [`Casting Time: ${cast}`]),
    ...(cooldown === undefined ? [] : [`Cooldown: ${cooldown}${/^\d+(\.\d+)?$/.test(cooldown) ? ' seconds' : ''}`])
  ]
  const level = info.get('Level')
  return `Effect: ${effLink(name)} (${notes.join(', ')})${level === undefined ? '' : ` at Level ${level}`}`
}

/** `Pet Illusion: Mummy`, as OCR may read it (`Pet lllusion`, `Pet |llusion`), in the window's effect lines. */
const PET_ILLUSION = /\bP[ae]t\s+[Il1|]{1,3}l*usion\s*[:;.]?\s*([A-Z][A-Za-z' -]*?)\s*(?:\(|[|\]}]|$)/
/** The illusion spell's own description the window prints under it. */
const PET_DESCRIPTION = /^Changes your pet to look like\b/i

/**
 * The pet illusion an item grants, from the window's `Effect: Pet Illusion: Mummy (Casting Time: 5.0)`
 * and its spell block (`Pet Illusion: Mummy` / `Changes your pet to look like a Mummy`), and the lines
 * it takes, so they are not read as stats or left as unread.
 */
export function petIllusionOf(lines: readonly string[]): { name?: string; taken: Set<number> } {
  const taken = new Set<number>()
  let name: string | undefined
  lines.forEach((l, i) => {
    const m = PET_ILLUSION.exec(l)
    if (m !== null && m[1].trim() !== '') {
      name ??= m[1].trim()
      taken.add(i)
    } else if (PET_DESCRIPTION.test(l)) taken.add(i)
  })
  return name === undefined ? { taken } : { name, taken }
}

/** The page's line for it, after a blank line under Race, as the Werewolf page writes it. */
export const petIllusionLine = (name: string): string => `Pet Illusion: ${effLink(`Pet Illusion: ${name}`, name)}<br>`
