// gapExistingPage.ts — a page the wiki already has under the row's name in other capitals, or one
// that is free text with no item or mob template (owner, 2026-10-22: the wiki had "Drake lava powder",
// free text since August, so the data never held it; the row offered Re-scrape and its button opened
// a NEW page "Drake Lava Powder", and the owner made a second page). MediaWiki titles are
// case-sensitive past the first letter, so such a page is found only by the lookup's search, whose
// answer the runtime cache keeps (itemLookup.ts / mobLookup.ts: `page`, `notItemPage`, `notMobPage`).
//
// The verdict carries the found title: `otherPage:<title>` (the same name, other capitals) and
// `freeText:<title>` (the page is not an item or mob page yet). A hit whose title is another name
// altogether is the search's fallback, no proof of a page, and asks for a check.

import type { GapAction, GapRow, GapVerdict } from './gaps'

/** What the runtime cache holds of one lookup, as much as a verdict needs. */
export interface LookupAnswer {
  notFound?: boolean
  offline?: boolean
  page?: string
  notItemPage?: boolean
  notMobPage?: boolean
}

/** A title as MediaWiki compares it: underscores are spaces, the first letter's case is free. */
const titleKey = (t: string): string => {
  const s = t.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** The verdict one cached lookup gives a row name. */
export function lookupVerdict(name: string, data: LookupAnswer): GapVerdict {
  if (data.notFound === true) return 'noPage'
  const page = data.page
  // An older cache entry names no page: a page all the same, as it always read.
  if (page === undefined || page === '') return 'hasPage'
  if (titleKey(page).toLowerCase() !== titleKey(name).toLowerCase()) return 'unchecked'
  if (data.notItemPage === true || data.notMobPage === true) return `freeText:${page}`
  return titleKey(page) === titleKey(name) ? 'hasPage' : `otherPage:${page}`
}

/** The page a verdict says exists under another spelling or as free text, if it says so. */
export function existingPage(verdict: GapVerdict): { title: string; freeText: boolean } | undefined {
  const m = /^(otherPage|freeText):(.+)$/s.exec(verdict)
  return m === null ? undefined : { title: m[2], freeText: m[1] === 'freeText' }
}

/** The wiki's editor on an existing page (gaps.ts `wikiEditUrl`, restated: this file takes no value from gaps.ts). */
const editUrl = (page: string): string => `https://eqlwiki.com/index.php?title=${encodeURIComponent(page.trim().replace(/ /g, '_'))}&action=edit`

/** The action for such a page: fix the one that exists, never make a second. `edit` builds its editor link. */
export function existingPageAction(verdict: GapVerdict, edit: (page: string) => string = editUrl): GapAction | undefined {
  const found = existingPage(verdict)
  if (found === undefined) return undefined
  const why = found.freeText
    ? `The wiki has ${found.title}, but it is not an item or mob page yet: turn it into one (the template), moving it to the game's spelling if it differs; don't create a second page.`
    : `The wiki has this as ${found.title} (other capitals): use that page, moving it to the game's spelling if it should be; don't create a second page.`
  return { kind: 'checkWiki', label: 'Fix page', why, href: edit(found.title) }
}

/**
 * The row button's link when a page exists: the page itself, opened to read, not its editor. Copy wiki
 * page holds a whole page built from the log, and pasted over a page people wrote it erases their text
 * (owner, 2026-10-23: "why is this description missing when i update from the app"; pre-release
 * review): the person adds to the page from its own Edit tab.
 */
export function existingEditor(row: GapRow, verdict: GapVerdict): { target: string; create: string; existing: true; view: true } | undefined {
  const found = existingPage(verdict)
  if (found !== undefined) return { target: found.title, create: 'Open existing page', existing: true, view: true }
  return verdict === 'hasPage' ? { target: row.name, create: 'Open existing page', existing: true, view: true } : undefined
}
