// deltaSpells.ts — the delta's spells. spells.json entries carry no pageid, so they are never
// patched in place: the spell cache (pageid -> wikitext, revid, title) is brought current from
// the feed, and spells.json is re-derived from the whole cache exactly as scrape-spells.ts's
// own parse phase does (pageid order, parseSpell with the page TITLE, stable sort by name).

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { SpellDbFile, SpellEntry } from '../../src/shared/types'
import { parseSpell, parseSpellpageFields } from '../scrape-spells'
import type { PageIds, PageTexts } from './deltaPages'

/** scrape-spells.ts's `sources/cache/spells/index.json`. */
export interface SpellIndex {
  updatedAt: string
  /** pageid -> revid of `<pageid>.wikitext` */
  revs: Record<string, number>
  /** pageid -> page title; absent in an index from before titles were recorded */
  titles?: Record<string, string>
}

export function readSpellIndex(dir: string): SpellIndex | null {
  const path = join(dir, 'index.json')
  if (!existsSync(path)) return null
  const j = JSON.parse(readFileSync(path, 'utf8')) as Partial<SpellIndex>
  return { updatedAt: j.updatedAt ?? '', revs: j.revs ?? {}, ...(j.titles ? { titles: j.titles } : {}) }
}

/** The marker scrape-spells.ts's parser keys on (`{{Spellpage` and `{{Spellpagesmart`). */
export const isSpellPage = (wt: string): boolean => wt.includes('{{Spellpage')

export interface SpellPage {
  pageid: number
  title: string
  content: string
  revid: number
}

export interface SpellFold {
  /** the spell universe after the change: pageid -> current title */
  titles: Record<string, string>
  fresh: SpellPage[]
  folded: string[]
  removed: string[]
}

/**
 * The changed pages over the universe, joined by PAGEID: a page read by pageid comes back under
 * its current title (a move renames it), a page that reads as a spell page joins, one that is
 * gone, a redirect or no spell page now leaves. A gone title (no pageid in the response) is
 * matched to the pageid that still holds that title.
 */
export function foldSpells(universe: Record<string, string>, pages: PageTexts, ids: PageIds): SpellFold {
  const titles = new Map(Object.entries(universe))
  const fold: SpellFold = { titles: {}, fresh: [], folded: [], removed: [] }
  const live = [...pages].filter(([, wt]) => wt != null) as [string, string][]
  for (const [title, wt] of live) {
    const pageid = ids.pageids.get(title)
    const revid = ids.revids.get(title)
    if (!pageid) continue
    if (isSpellPage(wt) && revid != null) {
      titles.set(String(pageid), title)
      fold.fresh.push({ pageid, title, content: wt, revid })
      fold.folded.push(title)
    } else if (titles.delete(String(pageid))) fold.removed.push(title)
  }
  for (const [title, wt] of pages) {
    const id = wt === null ? [...titles].find(([, t]) => t === title)?.[0] : undefined
    if (id === undefined) continue
    titles.delete(id)
    fold.removed.push(title)
  }
  fold.titles = Object.fromEntries(titles)
  return fold
}


/** scrape-spells.ts's parse phase over a universe; `text` is a page's wikitext or null. */
export function deriveSpells(
  titles: Record<string, string>,
  text: (pageid: number) => string | null
): { spells: SpellEntry[]; missing: number[] } {
  const spells: SpellEntry[] = []
  const missing: number[] = []
  for (const id of Object.keys(titles).map(Number).sort((a, b) => a - b)) {
    const wt = text(id)
    if (wt == null) {
      missing.push(id)
      continue
    }
    const fields = parseSpellpageFields(wt)
    if (Object.keys(fields).length) spells.push(parseSpell(titles[String(id)], fields))
  }
  spells.sort((a, b) => a.name.localeCompare(b.name))
  return { spells, missing }
}

export function spellFile(prev: SpellDbFile, spells: SpellEntry[], scrapedAt: string): SpellDbFile {
  return {
    scrapedAt,
    schema: prev.schema,
    count: spells.length,
    withEffects: spells.filter((s) => s.effects?.length).length,
    spells
  }
}

/** Names that left or joined the file, for the run log (a title rename shows as both). */
export function nameChanges(before: SpellEntry[], after: SpellEntry[]): { gone: string[]; added: string[] } {
  const tally = (list: SpellEntry[]): Map<string, number> => {
    const m = new Map<string, number>()
    for (const s of list) m.set(s.name, (m.get(s.name) ?? 0) + 1)
    return m
  }
  const a = tally(before)
  const b = tally(after)
  const diff = (x: Map<string, number>, y: Map<string, number>): string[] =>
    [...x].filter(([n, c]) => (y.get(n) ?? 0) < c).map(([n]) => n)
  return { gone: diff(a, b), added: diff(b, a) }
}

function writeAtomic(path: string, data: string): void {
  writeFileSync(`${path}.tmp`, data, 'utf8')
  renameSync(`${path}.tmp`, path)
}

const byPageid = (o: Record<string, unknown>): string[] => Object.keys(o).sort((a, b) => Number(a) - Number(b))

/**
 * The fresh pages into the cache the way scrape-spells.ts writes it (file per pageid, revid and
 * title in index.json, keys sorted by pageid), so its next run finds them current.
 */
export function writeSpellCache(dir: string, idx: SpellIndex, fold: SpellFold, now: string): void {
  mkdirSync(dir, { recursive: true })
  const revs = { ...idx.revs }
  for (const p of fold.fresh) {
    writeAtomic(join(dir, `${p.pageid}.wikitext`), p.content)
    revs[String(p.pageid)] = p.revid
  }
  const sortedRevs = Object.fromEntries(byPageid(revs).map((k) => [k, revs[k]]))
  const titles = Object.fromEntries(byPageid(fold.titles).map((k) => [k, fold.titles[k]]))
  const out = { updatedAt: now, revs: sortedRevs, titles }
  writeAtomic(join(dir, 'index.json'), JSON.stringify(out, null, 2) + '\n')
}
