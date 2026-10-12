// deltaPages.ts — scrape-delta.mts's pure halves: the change feed's rows, the revisions response,
// and the mob fold. No network, no files.

import { isMobPage, parseMobPage } from './mobPage'

/** A move or delete in ns0: listed for the record; its titles are re-read like any edit. */
export interface PageLogEvent {
  logtype: string
  logaction: string
  title: string
  target?: string
}

export interface RcRow {
  type: string
  title: string
  /** 0 for a row whose page no longer exists (a deletion) */
  pageid?: number
  logtype?: string
  logaction?: string
  logparams?: { target_title?: string }
  /** ISO time of the change */
  timestamp?: string
}

/** What the feed says to re-read: edited pages by id, titles named by log rows by title. */
export interface FeedChanges {
  pageids: Set<number>
  titles: Set<string>
  logs: PageLogEvent[]
  /** every row's title as the feed gave it (the dry run's census) */
  named: Set<string>
  /** the newest change time per pageid and per title a row names */
  pageTime: Map<number, string>
  titleTime: Map<string, string>
  /** an edited page's title as its newest row gave it */
  pageTitle: Map<number, string>
}

export const emptyFeed = (): FeedChanges => ({
  pageids: new Set(),
  titles: new Set(),
  logs: [],
  named: new Set(),
  pageTime: new Map(),
  titleTime: new Map(),
  pageTitle: new Map()
})

function stamp<K>(times: Map<K, string>, key: K, at: string | undefined): void {
  const prev = times.get(key)
  if (at && (!prev || at > prev)) times.set(key, at)
}

/**
 * An edit or creation is re-read by pageid, so a page moved since comes back under its current
 * title. Every log row (move source and target, delete, restore, merge, import) names titles to
 * re-read: the page's current state, read back, is the log applied.
 */
export function foldRcRow(rc: RcRow, feed: FeedChanges): void {
  feed.named.add(rc.title)
  if (rc.type !== 'log') {
    if (rc.pageid) {
      feed.pageids.add(rc.pageid)
      if (!feed.pageTime.has(rc.pageid) || (rc.timestamp ?? '') > (feed.pageTime.get(rc.pageid) ?? '')) {
        feed.pageTitle.set(rc.pageid, rc.title)
      }
      stamp(feed.pageTime, rc.pageid, rc.timestamp)
    } else {
      feed.titles.add(rc.title)
      stamp(feed.titleTime, rc.title, rc.timestamp)
    }
    return
  }
  feed.titles.add(rc.title)
  stamp(feed.titleTime, rc.title, rc.timestamp)
  const target = rc.logparams?.target_title
  if (target) {
    feed.titles.add(target)
    stamp(feed.titleTime, target, rc.timestamp)
  }
  if (rc.logtype !== 'move' && rc.logtype !== 'delete') return
  feed.logs.push({ logtype: rc.logtype, logaction: rc.logaction ?? '', title: rc.title, target })
}

export interface RevPage {
  /** absent on a pageid that no longer exists */
  title?: string
  pageid?: number
  ns?: number
  missing?: boolean
  invalid?: boolean
  revisions?: { revid?: number; slots?: { main?: { content?: string } } }[]
}

const contentOf = (p: RevPage): string | undefined => p.revisions?.[0]?.slots?.main?.content

/** Read pages: wikitext, or null for a page that no longer exists. */
export type PageTexts = Map<string, string | null>

/** Each read title's pageid and current revid, for the caches that key by them. */
export interface PageIds {
  pageids: Map<string, number>
  revids: Map<string, number>
}

/**
 * One revisions response into `out`. A page that exists but came back without content (a hidden
 * revision) cannot be applied: it goes to `unapplied`, and the run does not stamp past it. A
 * deleted pageid (no title) or a page moved out of ns0 is skipped: its log row's titles say it.
 */
export function readRevPages(
  pages: RevPage[],
  out: PageTexts,
  unapplied: string[],
  ids?: PageIds
): void {
  for (const p of pages) {
    if (p.title === undefined || (p.ns ?? 0) !== 0) continue
    if (ids) recordIds(p, p.title, ids)
    const wt = contentOf(p)
    if (p.missing && !p.invalid) out.set(p.title, null)
    else if (wt == null) unapplied.push(p.title)
    else out.set(p.title, wt)
  }
}

function recordIds(p: RevPage, title: string, ids: PageIds): void {
  if (p.pageid) ids.pageids.set(title, p.pageid)
  const revid = p.revisions?.[0]?.revid
  if (revid != null) ids.revids.set(title, revid)
}

/** scrapedAt moves to now only when every change in the window was applied. */

export function nextScrapedAt(prev: string, unapplied: string[], now: string): string {
  return unapplied.length > 0 ? prev : now
}

export interface MobFold<T> {
  byPage: Map<string, T | { page: string }>
  folded: string[]
  /** committed mob pages that no longer read as a mob (gone, a redirect, template removed) */
  removed: string[]
}

