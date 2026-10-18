// mobCache.ts — every mob page's wikitext the scrapers left on disk, read the one way the
// generators that index mob pages (`gen-mob-races.mts`, `gen-mob-factions.mts`) read it.
//
// IT PARSES; IT DOES NOT SCRAPE. The input is wikitext already fetched and left under
// `scripts/sources/cache/`, in the two shapes the scrapers write:
//   - `cache/items/`  the item scraper's batches, one JSON array of pages per file.
//                     `embeddedin Template:Itempage` reports indirect transclusions, so every mob
//                     page that shows an item box was fetched along with the items (5,408 mob
//                     pages, measured 2026-09-28).
//   - `cache/mobs/`   the mob scraper's own cache, when `npm run scrape:mobs` has run here: one
//                     `page-<pageid>.wikitext` per page and `mob-pages.json` naming them.
// The cache is gitignored, so a worktree has none of its own: a generator passes the directories
// to read as arguments (later ones win) and the defaults are skipped.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isMobPage } from './mobPage'

// Later directories win: the mob scraper's cache is the fetch made FOR mob pages.
export const MOB_CACHE_DIRS = ['scripts/sources/cache/items', 'scripts/sources/cache/mobs']

/** One page as MediaWiki's batched `prop=revisions` returns it (formatversion 2). */
interface CachedPage {
  title?: string
  revisions?: { slots?: { main?: { content?: string } } }[]
}

/** One cache file's pages; none when it is not a batch this reader knows how to read. */
function readBatch(path: string): CachedPage[] {
  try {
    const batch: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return Array.isArray(batch) ? (batch as CachedPage[]) : []
  } catch {
    return []
  }
}

/** The mob scraper's list of the pages it fetched. */
const MOB_INDEX = 'mob-pages.json'

/** The pages a mob-scraper cache names, each read from its own file. */
function indexedPages(abs: string): CachedPage[] {
  if (!existsSync(join(abs, MOB_INDEX))) return []
  const members = readBatch(join(abs, MOB_INDEX)) as { pageid?: number; title?: string }[]
  const pages: CachedPage[] = []
  for (const member of members) {
    const file = join(abs, `page-${String(member.pageid)}.wikitext`)
    if (member.title === undefined || !existsSync(file)) continue
    const content = readFileSync(file, 'utf8')
    pages.push({ title: member.title, revisions: [{ slots: { main: { content } } }] })
  }
  return pages
}

/** Every mob page's wikitext found in one cache directory, by title. */
function cachedMobPages(root: string, dir: string): Map<string, string> {
  const pages = new Map<string, string>()
  const abs = resolve(root, dir)
  if (!existsSync(abs)) return pages
  const batches = readdirSync(abs)
    .filter((n) => n.endsWith('.json') && n !== MOB_INDEX)
    .flatMap((name) => readBatch(join(abs, name)))
  for (const page of [...batches, ...indexedPages(abs)]) {
    const text = page.revisions?.[0]?.slots?.main?.content
    if (page.title && text && isMobPage(text)) pages.set(page.title, text)
  }
  return pages
}

/** Every mob page in the given directories (the defaults when none are given), by title. */
export function mobPagesFrom(root: string, dirs: readonly string[]): Map<string, string> {
  const pages = new Map<string, string>()
  for (const dir of dirs.length > 0 ? dirs : MOB_CACHE_DIRS) {
    for (const [title, text] of cachedMobPages(root, dir)) pages.set(title, text)
  }
  return pages
}
