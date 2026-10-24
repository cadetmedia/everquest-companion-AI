// itemLore.ts — two Lore-tab repairs, split out of itemWindow.ts (its size bar); pure.
//
// The owner's Petamorph Wand: Mummy (2026-10-23): the lore `They haven't unraveled yet!` was read once as
// `hey haven't ...` (OCR split the capital off, `T hey`, and the line cleaning drops a lone leading letter
// as a mark) and once as the tab row's garble (`"FCT Desorgwtngy 7 WIC 2d 0d 7 PAC`), which was longer.

/** A word as lore is written: letters, an apostrophe or hyphen, closing punctuation allowed. */
const WORD = /^["'(]?[A-Za-z][a-z'-]*[.,!?;:"')]*$/

/** How much of a line reads as words (`They haven't unraveled yet!` 1; the tab row's garble 0.125). */
export function wordShare(line: string): number {
  const tokens = line.split(/\s+/).filter((t) => t !== '')
  return tokens.length === 0 ? 0 : tokens.filter((t) => WORD.test(t)).length / tokens.length
}

/** The lore line among candidates when no tab row was found: the longest that mostly reads as words. */
export function bestLoreLine(candidates: readonly string[]): string | undefined {
  const wordy = candidates.filter((l) => wordShare(l) >= 0.5)
  return (wordy.length > 0 ? wordy : candidates).slice().sort((a, b) => b.length - a.length)[0]
}

/**
 * A capital OCR split off its word and the cleaning dropped, put back: `T hey haven't` cleaned to `hey
 * haven't` is `They haven't`. Only a capital that is no word alone (not `A`, `I`, `O`) before a
 * lower-case word.
 */
export function withSplitCapital(raw: string, cleaned: string): string {
  const m = /^[^A-Za-z0-9]*([B-HJ-NP-Z])\s+([a-z][^\s]*)/.exec(raw)
  return m !== null && cleaned.startsWith(m[2]) ? `${m[1]}${cleaned}` : cleaned
}
