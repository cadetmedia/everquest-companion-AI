// shared/gapFactions.ts — factions a kill moved that the mob's wiki page does not name (owner ask,
// 2026-10-18). The engine pairs each kill with the faction lines printed just before it
// (gaps_trade.rs, `killFactions`); this checks each pair against the `factions` every catalog page
// of that mob's name lists (mobs.json, `|factions` and `|opposing_factions`). A mob the catalog
// does not have at all gets its pairs here too (owner, 2026-10-20: Basher Dreg, a page newer than the
// data, "i dont' want to type them"): its mob heading's Copy lines gives every faction line at once.
//
// A LISTED FACTION IS A ROW TOO WHEN THE LOG CONTRADICTS IT (owner, 2026-10-20: "we need to fix
// factions too, not just add missing ones"): the page's amount (mobs.json `factionAmounts`,
// shared/mobFactionAmounts.ts) is on the other side, misses the log's amount, states none while the
// log states one, or is marked a guess the log settles. "Exceptions of course when we are MAX faction
// one way or the other": a capped line states no amount, so it can only contradict a side.

import type { GapRow, GapsSnap } from './gaps'
import type { KillMap } from './kills'
import { spanStamps, widen, type Span } from './gapTimes'
import { pagesByMob, pickPage } from './gapMobPage'
import { gapMobKey as mobKey, memoFold, perObject } from './gapMemo'
import type { MobEntry } from './mobTypes'
import { decodeFactionAmount } from './mobFactionAmounts'

/** A catalog record as this reads it; `otherNames` and `factions` are absent on a branch without them. */
type CatalogMob = Pick<MobEntry, 'name' | 'page' | 'zones'> & { otherNames?: string[]; factions?: string[]; factionAmounts?: string[] }

/** What a listed faction needs: its amount, its side, or the guess mark settled. */
export type FactionFix = 'amount' | 'side' | 'confirm'

/** One kill and a faction its lines moved, how often, and the zone last seen in. */
export interface KillFaction {
  mob: string
  faction: string
  n: number
  zone: string
  /** the amount most of its lines stated (`-30`); absent when only capped lines were seen */
  adjust?: number
  /** whether the kill raised it: the amount's sign, or a capped line's "better" (true) / "worse" (false) */
  raised?: boolean
  /**
   * The proof (owner, 2026-10-20: "how do I know it has Grobb Merchants?"): the last kills' raw log
   * lines, oldest first, each kill its faction line then its death line, stamps kept. Absent when none.
   */
  samples?: string[]
}

/**
 * The log and the wiki spell some factions apart: `Solusek Mining Co.` / `Solusek Mining Co`, `the
 * Ebon Mask`, `Opal Darkbriar` / `Opal Dark Briar`, `King Ak'Anon (Faction)`. Case, a leading
 * "the", a trailing "(Faction)" and everything but letters and digits are folded away. Remembered
 * per spelling (perf audit, 2026-10-20: gapMemo.ts), since every page's every faction is folded.
 */
export const factionKey = memoFold((name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/\s*\(faction\)\s*$/, '')
    .replace(/^the /, '')
    .replace(/[^a-z0-9]/g, '')
)

/**
 * Every catalog name (its `|name`, page title and wiki redirects) → each faction its pages list → what
 * each page says of it. Built once per catalog (perf audit, 2026-10-20: gapMemo.ts), so read-only.
 */
const factionsByMob = perObject((catalog: readonly CatalogMob[]): ReadonlyMap<string, ReadonlyMap<string, readonly string[]>> => {
  const out = new Map<string, Map<string, string[]>>()
  for (const m of catalog) {
    for (const name of [m.name, m.page, ...(m.otherNames ?? [])]) {
      const listed = out.get(mobKey(name)) ?? new Map<string, string[]>()
      ;(m.factions ?? []).forEach((f, i) => {
        const said = m.factionAmounts?.[i]
        listed.set(factionKey(f), [...(listed.get(factionKey(f)) ?? []), ...(said === undefined ? [] : [said])])
      })
      out.set(mobKey(name), listed)
    }
  }
  return out
})

