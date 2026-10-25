// shared/gapHeld.ts — "you're holding it" on an Items gap row (review C6; owner, 2026-10-19): an
// item the wiki lacks that the player holds right now needs no trip, only a screenshot of its window.
//
// TWO WITNESSES, THE POSKY RECONCILE'S (inventory/reconcile.ts): the inventory export the player
// last wrote (`/outputfile inventory`, folded by planner/ownership.ts and served as the Gear tab's
// `gearOwnership` payload) says where each copy was then; the loot the log kept after that instant
// (`computeHeldCountsAfter`, gross) has landed in the bags since, and the destroys after it come
// off. With no export there is no claim: a loot line alone cannot tell a copy still held from one
// sold to a merchant last week.
//
// One item at any tier (`+N` folds to the base, case folded): the key is `itemTierKey`, which IS the
// ownership index's key and the loot counting key (ownership.ts pins the three together). An
// `(Exaltation)` row is the gem socketed into another item, not a copy (gearOwnership.ts rule 2).
//
// ONLY A CHARACTER'S OWN EXPORT (owner, 2026-10-19). The Gear tab's read falls back to the newest
// export of ANY character when this one has none, so a fresh character showed another's items as
// held; `isOwnExport` refuses that file here. With All characters on, each holder is named ("held
// by Drywrought"), each from that character's own export and loot.

import { itemTierKey } from './itemStats'
import { atTiers, heldTiers, lowTier } from './gapHeldTier'
import { visibleGaps, type GapRow } from './gaps'
import type { OwnershipEntry, OwnershipPlace } from './planner/ownership'

/** One place and how many copies it holds. */
export interface HeldPart {
  label: string
  count: number
  place: OwnershipPlace
}

/** What one character holds of one item: in all, and by place. */
export interface GapHeld {
  total: number
  parts: HeldPart[]
  /** The export's own instant (ISO), for the chip's tooltip. */
  exportedAt: string
  /** The holder's name; absent for the attached character in the one-character view ("You"). */
  who?: string
  /**
   * What the export itself says: the item's name as it spells it and the slots it fills
   * (`General 6-Slot3`). Absent for an item only the loot since the export shows. An item the log
   * never names (a store purchase) is known by these alone (owner, 2026-10-22: Petamorph Wand:
   * Gelatinous Cube).
   */
  exported?: { name: string; slots: string[] }
  /**
   * The ` +N` tiers of the copies, lowest first, only when none is the +0 the page needs (owner,
   * 2026-10-25: "held by <playername> is useless if we need the +0 version and i have the +4");
   * absent when a +0 copy is held or a copy's tier is unknown (read as +0, as before).
   */
  tiers?: number[]
  /** Not the item's first holder: its details line is a short "Also on <who>" (owner, 2026-10-21: "just the character they are on and a 'also on Kaltinril'"). */
  also?: true
}

/** Every holder of each item, keyed by `itemTierKey`. */
export type HeldIndex = ReadonlyMap<string, readonly GapHeld[]>

/** Is the export at `path` this character's own (`Name_server-Inventory.txt`), not another's fallback? */
export function isOwnExport(path: string | null, name: string, server: string): boolean {
  const file = (path ?? '').split(/[\\/]/).pop()?.toLowerCase() ?? ''
  return file.startsWith(`${name}_${server}-`.toLowerCase())
}

/** The words for a place, in the order a player looks (on you, your bags, then the stores). */
const PLACE_WORD: Record<OwnershipPlace, string> = {
  equipped: 'worn',
  inventory: 'bags',
  bank: 'bank',
  sharedBank: 'shared bank',
  personalDepot: 'depot',
  keyring: 'keyring',
  unknown: 'unfiled'
}
const PLACE_ORDER = Object.keys(PLACE_WORD) as OwnershipPlace[]
/** Where a destroyed copy most likely came from: the bags, then the rest in reading order. */
const DESTROY_ORDER: OwnershipPlace[] = ['inventory', ...PLACE_ORDER.filter((p) => p !== 'inventory')]

type Counts = Map<OwnershipPlace, number>

/** The export's copies of one item by place, exaltation rows left out. */
function dumpCounts(rows: OwnershipEntry[1]): Counts {
  const by: Counts = new Map()
  for (const r of rows) if (!r.exaltation) by.set(r.place, (by.get(r.place) ?? 0) + r.count)
  return by
}

