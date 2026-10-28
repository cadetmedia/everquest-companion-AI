// fontWords.ts — `I` or `l`: one bitmap in the game's 12 px Arial, so the font reader writes `l` for
// both and the word decides: a run of them is a roman rank (III), beside capitals it is a capital
// (WIZ, MEDIUM), otherwise the spelling the catalog's own text uses most (Instant, Idol, Item).
// From the font reader proof of concept (owner, 2026-10-21).
//
// ELECTRON-FREE.

const WORD = /[A-Za-z][A-Za-z'`]*/g
/** Past this many `l`s in one word the spellings are not tried (2^k). */
const MAX_TRIED = 6

/** Every word of the texts, counted. */
export function wordCounts(texts: Iterable<string>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const t of texts) for (const w of t.match(WORD) ?? []) counts.set(w, (counts.get(w) ?? 0) + 1)
  return counts
}

interface CatalogText {
  page?: string
  name?: string
  statsBlock?: string
  summary?: string
  otherNames?: string[]
}

/**
 * The catalog's text a window shows (names, statsblocks, lore): ~9,000 words in ~35 ms, where every
 * string of items.json took ~210 ms for no better pick (Instant, Idol, Item, Illusion are all here).
 */
export function* catalogTexts(entries: Iterable<CatalogText>): Generator<string> {
  for (const e of entries) {
    for (const t of [e.page, e.name, e.statsBlock, e.summary, ...(e.otherNames ?? [])]) if (typeof t === 'string') yield t
  }
}

/** The spelling of one word with its `l`s each read as `l` or `I`. */
function pick(word: string, counts: ReadonlyMap<string, number>): string {
  const idx = Array.from(word).flatMap((c, i) => (c === 'l' ? [i] : []))
  if (idx.length === 0) return word
  const letters = word.replace(/[^A-Za-z]/g, '')
  const others = Array.from(letters).filter((c) => c !== 'l')
  // Every letter ambiguous (a rank, III), or the rest capitals (WIZ, ALL): capitals.
  if (others.length === 0 || others.every((c) => c >= 'A' && c <= 'Z')) return word.replace(/l/g, 'I')
  if (idx.length > MAX_TRIED) return word
  let best = word
  let bc = -1
  for (let m = 0; m < 1 << idx.length; m++) {
    const a = Array.from(word)
    idx.forEach((i, k) => {
      if (m & (1 << k)) a[i] = 'I'
    })
    const cand = a.join('')
    const core = cand.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '')
    // A capital I inside a lowercase word is never right.
    if (/[a-z]I/.test(core)) continue
    const c = counts.get(core) ?? 0
    if (c > bc) {
      bc = c
      best = cand
    }
  }
  return best
}

/** A line with each word's `l`s resolved. */
export function resolveIl(line: string, counts: ReadonlyMap<string, number>): string {
  return line
    .split(/(\s+)/)
    .map((t) => (/\s/.test(t) ? t : pick(t, counts)))
    .join('')
}