/** Mobs: keyed by page over the committed list; a read page that is no mob now leaves it. */
export function foldMobs<T extends { page: string }>(mobs: T[], pages: PageTexts): MobFold<T> {
  const byPage = new Map<string, T | { page: string }>(mobs.map((m) => [m.page, m]))
  const folded: string[] = []
  const removed: string[] = []
  for (const [title, wt] of pages) {
    const entry = wt != null && isMobPage(wt) ? parseMobPage(title, wt) : null
    if (entry) {
      byPage.set(title, entry)
      folded.push(title)
    } else if (byPage.delete(title)) removed.push(title)
  }
  return { byPage, folded, removed }
}

/** The pages scrape-classes.ts reads. */
const CLASS_PAGES = new Set([
  'Bard', 'Beastlord', 'Berserker', 'Cleric', 'Druid', 'Enchanter', 'Magician', 'Monk',
  'Necromancer', 'Paladin', 'Ranger', 'Rogue', 'Shadow Knight', 'Shaman', 'Warrior', 'Wizard',
  'Character Classes', 'Alternate Advancement', 'Disciplines', 'Stances & Invocations'
])

export type UnfoldedKind = 'redirect' | 'Plane of Sky' | 'spell' | 'class page' | 'quest' | 'other'

/** What a read page that folded into neither DB is, by the markers its own scraper keys on. */
export function unfoldedKind(title: string, wikitext: string): UnfoldedKind {
  if (/^\s*#REDIRECT/i.test(wikitext)) return 'redirect'
  if (title.startsWith('Plane of Sky')) return 'Plane of Sky'
  if (/\{\{\s*Spellpage(smart)?\b/i.test(wikitext)) return 'spell'
  if (CLASS_PAGES.has(title)) return 'class page'
  if (/\[\[\s*Category:[^\]]*Quests?\s*\]\]/i.test(wikitext)) return 'quest'
  return 'other'
}

/** Every read page with content that is in `folded` for neither DB, grouped by kind. */
export function unfolded(
  pages: PageTexts,
  folded: ReadonlySet<string>
): Map<UnfoldedKind, string[]> {
  const out = new Map<UnfoldedKind, string[]>()
  for (const [title, wt] of pages) {
    if (wt == null || folded.has(title)) continue
    const kind = unfoldedKind(title, wt)
    out.set(kind, [...(out.get(kind) ?? []), title])
  }
  return out
}

/** The committed wiki-derived files this delta does not touch, and what refreshes each. */
const NOT_REFRESHED: [string, string][] = [
  ['src/main/data/spells.json', 'npm run scrape:spells'],
  ['src/main/data/classes.json', 'npm run scrape:classes'],
  ['src/renderer/src/data/eqlegends/quests.json', 'npm run scrape:quests'],
  ['src/main/data/respawns.json', 'npm run scrape:respawns'],
  ['src/renderer/src/data/eqlegends/bosses.json', 'npm run scrape:bosses'],
  ['src/main/data/pageEra.json', 'npm run scrape:page-era'],
  ['src/renderer/src/data/eqlegends/posky.json', 'npm run scrape:posky'],
  ['src/renderer/src/data/eqlegends/mobRaces.json', 'npx tsx scripts/gen-mob-races.mts'],
  ['src/renderer/src/data/eqlegends/mobFactions.json', 'npx tsx scripts/gen-mob-factions.mts']
]

export const SPELLS_FILE = NOT_REFRESHED[0][0]
export const QUESTS_FILE = NOT_REFRESHED[2][0]

/**
 * The closing report: what was read and folded nowhere, then the wiki-derived files this run did
 * not refresh (`refreshed` names the ones it did).
 */
export function unfoldedReport(
  groups: Map<UnfoldedKind, string[]>,
  refreshed: ReadonlySet<string> = new Set()
): string[] {
  const total = [...groups.values()].reduce((n, t) => n + t.length, 0)
  const lines = total > 0 ? [`${total} read pages folded into no DB:`] : []
  const sorted = [...groups].sort((a, b) => b[1].length - a[1].length)
  for (const [kind, titles] of sorted) {
    const sortedTitles = [...titles].sort((a, b) => a.localeCompare(b))
    lines.push(`  ${kind} (${titles.length}): ${sortedTitles.join(' | ')}`)
  }
  lines.push('Not refreshed by the delta (committed, wiki-derived; where the build carries them):')
  for (const [file, how] of NOT_REFRESHED) {
    if (!refreshed.has(file)) lines.push(`  ${file}  (${how})`)
  }
  if (groups.has('quest') && refreshed.has(QUESTS_FILE)) {
    lines.push(
      'Quest-category pages outside the cached quest-page list: deleting ' +
        'scripts/sources/cache/quests/quest-pages.json and running `npm run scrape:quests` ' +
        're-lists the categories.'
    )
  }
  if (groups.has('spell') && !refreshed.has(SPELLS_FILE)) {
    lines.push(
      'Spell pages changed: `npm run scrape:spells` asks the wiki for current revids (50 per ' +
        'request) and re-fetches content only for pages whose revid moved.'
    )
  }
  return lines
}