/** The export's own spelling of an item and its slots, exaltation rows left out; none when it lists only those. */
function exportedOf(rows: OwnershipEntry[1]): { name: string; slots: string[] }[] {
  const own = rows.filter((r) => !r.exaltation)
  if (own.length === 0) return []
  return [{ name: own[0].name, slots: [...new Set(own.map((r) => r.location || r.place))] }]
}

/** Take `n` destroyed copies off, bags first. */
function takeOff(by: Counts, n: number): void {
  let left = n
  for (const p of DESTROY_ORDER) {
    const off = Math.min(by.get(p) ?? 0, left)
    by.set(p, (by.get(p) ?? 0) - off)
    left -= off
  }
}

/**
 * Every item the player holds, keyed by `itemTierKey`. `lootSince` and `destroyedSince` are the
 * log's folds after the export's instant, on the same key (posky/heldCounts.ts); a looted copy is
 * in the bags. No export, no index.
 */
export function heldIndex(
  dump: { entries: readonly OwnershipEntry[]; loadedAt: string | null },
  lootSince: Readonly<Record<string, number>>,
  destroyedSince: Readonly<Record<string, number>> = {},
  who?: string
): HeldIndex {
  const out = new Map<string, GapHeld[]>()
  if (dump.loadedAt === null) return out
  const byKey = new Map<string, Counts>(dump.entries.map(([key, rows]) => [itemTierKey(key), dumpCounts(rows)]))
  const named = new Map(dump.entries.flatMap(([key, rows]) => exportedOf(rows).map((e) => [itemTierKey(key), e] as const)))
  const tiersAt = heldTiers(dump.entries, lootSince)
  for (const [raw, n] of Object.entries(lootSince)) {
    const key = itemTierKey(raw)
    const by: Counts = byKey.get(key) ?? new Map<OwnershipPlace, number>()
    by.set('inventory', (by.get('inventory') ?? 0) + n)
    byKey.set(key, by)
  }
  for (const [key, by] of byKey) {
    takeOff(by, destroyedSince[key] ?? 0)
    const parts = PLACE_ORDER.flatMap((p) => ((by.get(p) ?? 0) > 0 ? [{ label: PLACE_WORD[p], count: by.get(p) ?? 0, place: p }] : []))
    const total = parts.reduce((s, p) => s + p.count, 0)
    const exported = named.get(key)
    if (total > 0) out.set(key, [{ total, parts, exportedAt: dump.loadedAt, ...(who === undefined ? {} : { who }), ...(exported === undefined ? {} : { exported }), ...tiersAt(key) }])
  }
  return out
}

/** Several characters' indexes as one: every holder of each item, in the order given; each after the first is `also`. */
export function joinHeld(indexes: readonly HeldIndex[]): HeldIndex {
  const out = new Map<string, GapHeld[]>()
  for (const index of indexes) {
    for (const [key, holders] of index) {
      const had = out.get(key) ?? []
      out.set(key, [...had, ...holders.map((h, i) => (had.length + i === 0 ? h : { ...h, also: true as const }))])
    }
  }
  return out
}

const NOBODY: readonly GapHeld[] = []

/**
 * An Items row's holders, at any tier and any case; none for another domain or none held. The log's
 * name first, then a hand-edited one (gapEdits.ts: a misread capture put right), so an edit finds the
 * export's copies; an edit that is no string is passed over.
 */
export function gapHeld(row: GapRow, index: HeldIndex): readonly GapHeld[] {
  if (row.domain !== 'item') return NOBODY
  const edited: unknown = row.edit?.name
  return index.get(itemTierKey(row.name)) ?? (typeof edited === 'string' && edited.trim() !== '' ? index.get(itemTierKey(edited)) : undefined) ?? NOBODY
}

/**
 * Where "I have it" looks (owner, 2026-10-21: "In bags or In bank? depending on what we know"): any
 * place, or one side of the export's places. Bags is what is on the character: worn, the bags and
 * the keyring (`General N`, the equipment slots, the keyring table). Bank is what waits at a banker
 * or in storage: `BankN`, `SharedBankN` (its name says bank, and the Character tab gives both banks
 * one chip) and `Personal-DepotN`, the tradeskill depot, which the loot model calls bank-type
 * storage. A row the export could not place counts only under Anywhere. Loot since the export is in
 * the bags, as the held count always read it.
 */
export type HeldWhere = 'any' | 'bags' | 'bank'
/** The picker's choice: off, or where to look. */
export type HeldPick = 'off' | HeldWhere

const SIDE_OF: Record<OwnershipPlace, Exclude<HeldWhere, 'any'> | null> = {
  equipped: 'bags',
  inventory: 'bags',
  keyring: 'bags',
  bank: 'bank',
  sharedBank: 'bank',
  personalDepot: 'bank',
  unknown: null
}

