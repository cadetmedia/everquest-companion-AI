// shared/gapRespawns.ts — the Respawns domain: mob pages whose `|respawn_time` the player's own kills
// can fill or correct (owner, 2026-10-25; the number is shared/respawnLearn.ts's).
//
// A row is a mob the wiki data has a page for, whose kills agree on a respawn (respawnLearn's rules)
// and whose page states none, or states one more than 25 s away from it (Enynti's page said 22
// minutes; 31 kills in the owner's Castle of Mistmoore 4 camps say 8:50). A page that agrees is not a
// row. A placeholder ("?", "Unknown") states nothing. A page whose text is words, not a duration
// ("Triggered", "6-8 hours", a time per zone, a hedged "6 min?"), is a row whose chip WARNS rather
// than fixes (owner 2026-10-26: "can we just warn the user in the chips ?"): the words may state what
// one number from kills cannot (a triggered spawn, a range, a time per zone). Its Copy keeps the
// words in a comment beside the number (`respawnFieldLine`). A mob with no page is a Mobs row
// already, and its Copy wiki page carries the respawn too (`withRespawnField`).

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
  /** The page's text is words, not a duration (header): the chip warns. */
  words?: true
}

const factOf = (v: RespawnVerdict, pageSays?: string, words = false): RespawnFact => ({
  ms: v.ms,
  text: wikiRespawnText(v.ms),
  samples: v.samples,
  agree: v.agree,
  rule: v.rule,
  ...(pageSays === undefined ? {} : { pageSays }),
  ...(words ? { words: true as const } : {})
})

const killsSay = (f: RespawnFact): string => `${f.text} (${String(f.agree)} of ${String(f.samples)} gaps ${RULE_WORDS[f.rule]})`

/** The row's details line: what the kills say and why the number is that one. */
export function respawnLine(f: RespawnFact): string {
  if (f.words === true) return `The page says "${f.pageSays ?? ''}"; your kills say ${killsSay(f)}. Check before changing it: Copy keeps the page's words in a comment.`
  const said = f.pageSays === undefined ? 'the page states no respawn' : `the page says ${f.pageSays}`
  return `Your kills: ${killsSay(f)}; ${said}.`
}

/** A Respawns row's chip: set the page's respawn_time to what the kills agree on, or, over words, check first. */
export function respawnAction(row: GapRow): GapAction {
  const f = row.respawn
  const href = wikiEditUrl(row.page ?? row.name)
  if (f?.words === true) return { kind: 'checkWiki', label: 'Check respawn', why: respawnLine(f), href, warn: true }
  const why = f === undefined ? 'Set the page respawn_time.' : `${respawnLine(f)} Set |respawn_time = ${f.text}.`
  return { kind: 'checkWiki', label: f?.pageSays === undefined ? 'Add respawn' : 'Fix respawn', why, href }
}

/**
 * A Respawns row's field line for Copy wiki page: the number the kills agree on. Over words, the
 * page's words stay beside it in a wiki comment, so a paste loses nothing and the edit box shows them.
 */
export function respawnFieldLine(row: GapRow): string {
  const f = row.respawn
  const kept = f?.words === true ? ` <!-- the page said: ${(f.pageSays ?? '').split('-->').join('')} -->` : ''
  return `| ${'respawn_time'.padEnd(17)} = ${f?.text ?? ''}${kept}\n`
}

/** A page's `|respawn_time` that holds no statement. */
const STATES_NOTHING = /^\s*(\?*|unknown\??)\s*$/i

/** The page states nothing: no respawn_time, or a placeholder. */
const statesNothing = (e: LearnedEvidence): boolean => e.wikiText === undefined || STATES_NOTHING.test(e.wikiText)

/** A row unless the page states a duration within 25 s of the kills' (header). */
function makesRow(e: LearnedEvidence, v: RespawnVerdict): boolean {
  return e.wikiMs === undefined || Math.abs(e.wikiMs - v.ms) > AGREES_MS
}

/** The Respawns rows: one per mob page the kills can fill or correct, most evidence first. */
export function respawnGaps(learned: readonly LearnedEvidence[], catalog: readonly TitledMob[]): GapRow[] {
  const pageOf = mobPageFinder(catalog)
  // One verdict per page, the zone (or tier) with the most agreeing gaps (as `verdictFor`), and only
  // that one is compared with the page: a few odd gaps elsewhere do not outvote it.
  const byPage = new Map<string, { e: LearnedEvidence; v: RespawnVerdict }>()
  for (const e of learned) {
    const v = constantRespawn(e.gapsMs)
    if (v === null) continue
    const page = pageOf(e.display) ?? (e.wikiPage === undefined ? undefined : pageOf(e.wikiPage))
    if (page === undefined) continue
    if ((byPage.get(page)?.v.agree ?? -1) >= v.agree) continue
    byPage.set(page, { e, v })
  }
  return [...byPage]
    .filter(([, { e, v }]) => makesRow(e, v))
    .map(([page, { e, v }]) => respawnRow(page, e, v))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

function respawnRow(page: string, e: LearnedEvidence, v: RespawnVerdict): GapRow {
  // A placeholder states nothing: the row reads and acts as a page with no respawn. Text that is no duration is words.
  const fact = statesNothing(e) ? factOf(v) : factOf(v, e.wikiText, e.wikiMs === undefined)
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
