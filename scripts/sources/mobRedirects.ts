// Wiki redirects that land on a mob page, kept as that mob's `otherNames` in mobs.json: a name the
// wiki sends to a mob page (`Hoptor Thaggelum` -> `The Ghoul Lord`) is the same creature, so Gaps
// counts it known and lookups find it. Shared by scrape-mob-redirects and the delta.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

/** One redirect page and the page it sends to (the target's title, any `#section` dropped). */
export interface Redirect {
  from: string
  to: string
}

/** The fields of a mobs.json record this reads and writes. */
export interface NamedMob {
  page: string
  name: string
  otherNames?: string[]
}

/** `#REDIRECT [[Target#Section|label]]` -> `Target`, or null when the text is not a redirect. */
export function redirectTarget(wikitext: string): string | null {
  const m = /^\s*#REDIRECT\s*\[\[([^\]|#]+)/i.exec(wikitext)
  return m ? m[1].trim().replace(/_/g, ' ') : null
}

/**
 * Each mob's `otherNames` from the redirects that land on its page, sorted; a redirect that only
 * re-cases the mob's own name or page title adds nothing (lookups already fold case) and is left out.
 */
export function applyOtherNames(mobs: NamedMob[], redirects: readonly Redirect[]): void {
  const byPage = new Map<string, Set<string>>()
  for (const r of redirects) byPage.set(r.to, (byPage.get(r.to) ?? new Set<string>()).add(r.from))
  for (const m of mobs) {
    const own = new Set([m.name.toLowerCase(), m.page.toLowerCase()])
    const names = [...(byPage.get(m.page) ?? [])].filter((n) => !own.has(n.toLowerCase())).sort()
    if (names.length > 0) m.otherNames = names
    else delete m.otherNames
  }
}

/** The redirects the records already carry, so a delta can change a few and apply them all again. */
export function redirectsOf(mobs: readonly NamedMob[]): Redirect[] {
  return mobs.flatMap((m) => (m.otherNames ?? []).map((from) => ({ from, to: m.page })))
}

// ---- the cached list (owner, 2026-10-19: everything read from the wiki is cached) ----------------


/** Every ns0 redirect a full run listed, kept current by the delta: mobs.json re-derives offline. */
export interface RedirectCache {
  updatedAt: string
  redirects: Redirect[]
}

export function readRedirectCache(path: string): RedirectCache | null {
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8')) as RedirectCache
}

export function writeRedirectCache(path: string, redirects: readonly Redirect[]): void {
  mkdirSync(dirname(path), { recursive: true })
  const sorted = [...redirects].sort((a, b) => a.from.localeCompare(b.from))
  writeFileSync(path, JSON.stringify({ updatedAt: new Date().toISOString(), redirects: sorted }, null, 1))
}

/**
 * The cached list after the pages a delta read: each read page's old entry dropped, and the page
 * added again when it is a redirect now (`target` reads its text; null for none or no text).
 */
export function foldRedirectCache(cached: readonly Redirect[], pages: ReadonlyMap<string, string | null>): Redirect[] {
  const kept = cached.filter((r) => !pages.has(r.from))
  for (const [from, wt] of pages) {
    const to = wt == null ? null : redirectTarget(wt)
    if (to !== null) kept.push({ from, to })
  }
  return kept
}
