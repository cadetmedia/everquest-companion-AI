// deltaQuests.ts — the delta's quests: a changed page of the cached quest-page list is parsed by
// scrape-quests.ts's own buildCatalog and folded into quests.json by page title; the quest cache
// (page-<pageid>.wikitext, index.json revids, quest-pages.json titles) moves with it, so the next
// `npm run scrape:quests` sees those pages as current. A read page outside the list joins it when
// its own text files it in a category that scraper walks (owner, 2026-10-23: new Lake Nerius quest
// pages were missed): 929 of the 931 cached quest pages carry such a link in their text.

import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { QuestEntry } from '../../src/shared/types'
import { buildCatalog } from '../scrape-quests'
import type { PageIds, PageTexts } from './deltaPages'
import { titleKey } from './questPage'

export interface QuestMember {
  pageid: number
  ns: number
  title: string
}

export interface QuestCache {
  members: QuestMember[]
  /** pageid -> revid of the cached file; empty before scrape:quests first built its index */
  revs: Record<string, number>
  itemTitles: ReadonlySet<string>
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))

/** The committed quest cache, or null when this checkout has none. */
export function readQuestCache(dir: string): QuestCache | null {
  const list = join(dir, 'quest-pages.json')
  const items = join(dir, 'item-titles.json')
  if (!existsSync(list) || !existsSync(items)) return null
  const index = join(dir, 'index.json')
  const revs = existsSync(index) ? ((readJson(index) as { revs?: Record<string, number> }).revs ?? {}) : {}
  return {
    members: readJson(list) as QuestMember[],
    revs,
    itemTitles: new Set(readJson(items) as string[])
  }
}

/** `#REDIRECT [[Target]]`'s target, spelled the way the API answers a title. */
export function redirectTarget(wt: string): string | null {
  const m = /^\s*#redirect\s*:?\s*\[\[([^\]|#]+)/i.exec(wt)
  if (!m) return null
  const t = m[1].replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  return t ? t[0].toUpperCase() + t.slice(1) : null
}

/**
 * title -> member, for every member a read page names: by pageid (a moved page, under its new
 * title), else by its listed title when its pageid was not read under another one (a deleted or
 * re-created page; the redirect a move leaves behind is not the member).
 */
function readMembers(members: QuestMember[], pages: PageTexts, ids: PageIds): Map<string, QuestMember> {
  const byId = new Map(members.map((m) => [m.pageid, m]))
  const byTitle = new Map(members.map((m) => [m.title, m]))
  const readIds = new Set([...pages.keys()].map((t) => ids.pageids.get(t)))
  const out = new Map<string, QuestMember>()
  for (const title of pages.keys()) {
    const id = ids.pageids.get(title)
    const own = id !== undefined ? byId.get(id) : undefined
    const named = byTitle.get(title)
    if (own) out.set(title, own)
    else if (named && !readIds.has(named.pageid)) out.set(title, named)
  }
  return out
}

