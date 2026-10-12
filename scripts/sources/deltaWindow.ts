// deltaWindow.ts — one feed, one window per file. The feed is read once from the oldest stamp
// among the files being refreshed; each file takes only the changes newer than its own stamp.
// Pure: no network, no files.

import type { FeedChanges, PageIds, PageTexts } from './deltaPages'

export type DeltaFile = 'items' | 'mobs' | 'spells' | 'quests'

/** One overlap hour absorbs any clock skew between the scrape host and the wiki. */
const OVERLAP_MS = 3600_000

/** Each refreshed file's window start (its stamp minus the overlap), as ISO. */
export type Windows = Partial<Record<DeltaFile, string>>

export function windowStart(stamp: string): string {
  return new Date(Date.parse(stamp) - OVERLAP_MS).toISOString()
}

const starts = (w: Windows): string[] => Object.values(w).filter((s): s is string => !!s)
export const oldestStart = (w: Windows): string => starts(w).sort()[0] ?? ''
export const newestStart = (w: Windows): string => starts(w).sort().reverse()[0] ?? ''

/** Feed timestamps are second-precision ISO, window starts carry milliseconds: compare as dates. */
const atOrAfter = (t: string, start: string): boolean => Date.parse(t) >= Date.parse(start)

/** The files whose window holds a change made at `t`. */
export function filesAt(w: Windows, t: string): DeltaFile[] {
  return (Object.keys(w) as DeltaFile[]).filter((f) => atOrAfter(t, w[f] ?? ''))
}

/** What each file already holds, by title and (where the file keys by it) by pageid. */
export interface Known {
  itemPages: ReadonlySet<string>
  mobPages: ReadonlySet<string>
  spellIds: ReadonlySet<number>
  spellTitles: ReadonlySet<string>
  questIds: ReadonlySet<number>
  questTitles: ReadonlySet<string>
}

export type Owner = DeltaFile | 'unknown'

/** The file a page belongs to as of the last scrape, or 'unknown' (new, or none of them). */
function ownerOf(title: string, pageid: number | undefined, k: Known): Owner {
  if ((pageid && k.spellIds.has(pageid)) || k.spellTitles.has(title)) return 'spells'
  if ((pageid && k.questIds.has(pageid)) || k.questTitles.has(title)) return 'quests'
  if (k.itemPages.has(title)) return 'items'
  if (k.mobPages.has(title)) return 'mobs'
  return 'unknown'
}

/**
 * Is a change at `t` worth reading? Inside the item or mob window, always (today's rule). In an
 * older window only for the pages that file holds, plus unknown pages for spells (a spell page
 * created since). A page an item or mob scrape read after the change cannot be a spell or quest
 * page it did not already list, so it is skipped.
 */
function wanted(files: DeltaFile[], owner: Owner): boolean {
  if (files.includes('items') || files.includes('mobs')) return true
  if (files.includes('spells') && (owner === 'spells' || owner === 'unknown')) return true
  return files.includes('quests') && owner === 'quests'
}

export interface ReadPlan {
  pageids: number[]
  titles: string[]
  /** planned reads per owner, inside some window of theirs (the dry run's census) */
  byOwner: Map<Owner, number>
}

function count(plan: ReadPlan, owner: Owner): void {
  plan.byOwner.set(owner, (plan.byOwner.get(owner) ?? 0) + 1)
}

/** The pages to read: edits by pageid, log titles by title, each only when some window wants it. */
export function planReads(feed: FeedChanges, w: Windows, k: Known): ReadPlan {
  const plan: ReadPlan = { pageids: [], titles: [], byOwner: new Map() }
  for (const id of feed.pageids) {
    const title = feed.pageTitle.get(id) ?? ''
    const owner = ownerOf(title, id, k)
    if (!wanted(filesAt(w, feed.pageTime.get(id) ?? ''), owner)) continue
    plan.pageids.push(id)
    count(plan, owner)
  }
  for (const title of feed.titles) {
    const owner = ownerOf(title, undefined, k)
    if (!wanted(filesAt(w, feed.titleTime.get(title) ?? ''), owner)) continue
    plan.titles.push(title)
    count(plan, owner)
  }
  return plan
}

/** The newest feed time behind a read title: its pageid's edits or a log row naming it. */
export function timeOf(title: string, feed: FeedChanges, ids: PageIds): string {
  const id = ids.pageids.get(title)
  const byId = id ? (feed.pageTime.get(id) ?? '') : ''
  const byTitle = feed.titleTime.get(title) ?? ''
  return byId > byTitle ? byId : byTitle
}

/** The read pages whose change falls inside `file`'s window. */
export function pagesFor(
  file: DeltaFile,
  w: Windows,
  feed: FeedChanges,
  reads: PageIds & { pages: PageTexts }
): PageTexts {
  const start = w[file]
  const out: PageTexts = new Map()
  if (!start) return out
  for (const [title, wt] of reads.pages) {
    const t = timeOf(title, feed, reads)
    if (t && atOrAfter(t, start)) out.set(title, wt)
  }
  return out
}
