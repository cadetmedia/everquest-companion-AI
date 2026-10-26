// shared/gapRespawns.ts — the Respawns domain: mob pages whose `|respawn_time` the player's own kills
// can fill or correct (owner, 2026-10-25; the number is shared/respawnLearn.ts's).
//
// A row is a mob the wiki data has a page for, whose kills agree on a respawn (respawnLearn's rules)
// and whose page states none, or states one more than 25 s away from it (Enynti's page said 22
// minutes; 31 kills in the owner's Castle of Mistmoore 4 camps say 8:50). A page that agrees is not a
// row, nor is one whose text is not a duration ("Triggered", "6-8 hours", a time per zone): the page
// states something the log cannot overrule, and the app suggests only what the log shows a page lacks
// (owner, 2026-10-21). A placeholder ("?", "Unknown") states nothing. A mob with no page is a Mobs row already, and its Copy wiki page carries the respawn too
// (`withRespawnField`).

import type { GapAction, GapRow } from './gaps'
import { wikiEditUrl } from './gapUrls'
import { mobPageFinder } from './mobPageTitle'
import { AGREES_MS, constantRespawn, RULE_WORDS, verdictFor, wikiRespawnText, type LearnedEvidence, type RespawnVerdict } from './respawnLearn'

/** A catalog record as the page finder reads it. */
type TitledMob = Parameters<typeof mobPageFinder>[0][number]

/** What a row carries of its respawn: the number, the text the page takes, and what it stands on. */
export interface RespawnFact {
  ms: number
  text: string
  samples: number
  agree: number
  rule: RespawnVerdict['rule']
  /** The page's own text, when it states one. */
  pageSays?: string
}

const factOf = (v: RespawnVerdict, pageSays?: string): RespawnFact => ({
  ms: v.ms,
  text: wikiRespawnText(v.ms),
  samples: v.samples,
  agree: v.agree,
  rule: v.rule,
  ...(pageSays === undefined ? {} : { pageSays })
})

/** The row's details line: what the kills say and why the number is that one. */
export function respawnLine(f: RespawnFact): string {
  const said = f.pageSays === undefined ? 'the page states no respawn' : `the page says ${f.pageSays}`
  return `Your kills: ${f.text} (${String(f.agree)} of ${String(f.samples)} gaps ${RULE_WORDS[f.rule]}); ${said}.`
}

/** A Respawns row's chip: set the page's respawn_time to what the kills agree on. */
export function respawnAction(row: GapRow): GapAction {
  const f = row.respawn
  const why = f === undefined ? 'Set the page respawn_time.' : `${respawnLine(f)} Set |respawn_time = ${f.text}.`
  return { kind: 'checkWiki', label: f?.pageSays === undefined ? 'Add respawn' : 'Fix respawn', why, href: wikiEditUrl(row.page ?? row.name) }
}

/** A page's `|respawn_time` that holds no statement. */
const STATES_NOTHING = /^\s*(\?*|unknown\??)\s*$/i

/** The page lacks what the kills say: no respawn, a placeholder, or a duration more than 25 s off (header). */
function pageLacks(e: LearnedEvidence, v: RespawnVerdict): boolean {
  if (e.wikiMs !== undefined) return Math.abs(e.wikiMs - v.ms) > AGREES_MS
  return e.wikiText === undefined || STATES_NOTHING.test(e.wikiText)
}

/** The Respawns rows: one per mob page the kills can fill or correct, most evidence first. */
export function respawnGaps(learned: readonly LearnedEvidence[], catalog: readonly TitledMob[]): GapRow[] {
  const pageOf = mobPageFinder(catalog)
  // One verdict per page, the zone (or tier) with the most agreeing gaps (as `verdictFor`), and only
  // that one is compared with the page: a few odd gaps elsewhere do not outvote it.
  const byPage = new Map<string, { e: LearnedEvidence; v: RespawnVerdict }>()
  for (const e of learned) {
    const v = constantRespawn(e.gapsMs, e.display)
    if (v === null) continue
    const page = pageOf(e.display) ?? (e.wikiPage === undefined ? undefined : pageOf(e.wikiPage))
    if (page === undefined) continue
    if ((byPage.get(page)?.v.agree ?? -1) >= v.agree) continue
    byPage.set(page, { e, v })
  }
  return [...byPage]
    .filter(([, { e, v }]) => pageLacks(e, v))
    .map(([page, { e, v }]) => respawnRow(page, e, v))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

function respawnRow(page: string, e: LearnedEvidence, v: RespawnVerdict): GapRow {
  // A placeholder states nothing: the row reads and acts as a page with no respawn.
  const fact = factOf(v, e.wikiText === undefined || STATES_NOTHING.test(e.wikiText) ? undefined : e.wikiText)
  return {
    domain: 'respawn',
    name: e.display,
    page,
    kinds: ['killed'],
    count: v.samples,
    first: '',
    last: '',
    respawn: fact,
    details: {
      samples: [respawnLine(fact)],
      sources: { entries: [{ name: page, n: v.samples }], distinct: 1 },
      zones: { entries: [{ name: e.zone, n: v.samples }], distinct: 1, all: [e.zone] }
    }
  }
}

/** A Mobs row (a mob with no page) with the respawn its kills agree on, for its new page. */
export function withLearnedRespawn(row: GapRow, learned: readonly LearnedEvidence[]): GapRow {
  if (row.domain !== 'mob' || row.respawn !== undefined) return row
  const best = verdictFor(learned, row.name.trim().toLowerCase())
  return best === null ? row : { ...row, respawn: factOf(best.verdict) }
}

/** A new mob page with `|respawn_time` filled when the row carries one and the field is blank. */
export function withRespawnField(page: string, row: GapRow): string {
  const text = row.respawn?.text
  if (text === undefined) return page
  const key = 'respawn_time'.padEnd(17)
  return page.replace(`| ${key} = \n`, `| ${key} = ${text}\n`)
}

/** The served snapshot with the Respawns rows joined and counted, and Mobs rows given their respawn. */
export function withRespawnRows<S extends { rows: GapRow[]; totals: Record<string, number> }>(
  snap: S,
  learned: readonly LearnedEvidence[],
  catalog: readonly TitledMob[]
): S {
  if (learned.length === 0) return snap
  const rows = respawnGaps(learned, catalog)
  const mobs = snap.rows.map((r) => withLearnedRespawn(r, learned))
  return { ...snap, rows: [...mobs, ...rows], totals: { ...snap.totals, respawn: rows.length } }
}