/** A category scrape-quests.ts walks: its name ends in Quest(s) and it is not Quest Items. */
export function namesQuestCategory(wt: string): boolean {
  for (const m of wt.matchAll(/\[\[\s*Category\s*:\s*([^\]|]+)/gi)) {
    const name = m[1].replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
    if (/\bquests?$/i.test(name) && !/^quest items$/i.test(name)) return true
  }
  return false
}

/** Read pages on no list that file themselves as quests, as members of the list to be. */
function newMembers(members: QuestMember[], pages: PageTexts, ids: PageIds): Map<string, QuestMember> {
  const listedIds = new Set(members.map((m) => m.pageid))
  const listedTitles = new Set(members.map((m) => m.title))
  const out = new Map<string, QuestMember>()
  for (const [title, wt] of pages) {
    const pageid = ids.pageids.get(title)
    if (wt == null || pageid === undefined || listedIds.has(pageid) || listedTitles.has(title)) continue
    if (redirectTarget(wt) === null && namesQuestCategory(wt)) out.set(title, { pageid, ns: 0, title })
  }
  return out
}

/** Redirect targets of changed quest pages: scrape-quests.ts caches the followed text. */
export function questRedirects(cache: QuestCache, pages: PageTexts, ids: PageIds): string[] {
  const out: string[] = []
  for (const title of readMembers(cache.members, pages, ids).keys()) {
    const target = redirectTarget(pages.get(title) ?? '')
    if (target && !pages.has(target)) out.push(target)
  }
  return out
}

export interface QuestFold {
  quests: QuestEntry[]
  members: QuestMember[]
  fresh: { pageid: number; content: string; revid: number }[]
  /** pageids whose cache file and index entry go */
  gone: number[]
  folded: string[]
  /** pages on no list before that joined it this run */
  added: string[]
  removed: string[]
  /** changed quest pages that could not be applied (a redirect target that was not read) */
  unapplied: string[]
}

interface FoldCtx {
  fold: QuestFold
  byPage: Map<string, QuestEntry>
  isItem: (title: string) => boolean
  ids: PageIds
}

/** One read member: its entry replaced, renamed or dropped, its cache copy refreshed. */
function foldMember(ctx: FoldCtx, m: QuestMember, title: string, wt: string | null): void {
  const { fold, byPage, ids } = ctx
  // Only an entry the catalog held can be reported removed; a new page that parses as no quest never was.
  const had = byPage.has(m.title) || byPage.has(title)
  byPage.delete(m.title)
  if (wt === null) {
    fold.members = fold.members.filter((x) => x !== m)
    fold.gone.push(m.pageid)
    fold.removed.push(m.title)
    return
  }
  const pageid = ids.pageids.get(title) ?? m.pageid
  const revid = ids.revids.get(title)
  if (pageid !== m.pageid) fold.gone.push(m.pageid)
  const member = { ...m, pageid, title }
  fold.members = fold.members.map((x) => (x === m ? member : x))
  byPage.delete(title)
  const run = buildCatalog([member], () => wt, ctx.isItem)
  const entry = run.quests[0]
  if (entry) byPage.set(entry.page, entry)
  else if (had) fold.removed.push(title)
  fold.folded.push(title)
  if (revid != null) fold.fresh.push({ pageid, content: wt, revid })
}

/**
 * Changed quest pages over quests.json. `aux` holds redirect targets read for them. A page that
 * is gone leaves the list and the catalog; a page that no longer parses as a quest leaves the
 * catalog only (scrape-quests.ts keeps listing it); a move renames the entry.
 */
export function foldQuests(
  cache: QuestCache,
  quests: QuestEntry[],
  reads: { pages: PageTexts; ids: PageIds; aux: PageTexts }
): QuestFold {
  const fold: QuestFold = {
    quests: [], members: [...cache.members], fresh: [], gone: [], folded: [], added: [], removed: [], unapplied: []
  }
  const isItem = (title: string): boolean => cache.itemTitles.has(titleKey(title))
  const byPage = new Map(quests.map((q) => [q.page, q]))
  const ctx: FoldCtx = { fold, byPage, isItem, ids: reads.ids }
  for (const [title, m] of readMembers(cache.members, reads.pages, reads.ids)) {
    const wt = reads.pages.get(title) ?? null
    const target = wt === null ? null : redirectTarget(wt)
    const text = target ? (reads.aux.get(target) ?? reads.pages.get(target)) : wt
    if (target && text == null) fold.unapplied.push(title)
    else foldMember(ctx, m, title, text ?? null)
  }
  for (const [title, m] of newMembers(cache.members, reads.pages, reads.ids)) {
    fold.members.push(m)
    fold.added.push(title)
    foldMember(ctx, m, title, reads.pages.get(title) ?? null)
  }
  fold.quests = [...ctx.byPage.values()].sort((a, b) => a.page.localeCompare(b.page))
  fold.members.sort((a, b) => a.title.localeCompare(b.title))
  return fold
}

function writeAtomic(path: string, data: string): void {
  writeFileSync(`${path}.tmp`, data, 'utf8')
  renameSync(`${path}.tmp`, path)
}

/** The quest cache in scrape-quests.ts's own shapes (index keys sorted by pageid). */
export function writeQuestCache(dir: string, cache: QuestCache, fold: QuestFold): void {
  const revs = new Map(Object.entries(cache.revs))
  for (const id of fold.gone) {
    revs.delete(String(id))
    rmSync(join(dir, `page-${id}.wikitext`), { force: true })
  }
  for (const p of fold.fresh) {
    writeAtomic(join(dir, `page-${p.pageid}.wikitext`), p.content)
    revs.set(String(p.pageid), p.revid)
  }
  const index = { revs: Object.fromEntries([...revs].sort((a, b) => Number(a[0]) - Number(b[0]))) }

  writeAtomic(join(dir, 'index.json'), JSON.stringify(index, null, 2) + '\n')
  writeAtomic(join(dir, 'quest-pages.json'), JSON.stringify(fold.members))
}
