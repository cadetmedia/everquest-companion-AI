// spellCastBy.ts — who casts an NPC-only spell, for its wiki page (owner, 2026-10-25: "why do the
// spells not say which NPC's use them?"). The wiki has no field for it; editors write the casters
// into the description, `Cast by [[Trakanon]].` (63 of the 343 cached NPC-only pages, 52 of them in
// `| description =`). A Gaps spell row knows its casters from the log (`details.casters`), most-seen
// first, so the page says the same in the same words.

import type { GapRow } from './gaps'

/** At most this many casters are named; the rest read "and others", as the wiki's own pages do. */
const MAX_NAMED = 5

/** `[[Trakanon]]`, or the name as plain text when the catalog has no page for it. */
function casterLink(name: string, isMob?: (name: string) => boolean): string {
  return isMob?.(name) === true ? `[[${name}]]` : name
}

/** `a, b and c`. */
function listed(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`
}

/** `Cast by [[The Game Master]].`, the casters the log saw, most-seen first; none when it saw none. */
export function castBySentence(row: GapRow, isMob?: (name: string) => boolean): string | undefined {
  const names = (row.details.casters?.entries ?? []).map((c) => c.name)
  if (names.length === 0) return undefined
  const shown = names.slice(0, MAX_NAMED).map((n) => casterLink(n, isMob))
  const more = names.length > MAX_NAMED ? [...shown, 'others'] : shown
  return `Cast by ${listed(more)}.`
}

/** The description line with the casters after what it already says: `| description = X Cast by [[Y]].` */
export function withCastBy(line: string | undefined, castBy: string | undefined): string | undefined {
  if (castBy === undefined) return line
  const said = line === undefined ? '' : line.replace(/^\| description =\s*/, '').trim()
  return `| description = ${said === '' ? castBy : `${said} ${castBy}`}`
}
