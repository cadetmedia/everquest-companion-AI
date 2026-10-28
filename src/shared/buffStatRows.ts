// buffStatRows.ts — the Buffs tab's Durations table rows: one class, matching the search, each with
// the record key it is stored under.
//
// Moved out of the renderer (BuffStats.tsx) when fork issue #4 needed the key on each row for the
// duration dialog: a filter and a sort over a shared type are domain logic, and they live here
// (the `eqc/no-domain-munging` ruling). Plain substring, case-insensitive; sorted by sample count,
// then name.

import type { BuffClass, BuffStat } from './buffTypes'

/** A spell line's key (the stats record's own key) with its row. */
export interface KeyedBuffStat {
  key: string
  s: BuffStat
}

/** The rows of one class whose name contains `needle` (already lower-cased; '' matches all). */
export function buffStatRows(stats: Record<string, BuffStat>, cls: BuffClass, needle: string): KeyedBuffStat[] {
  return Object.entries(stats)
    .map(([key, s]) => ({ key, s }))
    .filter(({ s }) => s.cls === cls && (needle === '' || s.spell.toLowerCase().includes(needle)))
    .sort((a, b) => b.s.n - a.s.n || a.s.spell.localeCompare(b.s.spell))
}
