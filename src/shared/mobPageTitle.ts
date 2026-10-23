// mobPageTitle.ts — a mob's wiki page title, for the links Copy wiki page writes (owner, 2026-10-22:
// an item page linked `[[a fire drake]]`, the log's spelling, while the page is `A Fire Drake`; the
// link worked only through a redirect, and with none it would be red). MediaWiki titles are
// case-sensitive past the first letter, so the link takes the catalog's title. A name more than one
// page answers (`a bandit`, a page per zone) keeps the log's spelling: no page is more right.

import { gapMobKey as mobKey, perObject } from './gapMemo'

/** The catalog fields this reads; `otherNames` is absent on a branch without the redirects. */
interface TitledMob {
  name: string
  page: string
  otherNames?: readonly string[]
}

/** Every name a page answers to → its title, or null when several pages answer it. Once per catalog. */
const titles = perObject((catalog: readonly TitledMob[]): ReadonlyMap<string, string | null> => {
  const out = new Map<string, string | null>()
  for (const m of catalog) {
    for (const key of new Set([m.name, m.page, ...(m.otherNames ?? [])].map(mobKey))) {
      const had = out.get(key)
      out.set(key, had === undefined || had === m.page ? m.page : null)
    }
  }
  return out
})

/** A finder over one catalog: the page title for a name, or undefined to keep the name as written. */
export function mobPageFinder(catalog: readonly TitledMob[]): (name: string) => string | undefined {
  const map = titles(catalog)
  return (name) => map.get(mobKey(name)) ?? undefined
}
