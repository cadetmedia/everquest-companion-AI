// deltaSkip.ts — pages the delta need not read (owner, 2026-10-23: hit the wiki no more than needed),
// and the item and mob revision indexes it keeps (sources/revIndex.ts).
//
// A changed page is skipped when the feed's newest revision of it is the text we already hold: the
// cached revision id equals the feed's, or the hex sha1 of our cached text equals the feed's sha1 (a
// null edit, a revert, or a page the last full scrape already read at that revision). Never when its
// title moved or a log row names it (a move makes a revision with the same text under a new title).

import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { CachedPage } from './deltaCache'
import type { FeedChanges } from './deltaPages'
import { readRevIndex, recordRevs, sha1Hex, writeRevIndex, type RevIndex } from './revIndex'

/** What we hold of one page: its title, the revision we recorded, and its text when cached. */
export interface Held {
  title: string
  rev?: number
  text?: () => string | undefined
}

/** Planned pageids whose newest revision is the one we hold, with that revision. */
export function unchangedPages(pageids: Iterable<number>, feed: FeedChanges, held: (pageid: number) => Held | undefined): Map<number, number> {
  const out = new Map<number, number>()
  for (const id of pageids) {
    const rev = feed.pageRev.get(id)
    const title = feed.pageTitle.get(id)
    const h = held(id)
    if (rev === undefined || title === undefined || h === undefined) continue
    if (h.title !== title || feed.titles.has(title)) continue
    const sha = feed.pageSha1.get(id)
    if (h.rev === rev || (sha !== undefined && sha === sha1OrUndefined(h))) out.set(id, rev)
  }
  return out
}

const sha1OrUndefined = (h: Held): string | undefined => {
  const text = h.text?.()
  return text === undefined ? undefined : sha1Hex(text)
}

interface ListedPage {
  pageid: number
  title: string
}

const readList = (path: string): ListedPage[] => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as ListedPage[]) : [])

/** One cache family: where its pages and revisions live, and how to read a page's cached text. */
interface Family {
  dir: string
  list: string
  text: (pageid: number) => string | undefined
}

/** Every page's text in the item cache's batch files, by pageid. */
function loadItemTexts(dir: string): Map<number, string> {
  const byId = new Map<number, string>()
  for (const name of readdirSync(dir).filter((n) => n.startsWith('batch-'))) {
    const pages = JSON.parse(readFileSync(join(dir, name), 'utf8')) as CachedPage[]
    for (const p of pages) {
      const content = p.revisions?.[0]?.slots?.main?.content
      if (p.pageid !== undefined && content !== undefined) byId.set(p.pageid, content)
    }
  }
  return byId
}

/** The item cache's text by pageid, read once and only when a planned page asks. */
function itemTexts(dir: string): (pageid: number) => string | undefined {
  let byId: Map<number, string> | null = null
  return (pageid) => (byId ??= loadItemTexts(dir)).get(pageid)
}

function mobText(dir: string): (pageid: number) => string | undefined {
  return (pageid) => {
    const file = join(dir, `page-${String(pageid)}.wikitext`)
    return existsSync(file) ? readFileSync(file, 'utf8') : undefined
  }
}

/** The item and mob caches this checkout has. */
export function cacheFamilies(itemCache: string, mobCache: string): Family[] {
  const out: Family[] = []
  if (existsSync(itemCache)) out.push({ dir: itemCache, list: 'item-pages.json', text: itemTexts(itemCache) })
  if (existsSync(mobCache)) out.push({ dir: mobCache, list: 'mob-pages.json', text: mobText(mobCache) })
  return out
}

/** What the caches hold of a pageid: its listed title, recorded revision and cached text. */
export function heldIn(families: Family[]): (pageid: number) => Held | undefined {
  const loaded = families.map((f) => ({ f, idx: readRevIndex(f.dir), byId: new Map(readList(join(f.dir, f.list)).map((p) => [p.pageid, p.title])) }))
  return (pageid) => {
    for (const { f, idx, byId } of loaded) {
      const title = byId.get(pageid)
      if (title === undefined) continue
      const rev = idx.revs[String(pageid)]
      return { title, ...(rev === undefined ? {} : { rev }), text: () => f.text(pageid) }
    }
    return undefined
  }
}

/**
 * Every revision the run read or proved, into the index of each family listing the page (after the
 * write-back, so a page the delta added to a list counts); a page gone from the wiki leaves it.
 */
export function recordCacheRevs(families: Family[], read: Map<number, number>, gone: ReadonlySet<string>, now: string): void {
  for (const f of families) {
    const listed = readList(join(f.dir, f.list))
    const ids = new Set(listed.map((p) => p.pageid))
    const goneIds = listed.filter((p) => gone.has(p.title)).map((p) => p.pageid)
    const idx: RevIndex = readRevIndex(f.dir)
    const n = recordRevs(idx, [...read].filter(([id]) => ids.has(id)), goneIds)
    if (n > 0) writeRevIndex(f.dir, idx, now)
    console.log(`  ${f.list.replace('-pages.json', '')} revision index: ${n} entries changed, ${Object.keys(idx.revs).length} known`)
  }
}

/** The revisions the run read, by pageid. */
export function readRevisions(ids: { pageids: Map<string, number>; revids: Map<string, number> }): Map<number, number> {
  const out = new Map<number, number>()
  for (const [title, revid] of ids.revids) {
    const pageid = ids.pageids.get(title)
    if (pageid !== undefined) out.set(pageid, revid)
  }
  return out
}

/** The planned pageids less those whose newest revision we hold, printed; returns pageid -> that revision. */
export function skipHeldPages(plan: { pageids: number[] }, feed: FeedChanges, caches: { itemCache: string; mobCache: string }): Map<number, number> {
  const proven = unchangedPages(plan.pageids, feed, heldIn(cacheFamilies(caches.itemCache, caches.mobCache)))
  plan.pageids = plan.pageids.filter((id) => !proven.has(id))
  console.log(`  ${String(proven.size)} changed pages already hold their newest revision: not read`)
  return proven
}
