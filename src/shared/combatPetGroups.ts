// PET GROUPS — the damage meter's third pet layout, "With its owner" (Malkil, 2026-10-20/21;
// docs/community/plans/2026-10-20-meter-pet-split.md). Each pet whose master is known shares a row
// with that master: the master on the first line, the pet beneath, both over one shared bar at the
// pair's length. Everything else stays a row of one.
//
// A LEVEL-1 PRESENTATION over the separate source list (`petRows.meterPanel` with combine off). It
// regroups rows the engine already attributed and re-ranks the groups; it never moves a point of
// damage between sources, so every number a row shows is the number that source already had.
//
// IN SHARED, NOT THE RENDERER, because pairing and ranking is list derivation over domain rows, which
// the renderer may not do (eslint.domainMunging.mjs). The renderer maps the finished rows to pixels.

import type { SourceView } from './combat'

/** The canonical roster key behind a `member:<key>` source id, or null for any other row. Both the
 *  `'member'` and the `'other'` kind carry this id shape (JOS-430) — one person, one row, whether
 *  or not the roster has learned their name yet. */
export function memberKeyOf(id: string): string | null {
  return id.startsWith('member:') ? id.slice('member:'.length) : null
}

/**
 * The CHARMER's canonical key behind an ally-pet row id (JOS-250). The id is
 * `allypet:<charmerKey>:<petKey>` — the charmer sits in the middle because the pet's own key may
 * itself contain a colon-free but space-bearing mob name, and because the ROW is about the person.
 */
export function charmerKeyOf(id: string): string | null {
  if (!id.startsWith('allypet:')) return null
  const rest = id.slice('allypet:'.length)
  const cut = rest.indexOf(':')
  return cut <= 0 ? null : rest.slice(0, cut)
}

/** One line of a group row: a source, the name it shows there, and its own bar width. */
export interface PetGroupLine {
  source: SourceView
  /** the source's name, or a paired ally pet's own name without the `Pet (…) - Owner` wrapper. */
  label: string
  /** this source's total against the top ROW's total, as a bar width (0..100). */
  pct: number
}

/** One level-1 row: the master (or a lone source) first, its pets beneath, ranked by damage. */
export interface PetGroupRow {
  /** the first line's source id. */
  id: string
  lines: PetGroupLine[]
  /** every line's damage; the row ranks on this. */
  total: number
  /** summed: every source in a segment divides by the same elapsed time, so the sum is exact. */
  dps: number
  /** the shared bar's width: this row's total against the top row's (0..100). */
  pct: number
}

/** The source id a pet's damage belongs with: your pet to your row, an ally pet to its charmer's. */
function masterIdOf(s: SourceView, sources: SourceView[], selfId: string | null): string | null {
  if (s.kind === 'pet') return selfId
  if (s.kind !== 'allyPet') return null
  const key = charmerKeyOf(s.id)
  if (key === null) return null
  const master = sources.find((m) => (m.kind === 'member' || m.kind === 'other') && memberKeyOf(m.id) === key)
  return master?.id ?? null
}

/**
 * A paired ally pet's own name. The engine names the row `Pet (<pet>) - <Charmer>`
 * (`routing.rs ally_pet_source`); beside its master that wrapper repeats what the row already says
 * (Malkil: "we already know it's a pet when it's on the same line as a player"). Only that exact
 * shape is unwrapped; anything else keeps its full name.
 */
export function pairedPetLabel(pet: SourceView, master: SourceView): string {
  if (pet.kind !== 'allyPet') return pet.name
  const head = 'Pet ('
  const tail = `) - ${master.name}`
  const n = pet.name
  const fits = n.startsWith(head) && n.length > head.length + tail.length
  return fits && n.slice(n.length - tail.length).toLowerCase() === tail.toLowerCase()
    ? n.slice(head.length, n.length - tail.length)
    : n
}

/**
 * The grouped level-1 list. A pet joins its master only when the master has a row in this list: an
 * unbound pet, or one whose master dealt nothing (or was scoped out), stays a row of its own with
 * its full name. Rows rank by their combined total; every bar width is against the top row.
 */
export function petGroupRows(sources: SourceView[]): PetGroupRow[] {
  const selfId = sources.find((s) => s.kind === 'you')?.id ?? null
  const petsOf = new Map<string, SourceView[]>()
  const paired = new Set<string>()
  for (const s of sources) {
    const master = masterIdOf(s, sources, selfId)
    if (master === null) continue
    petsOf.set(master, [...(petsOf.get(master) ?? []), s])
    paired.add(s.id)
  }
  const rows = sources
    .filter((s) => !paired.has(s.id))
    .map((lead) => {
      const pets = [...(petsOf.get(lead.id) ?? [])].sort((a, b) => b.total - a.total)
      const all = [lead, ...pets]
      return {
        lead,
        pets,
        total: all.reduce((n, s) => n + s.total, 0),
        dps: all.reduce((n, s) => n + s.dps, 0)
      }
    })
    .sort((a, b) => b.total - a.total)
  const top = Math.max(1, ...rows.map((r) => r.total))
  const width = (n: number): number => (n / top) * 100
  return rows.map((r) => ({
    id: r.lead.id,
    lines: [
      { source: r.lead, label: r.lead.name, pct: width(r.lead.total) },
      ...r.pets.map((p) => ({ source: p, label: pairedPetLabel(p, r.lead), pct: width(p.total) }))
    ],
    total: r.total,
    dps: r.dps,
    pct: width(r.total)
  }))
}
