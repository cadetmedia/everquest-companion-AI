// shared/gapExtraItems.ts — Items rows for items no log line names (owner, 2026-10-22: Petamorph
// Wand: Gelatinous Cube, bought from the in-game store, printed nothing, so the Gaps tab never saw
// it; "neither worked" for the export and the camera). Two witnesses:
//
//   HELD: the player's own inventory export (`/outputfile inventory`, the "I have it" read,
//   gapHeld.ts) names it, by the export's own spelling and slots (`GapHeld.exported`).
//   CAPTURED: a capture read its item window (capturedItemsStore.ts keeps the name).
//
// Either is a row only when the wiki data has no page for the name (main/gapUnknownItems.ts, the
// engine's check restated) and no row already names it: a looted item's row keeps its own chip
// ("held", gapHeld.ts). The rows have no zone; their kinds pass "Zone I'm in" (gaps.ts gapInZone).

import { itemTierKey } from './itemStats'
import type { GapHeld, HeldIndex } from './gapHeld'
import type { GapRow } from './gaps'

/** One item a witness names, before it is a row. */
export interface ExtraItem {
  name: string
  kind: 'held' | 'captured'
  /** When the witness saw it (ISO). */
  at: string
  count: number
  samples: string[]
}

/** An item window a capture read, kept by name. */
export interface CapturedItem {
  name: string
  at: string
}

const itemRowKeys = (rows: readonly GapRow[]): Set<string> => new Set(rows.filter((r) => r.domain === 'item').map((r) => itemTierKey(r.name)))

/** The export's names of the held items no Items row names: what main is asked about. */
export function heldCandidates(index: HeldIndex, rows: readonly GapRow[]): string[] {
  const named = itemRowKeys(rows)
  const out: string[] = []
  for (const [key, holders] of index) {
    const name = holders.find((h) => h.exported !== undefined)?.exported?.name
    if (name !== undefined && !named.has(key)) out.push(name)
  }
  return out.sort((a, b) => a.localeCompare(b))
}

/** `2026-10-22 20:49:00`, the log's stamp shape, in local time. */
export function logStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${String(d.getFullYear())}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** One holder's line in the row's details: who, where, and which export. */
const holderLine = (h: GapHeld): string =>
  `${h.who ?? 'You'}: ${h.total.toString()} in ${(h.exported?.slots ?? []).join(', ')} (inventory export ${logStamp(h.exportedAt)})`

/** The held items the wiki data has no page for (`unknown`, the export's spellings). */
export function heldExtras(index: HeldIndex, unknown: ReadonlySet<string>): ExtraItem[] {
  const out: ExtraItem[] = []
  for (const holders of index.values()) {
    const name = holders.find((h) => h.exported !== undefined)?.exported?.name
    if (name === undefined || !unknown.has(name)) continue
    const at = holders.map((h) => h.exportedAt).sort().at(-1) ?? ''
    out.push({ name, kind: 'held', at, count: holders.reduce((n, h) => n + h.total, 0), samples: holders.map(holderLine) })
  }
  return out
}

/** The captured items, as witnesses. */
export function capturedExtras(items: readonly CapturedItem[]): ExtraItem[] {
  return items.map((c) => ({ name: c.name, kind: 'captured' as const, at: c.at, count: 1, samples: [`Item window captured ${logStamp(c.at)}`] }))
}

/** One Items row per item, its witnesses joined; none for an item a row already names. */
export function extraItemRows(extras: readonly ExtraItem[], rows: readonly GapRow[]): GapRow[] {
  const named = itemRowKeys(rows)
  const byKey = new Map<string, ExtraItem[]>()
  for (const e of extras) {
    const key = itemTierKey(e.name)
    if (!named.has(key)) byKey.set(key, [...(byKey.get(key) ?? []), e])
  }
  return [...byKey.values()].map((group) => {
    const ats = group.map((e) => e.at).sort()
    const held = group.find((e) => e.kind === 'held')
    return {
      domain: 'item',
      name: (held ?? group[0]).name,
      kinds: [...new Set(group.map((e) => e.kind))].sort(),
      count: held?.count ?? 1,
      first: logStamp(ats[0] ?? ''),
      last: logStamp(ats.at(-1) ?? ''),
      details: { samples: group.flatMap((e) => e.samples) }
    }
  })
}

/** The snapshot with the extra rows after the engine's, the Items total counting them. */
export function withExtraItemRows<S extends { rows: GapRow[]; totals: Record<string, number> }>(snap: S, extra: readonly GapRow[]): S {
  if (extra.length === 0) return snap
  return { ...snap, rows: [...snap.rows, ...extra], totals: { ...snap.totals, item: (snap.totals.item ?? 0) + extra.length } }
}

/** The kept captured items, read back from storage; anything malformed dropped. */
export function capturedItemsOf(parsed: unknown): CapturedItem[] {
  return Array.isArray(parsed) ? (parsed as Partial<CapturedItem>[]).filter((c): c is CapturedItem => typeof c?.name === 'string' && typeof c.at === 'string') : []
}

/** The list with `name` kept at `at` (a second capture of it only moves its time), the newest `keep`. */
export function withCapturedItem(items: readonly CapturedItem[], name: string, at: string, keep: number): CapturedItem[] {
  return [...items.filter((c) => c.name.toLowerCase() !== name.toLowerCase()), { name, at }].slice(-keep)
}