/** What one page's statement of a faction lacks against the log's pair; null when it agrees. */
function fixOf(said: string, p: Pick<KillFaction, 'adjust' | 'raised'>): FactionFix | null {
  const hit = decodeFactionAmount(said)
  const raised = p.adjust !== undefined ? p.adjust > 0 : p.raised
  if (raised !== undefined && (hit.side === 'raises') !== raised) return 'side'
  // A capped line (max or min standing) states no amount: only the side can be wrong.
  if (p.adjust === undefined) return null
  if (hit.min === undefined || hit.max === undefined || p.adjust < hit.min || p.adjust > hit.max) return 'amount'
  return hit.unconfirmed === true ? 'confirm' : null
}

/**
 * The fix a listed faction needs, and what its pages say; null when any page agrees with the log or
 * no page states anything (a branch without `factionAmounts`).
 */
export function factionFix(saids: readonly string[], p: Pick<KillFaction, 'adjust' | 'raised'>): { fix: FactionFix; pageSays: string } | null {
  if (saids.length === 0) return null
  const fixes = saids.map((s) => fixOf(s, p))
  if (fixes.some((f) => f === null)) return null
  return { fix: fixes[0] ?? 'amount', pageSays: saids[0] ?? '' }
}

/** One pair as its row: where it goes, when the mob was killed, what to fix, whether the data has its page. */
function factionRow(
  p: KillFaction,
  on: { page: string | undefined; span: Span | undefined; fix: ReturnType<typeof factionFix> | undefined; noPage: boolean }
): GapRow {
  return {
    domain: 'faction',
    name: `${p.faction} (${p.mob})`,
    kinds: ['killed'],
    count: p.n,
    ...spanStamps(on.span),
    details: {
      samples: p.samples ?? [],
      sources: { entries: [{ name: p.mob, n: p.n }], distinct: 1 },
      ...(p.zone === '' ? {} : { zones: { entries: [{ name: p.zone, n: p.n }], distinct: 1, all: [p.zone] } })
    },
    ...(on.page === undefined ? {} : { page: on.page }),
    ...(on.fix ?? {}),
    ...(on.noPage ? { noPage: true as const } : {}),
    ...(p.adjust === undefined ? {} : { adjust: p.adjust }),
    ...(p.raised === undefined ? {} : { raised: p.raised })
  }
}

/** The pairs no page of the mob's name lists, or lists as the log contradicts, as Gaps rows: `Clurg (a goblin)`, most seen first. */
export function factionGaps(pairs: readonly KillFaction[], catalog: readonly CatalogMob[], kills: KillMap = {}): GapRow[] {
  // First and Last are the mob's first and last kill: the faction moves on its kills.
  const spans = new Map<string, Span | undefined>(Object.values(kills).map((k) => [mobKey(k.display), widen(widen(undefined, k.firstTs), k.lastTs)]))
  const listed = factionsByMob(catalog)
  const pages = pagesByMob(catalog)
  const rows: GapRow[] = []
  for (const p of pairs) {
    const known = listed.get(mobKey(p.mob))
    const saids = known?.get(factionKey(p.faction))
    const fix = saids === undefined ? undefined : factionFix(saids, p)
    if (fix === null) continue
    rows.push(factionRow(p, { page: pickPage(pages.get(mobKey(p.mob)), p.zone), span: spans.get(mobKey(p.mob)), fix, noPage: known === undefined }))
  }
  return rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** The served snapshot with the faction rows joined in and counted, so the tab treats them as a domain. */
export function withFactionRows(snap: GapsSnap, catalog: readonly CatalogMob[], kills: KillMap = {}): GapsSnap {
  const rows = factionGaps(snap.killFactions ?? [], catalog, kills)
  return { ...snap, rows: [...snap.rows, ...rows], totals: { ...snap.totals, faction: rows.length } }
}
