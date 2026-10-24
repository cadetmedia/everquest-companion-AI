// shared/gapZoneRedirects.ts — the Zones domain: a zone the log names under a spelling that is not its
// wiki page (owner, 2026-10-23: "you don't create the page, i'll create it, but make sure the APP gives
// me the details in the companion app so I can COPY it"). The log says `EverQuest Legends Tutorial`; the
// wiki's page is Tutorial Zone. A row's Copy gives `#REDIRECT [[Tutorial Zone]]` and its editor opens the
// new page under the log's spelling (the Items and Spells `suggest` path). The app never edits the wiki.
//
// Suggested only when sure: the target is an alias's page (gapWikiZone.ts `zoneRedirectTarget`, checked
// by hand), and the log's spelling is no zone the mob catalog links (a page by that name exists then).

import type { GapRow, GapsSnap } from './gaps'
import { zoneBaseName, zoneRedirectTarget } from './gapWikiZone'
import { zoneKey } from './zones'

interface Seen {
  name: string
  n: number
  raws: Map<string, number>
  first: string
  last: string
}

/** Every zone the rows were named in, by the log's spelling, with how often and when. */
function zonesOfRows(rows: readonly GapRow[]): Map<string, Seen> {
  const out = new Map<string, Seen>()
  for (const r of rows) {
    for (const e of r.domain === 'zone' ? [] : (r.details.zones?.entries ?? [])) {
      const key = zoneKey(e.name)
      const s = out.get(key) ?? { name: zoneBaseName(e.name), n: 0, raws: new Map<string, number>(), first: r.first, last: r.last }
      s.n += e.n
      s.raws.set(e.name, (s.raws.get(e.name) ?? 0) + e.n)
      if (r.first !== '' && (s.first === '' || r.first < s.first)) s.first = r.first
      if (r.last > s.last) s.last = r.last
      out.set(key, s)
    }
  }
  return out
}

function zoneRow(s: Seen, page: string): GapRow {
  const entries = [...s.raws].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n)
  const details = { samples: [], zones: { entries: entries.slice(0, 8), distinct: entries.length, all: entries.map((e) => e.name) } }
  return { domain: 'zone', name: s.name, kinds: ['entered'], count: s.n, first: s.first, last: s.last, details, suggest: { name: s.name, page, distance: 0 } }
}

/**
 * The snapshot with its Zones rows: each zone spelling the log printed that a sure alias sends to another
 * page. `catalogZones`: the zone spellings the mob catalog links, keyed by `zoneKey` (a page exists).
 */
export function withZoneRedirects<S extends GapsSnap>(snap: S, catalogZones: ReadonlySet<string>): S {
  const zones = zonesOfRows(snap.rows)
  const rows = [...zones].flatMap(([key, s]) => {
    const page = catalogZones.has(key) ? undefined : zoneRedirectTarget(s.name)
    return page === undefined ? [] : [zoneRow(s, page)]
  })
  const others = snap.rows.filter((r) => r.domain !== 'zone')
  return { ...snap, rows: [...others, ...rows], totals: { ...snap.totals, zone: rows.length }, seen: { ...snap.seen, zone: zones.size } }
}
