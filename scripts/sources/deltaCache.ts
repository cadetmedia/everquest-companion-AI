// deltaCache.ts — the delta's fresh wikitext, written back into the scrapers' disk caches that
// exist in this checkout, so the generators reading them (scrape-page-era.ts, gen-mob-races.mts,
// gen-mob-factions.mts via sources/mobCache.ts) see the delta's text, not the full scrape's.
// Both caches are gitignored: a checkout without one has no stale copy to fix.

import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'

/** One page as a `prop=revisions` batch holds it, the shape every cache reader takes. */
export interface CachedPage {
  pageid?: number
  ns?: number
  title?: string
  revisions?: { slots?: { main?: { content?: string } } }[]
}

export interface FreshPage {
  pageid: number
  title: string
  content: string
}

export interface CacheChange {
  fresh: FreshPage[]
  /** titles that no longer exist */
  gone: ReadonlySet<string>
  /** titles worth adding when no batch holds them yet (the item and mob pages) */
  keep: ReadonlySet<string>
}

/** Pages the item scraper never fetched; read by the same readers as its own batches. */
export const DELTA_BATCH = 'batch-delta.json'

const asCached = (p: FreshPage): CachedPage => ({
  pageid: p.pageid,
  ns: 0,
  title: p.title,
  revisions: [{ slots: { main: { content: p.content } } }]
})

/**
 * Patch the item cache's batches in place: a fresh page replaces the copy with its pageid
 * (whatever its title was), a page no batch holds goes to DELTA_BATCH, a gone title is dropped.
 * Each page stays in exactly one file, so no reader depends on file order. Returns the files
 * that changed.
 */
export function patchItemBatches(
  batches: Map<string, CachedPage[]>,
  change: CacheChange
): string[] {
  const dirty = new Set<string>()
  const where = new Map<number, [string, number]>()
  for (const [file, pages] of batches) {
    pages.forEach((p, i) => p.pageid !== undefined && where.set(p.pageid, [file, i]))
  }
  for (const p of change.fresh) {
    const at = where.get(p.pageid)
    const pages = at ? batches.get(at[0]) : undefined
    if (at && pages) {
      pages[at[1]] = asCached(p)
      dirty.add(at[0])
    } else if (change.keep.has(p.title)) {
      batches.set(DELTA_BATCH, [...(batches.get(DELTA_BATCH) ?? []), asCached(p)])
      dirty.add(DELTA_BATCH)
    }
  }
  for (const [file, pages] of batches) {
    const kept = pages.filter((p) => !change.gone.has(p.title ?? ''))
    if (kept.length === pages.length) continue
    batches.set(file, kept)
    dirty.add(file)
  }
  return [...dirty]
}

function writeAtomic(path: string, data: string): void {
  writeFileSync(`${path}.tmp`, data, 'utf8')
  renameSync(`${path}.tmp`, path)
}

/** The item cache under `dir`, patched on disk. The number of files rewritten. */
export function writeItemCache(dir: string, change: CacheChange): number {
  const batches = new Map<string, CachedPage[]>()
  for (const name of readdirSync(dir).filter((n) => n.startsWith('batch-'))) {
    const pages: unknown = JSON.parse(readFileSync(join(dir, name), 'utf8'))
    if (Array.isArray(pages)) batches.set(name, pages as CachedPage[])
  }
  const dirty = patchItemBatches(batches, change)
  for (const name of dirty) writeAtomic(join(dir, name), JSON.stringify(batches.get(name)))
  return dirty.length
}

/**
 * The mob cache under `dir`: each page it already holds (`page-<pageid>.wikitext`) rewritten and
 * each new page in `change.keep` added, with `mob-pages.json` (the list the reader names pages by)
 * carrying every current title; a gone title leaves the list.
 */
export function writeMobCache(dir: string, change: CacheChange): number {
  const indexPath = join(dir, 'mob-pages.json')
  const read = existsSync(indexPath)
    ? (JSON.parse(readFileSync(indexPath, 'utf8')) as CachedPage[])
    : []
  const index = read.filter((m) => !change.gone.has(m.title ?? ''))
  const byId = new Map(index.map((m) => [m.pageid, m]))
  let n = 0
  for (const p of change.fresh) {
    const file = join(dir, `page-${String(p.pageid)}.wikitext`)
    if (!existsSync(file) && !change.keep.has(p.title)) continue
    writeAtomic(file, p.content)
    const member = byId.get(p.pageid)
    if (member) member.title = p.title
    else index.push({ pageid: p.pageid, ns: 0, title: p.title })
    n++
  }
  if (n > 0 || index.length < read.length) writeAtomic(indexPath, JSON.stringify(index))
  return n
}