/** Does this holder have a copy in `where`? */
function holdsIn(h: GapHeld, where: HeldWhere): boolean {
  return where === 'any' ? h.total > 0 : h.parts.some((p) => p.count > 0 && SIDE_OF[p.place] === where)
}

/** Is the row held by anyone in `index`, in `where`? */
const heldIn = (row: GapRow, index: HeldIndex, where: HeldWhere): boolean => gapHeld(row, index).some((h) => holdsIn(h, where))

/**
 * The "I have it" filter (owner, 2026-10-21: "see all items i have ... knock all those out in 1 easy
 * swoop"): the Items rows someone in `index` holds, in `where`. Only Items rows can be held, so the
 * filter is the Items list's; another domain's rows pass untouched.
 */
export function onlyHeld(rows: readonly GapRow[], index: HeldIndex, where: HeldWhere = 'any'): GapRow[] {
  return rows.filter((r) => r.domain !== 'item' || heldIn(r, index, where))
}

const CAPTION_WORD: Record<HeldWhere, string> = { any: 'held', bags: 'in bags', bank: 'in bank' }

/** What "I have it" reads: the holders, and where to look. */
export interface HeldFilter {
  index: HeldIndex
  where: HeldWhere
}

/** The Items toggle's caption while "I have it" is on: `3 held` (`3 in bags`), in the zone when one is given, hidden rows left out. */
export function heldCaption(rows: readonly GapRow[], zone: string | null, hidden: (row: GapRow) => boolean, held: HeldFilter): string {
  const n = visibleGaps(rows, 'item', '', zone).filter((r) => !hidden(r) && heldIn(r, held.index, held.where)).length
  return `${n.toLocaleString()} ${CAPTION_WORD[held.where]}`
}

/**
 * The stored pick, read back. The box this picker replaces stored `1` and `0`: `1` (on) reads as
 * Anywhere, which is also what Anywhere writes, so either build reads the other's choice.
 */
export function heldPickOf(raw: string | null): HeldPick {
  if (raw === '1') return 'any'
  return raw === 'bags' || raw === 'bank' ? raw : 'off'
}

/** The pick as stored. */
export function heldPickText(pick: HeldPick): string {
  return pick === 'any' ? '1' : pick === 'off' ? '0' : pick
}

/**
 * The row chip: `held`, or `held by Drywrought, Kaltinril` when the holders are named, naming only
 * the holders of a +0 copy when there is one; with none, `+4 held by Drywrought, +2 held by
 * Kaltinril` at each holder's lowest tier (owner, 2026-10-25: the page needs the +0 window).
 */
export function heldChipLabel(holders: readonly GapHeld[]): string {
  const plain = holders.filter((h) => h.tiers === undefined)
  if (plain.length === 0 && holders.length > 0) return holders.map((h) => `${lowTier(h)} held${h.who === undefined ? '' : ` by ${h.who}`}`).join(', ')
  const named = plain.flatMap((h) => (h.who === undefined ? [] : [h.who]))
  return named.length === 0 ? 'held' : `held by ${named.join(', ')}`
}

const holder = (h: GapHeld): string => (h.who === undefined ? 'You hold' : `${h.who} holds`)

/** `bags`, or `2 bags, 1 bank` when the copies are in more than one place. */
function placesText(h: GapHeld): string {
  return h.parts.length === 1 ? (h.parts[0]?.label ?? '') : h.parts.map((p) => `${String(p.count)} ${p.label}`).join(', ')
}

/** The details pane's line: `You hold 2 (bags): screenshot it for the wiki now.`, or `Drywrought holds 2 (bags): ...`. */
export function heldLine(h: GapHeld): string {
  if (h.also === true && h.who !== undefined) return `Also on ${h.who}: ${String(h.total)} (${placesText(h)})${atTiers(h)}.`
  if (h.tiers !== undefined) return `${holder(h)} ${String(h.total)} (${placesText(h)})${atTiers(h)}: not the +0 the page needs.`
  return `${holder(h)} ${String(h.total)} (${placesText(h)}): screenshot it for the wiki now.`
}

/** The row chip's tooltip, a line per holder: where each count comes from. */
export function heldTitle(holders: readonly GapHeld[]): string {
  return holders
    .map((h) => `${holder(h)} ${String(h.total)} (${placesText(h)})${atTiers(h)}, per the inventory export of ${h.exportedAt.slice(0, 10)} plus loot since.`)
    .join(' ')
}
