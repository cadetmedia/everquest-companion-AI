// deltaItems.ts — scrape-delta.mts's item fold: changed pages over the committed items.json.
// Pure (no network, no files). Importing scrape-items.ts would run its main, so its three tiny
// page->record helpers are mirrored here; the real parsing is src/main/itemLookupParse.ts.

import { parseItemWikitext, templateField } from '../../src/main/itemLookupParse'
import { itemKey, type ItemDbEntry, type ItemDbFile } from '../../src/main/itemsDb'
import { pageNotices } from '../../src/shared/pageNotices'
import type { PageTexts } from './deltaPages'

// ---- mirrored from scripts/scrape-items.ts ----------------------------------------------------

export function isItemPage(wikitext: string): boolean {
  return /\{\{\s*Itempage\b/i.test(wikitext)
}

function displayName(wikitext: string, title: string): string | undefined {
  const raw = templateField(wikitext, 'itemname')?.replace(/\s+/g, ' ').trim()
  if (!raw || raw.length > 80) return undefined
  if (/[{}[\]|<>]/.test(raw)) return undefined
  return raw === title ? undefined : raw
}

function isEmptyValue(v: unknown): boolean {
  return v === undefined || v === false || (Array.isArray(v) && v.length === 0)
}

function toEntry(title: string, wikitext: string): ItemDbEntry | null {
  const parsed = parseItemWikitext(title, wikitext)
  const name = displayName(wikitext, title)
  // `{{DNE}}` / `{{delete}}` as scrape-items writes them: an edit that takes the notice off drops the field.
  const notices = pageNotices(wikitext)
  const full = { page: title, ...parsed, ...(name ? { name } : {}), ...(notices === undefined ? {} : { notices }) }
  const kept = Object.entries(full).filter(([, v]) => !isEmptyValue(v))
  const entry = Object.fromEntries(kept) as unknown as ItemDbEntry
  return Object.keys(entry).length > 1 ? entry : null
}

// ------------------------------------------------------------------------------------------------

/** A disambiguated title's base name, `Dimensional Hole (Item)` → `Dimensional Hole`, which the full
 *  scrape (scrape-items.ts `baseTitle`) files the page under too. */
function baseTitle(page: string): string | undefined {
  return /^(.+?)\s*\(Item\)$/i.exec(page)?.[1]
}

/** The keys a record registers: its page title, its `|itemname` and its `(Item)` base name. */
function entryKeys(entry: ItemDbEntry): string[] {
  const base = baseTitle(entry.page)
  const keys = [itemKey(entry.page), entry.name ? itemKey(entry.name) : null, base ? itemKey(base) : null]
  return keys.filter((k): k is string => !!k)
}

export interface ItemFold {
  items: Record<string, ItemDbEntry>
  /** the item pages folded */
  folded: string[]
  /** committed item pages that no longer read as an item */
  removed: string[]
  /** `|itemname`s whose key lost its last known claimant: fetch these titles and fold again */
  orphans: string[]
}

/**
 * Items: scrape-items.ts's key law, applied to a delta. A page's TITLE key is its own; an
 * `|itemname` alias takes a key only when no page has that title; the richer record wins only
 * between claimants of the same kind, ties to the first title in sort order. Every key a changed
 * page held or now names is re-awarded among ALL known claimants (the committed records plus the
 * changed pages), so an edited variant page (A Sealed Letter (Thex Dagger Quest), `|itemname`
 * "A Sealed Letter") never repoints the canonical page's key. Does not mutate `itemsFile`.
 */
export function foldItems(itemsFile: ItemDbFile, pages: PageTexts): ItemFold {
  const changed = changedEntries(pages)
  const items = new Map(Object.entries(itemsFile.items))
  // key -> its committed holder, for every key the change can move
  const affected = new Map<string, ItemDbEntry | undefined>()
  const pool = new Map<string, ItemDbEntry>()
  const removed = new Set<string>()
  for (const [k, prev] of items) {
    if (!changed.has(prev.page)) pool.set(prev.page, prev)
    else affected.set(k, prev)
    if (changed.get(prev.page) === null) removed.add(prev.page)
  }
  const entries = [...changed.values()].filter((e): e is ItemDbEntry => e !== null)
  for (const entry of entries) {
    pool.set(entry.page, entry)
    for (const k of entryKeys(entry)) if (!affected.has(k)) affected.set(k, items.get(k))
  }
  const orphans = award(items, affected, claimantsByKey(pool.values()))
  const folded = entries.map((e) => e.page)
  return { items: Object.fromEntries(items), folded, removed: [...removed], orphans }
}

/** Every read page: its record, or null when it is no item page now (gone, redirect, stub). */
function changedEntries(pages: PageTexts): Map<string, ItemDbEntry | null> {
  const changed = new Map<string, ItemDbEntry | null>()
  for (const [title, wt] of pages) {
    changed.set(title, wt != null && isItemPage(wt) ? toEntry(title, wt) : null)
  }
  return changed
}

/** Each affected key to its winning claimant; the `|itemname`s whose key found none. */
function award(
  items: Map<string, ItemDbEntry>,
  affected: Map<string, ItemDbEntry | undefined>,
  claimants: Map<string, ItemDbEntry[]>
): string[] {
  const orphans: string[] = []
  for (const [k, prev] of affected) {
    const holder = pickHolder(k, claimants.get(k) ?? [])
    if (holder) items.set(k, holder)
    else items.delete(k)
    if (!holder && prev?.name && itemKey(prev.name) === k) orphans.push(prev.name)
  }
  return orphans
}

function claimantsByKey(records: Iterable<ItemDbEntry>): Map<string, ItemDbEntry[]> {
  const out = new Map<string, ItemDbEntry[]>()
  for (const r of records) {
    for (const k of new Set(entryKeys(r))) out.set(k, [...(out.get(k) ?? []), r])
  }
  return out
}

const size = (e: ItemDbEntry): number => JSON.stringify(e).length

/** Title claimants first; then the richer record, ties to the first title in sort order. */
function pickHolder(k: string, claimants: ItemDbEntry[]): ItemDbEntry | undefined {
  const titled = claimants.filter((c) => itemKey(c.page) === k)
  const field = titled.length > 0 ? titled : claimants
  return [...field].sort((a, b) => size(b) - size(a) || a.page.localeCompare(b.page))[0]
}
