// achievements/bookRows.ts — the Achievements tab's view models. Pure: no Node, no Electron, no
// React.
//
// THE TREE IS THE GAME'S (shared/outputs/achievementBook.ts): family, group, achievement,
// requirement. What this file adds is the three joins a requirement line can make, each by the
// name the game printed and nothing looser:
//   - ANOTHER ACHIEVEMENT (`Complete the achievement "Pesticide"`, `Hunter of Crushbone`), which
//     is what makes Megadeath a tree four deep;
//   - A MOB of the catalog, by its whole name (`Lord Nagafen`). A name several pages share opens
//     by name and lets the mob page choose, as a consider does;
//   - A ZONE, read off an achievement's own name: `Hunter of X`, `Conqueror of X`, `X Traveler`.
// MEASURED on the owner's dump of 2026-09-29: 244 lines name an achievement, 211 name a mob, and
// 108 of the 141 zone-shaped names are zones the map table knows. A line that joins to nothing
// is drawn as the text it is.
//
// HOW FAR ALONG AN ACHIEVEMENT IS: the mean of its required lines, where a done line is 1, a
// counter is its fraction, and a line naming another achievement is that achievement's own
// figure. A line marked `(Optional)` is left out unless every line is. An achievement whose own
// row is complete is 1 whatever its lines say (achievements.ts: a class unlock completes on
// confirmation with a line still open).

import type { ZoneShort } from '../maps'
import type { MobEntry } from '../mobTypes'
import {
  componentSubject,
  componentText,
  isOptional,
  type AchievementBook,
  type BookAchievement,
  type BookComponent,
  type BookGroup
} from '../outputs/achievementBook'
import { CLASS_UNLOCK_CONFIRM_PREFIX, CLASS_UNLOCK_TOKEN_ROW } from '../outputs/achievements'
import {
  SLAYER_GENERAL,
  SLAYER_PREFIX,
  achievementKey,
  type SlayerCounter
} from '../outputs/slayer'
import { counterId } from '../slayer/slayerPlan'
import { zoneShortName, zoneShortNameFromCatalog } from '../zones'

/** An achievement and the group it was printed under. */
export interface Located {
  group: BookGroup
  achievement: BookAchievement
}

/** Every achievement by `achievementKey`. The Keys are printed under two groups; the first stands. */
export type BookIndex = ReadonlyMap<string, Located>

export function bookIndex(book: AchievementBook): BookIndex {
  const index = new Map<string, Located>()
  for (const group of book.groups) {
    for (const achievement of group.achievements) {
      const key = achievementKey(achievement.name)
      if (!index.has(key)) index.set(key, { group, achievement })
    }
  }
  return index
}

/** The achievement a line names, when it names one other than the achievement it sits under. */
export function namedAchievement(
  component: BookComponent,
  parent: BookAchievement,
  index: BookIndex
): Located | null {
  const key = achievementKey(componentSubject(component))
  if (key === achievementKey(parent.name)) return null
  return index.get(key) ?? null
}

// ---- progress ------------------------------------------------------------------------------------

/** How deep a chain of achievements naming achievements is followed. The game's deepest is four. */
const MAX_DEPTH = 6

/** The two class-unlock pseudo-rows ("will autocomplete if you confirm…", "can be bypassed with a
 *  token") state how the achievement can be GRANTED; they are not requirements, and counting them
 *  showed a Bard at `5 of 8` with six rewards to obtain (owner, 2026-10-11). */
function isGrantRow(c: BookComponent): boolean {
  return c.line.startsWith(CLASS_UNLOCK_CONFIRM_PREFIX) || c.line === CLASS_UNLOCK_TOKEN_ROW
}

function requiredLines(a: BookAchievement): BookComponent[] {
  const required = a.components.filter((c) => !isOptional(c) && !isGrantRow(c))
  return required.length > 0 ? required : a.components
}

function lineFraction(
  c: BookComponent,
  parent: BookAchievement,
  index: BookIndex,
  depth: number
): number {
  if (c.done) return 1
  if (c.have !== undefined && c.need !== undefined && c.need > 0) return Math.min(1, c.have / c.need)
  const named = namedAchievement(c, parent, index)
  return named === null ? 0 : fraction(named.achievement, index, depth + 1)
}

function fraction(a: BookAchievement, index: BookIndex, depth: number): number {
  if (a.done) return 1
  const lines = requiredLines(a)
  if (lines.length === 0 || depth > MAX_DEPTH) return 0
  const sum = lines.reduce((n, c) => n + lineFraction(c, a, index, depth), 0)
  return sum / lines.length
}

/** 0 to 100. */
export function achievementPct(a: BookAchievement, index: BookIndex): number {
  return 100 * fraction(a, index, 0)
}

function lineLeft(c: BookComponent, parent: BookAchievement, index: BookIndex, depth: number): number {
  if (c.done) return 0
  if (c.have !== undefined && c.need !== undefined && c.need > 0) return Math.max(0, c.need - c.have)
  const named = namedAchievement(c, parent, index)
  return named === null ? 1 : left(named.achievement, index, depth + 1)
}

function left(a: BookAchievement, index: BookIndex, depth: number): number {
  if (a.done) return 0
  const lines = requiredLines(a)
  if (lines.length === 0 || depth > MAX_DEPTH) return 1
  return lines.reduce((n, c) => n + lineLeft(c, a, index, depth), 0)
}

/**
 * HOW MUCH IS LEFT, in the work's own units: a counter's kills still to make, one for a line not
 * yet done, and for a line naming another achievement, what that one has left. Closest first
 * sorts on this rather than on the percentage (owner, 2026-10-05): 300 kills from 700 of 1,000 is
 * further away than 33 from 67 of 100, though the percentage says the opposite.
 */
export function achievementLeft(a: BookAchievement, index: BookIndex): number {
  return left(a, index, 0)
}

/** `4 of 10` for a single counter, `3 of 9` lines otherwise, and nothing for one plain line. */
export function progressText(a: BookAchievement): string {
  if (a.done) return 'Complete'
  const lines = requiredLines(a)
  if (lines.length === 1) {
    const [only] = lines
    if (only.have === undefined || only.need === undefined) return ''
    return `${only.have.toLocaleString('en-US')} of ${only.need.toLocaleString('en-US')}`
  }
  const done = lines.filter((c) => c.done).length
  return `${String(done)} of ${String(lines.length)}`
}

// ---- the Slayer counters -------------------------------------------------------------------------

/**
 * The kill counter a line is, open or finished, or null for a line that is not one. A FINISHED
 * line prints no figures (`C		Minotaurs and Tizmak.`) and is stated as one of one, under the id
 * it had while open, so it can still be picked to see where its mobs are (owner ask, 2026-10-12).
 */
export function slayerCounterOf(
  group: BookGroup,
  a: BookAchievement,
  c: BookComponent
): SlayerCounter | null {
  if (!group.category.startsWith(SLAYER_PREFIX) || group.name === SLAYER_GENERAL) return null
  const counter = { group: group.name, achievement: a.name, label: c.line }
  if (c.have !== undefined && c.need !== undefined && !c.done) {
    return { ...counter, have: c.have, need: c.need }
  }
  const quoted = componentSubject(c) !== componentText(c)
  return c.done && !quoted ? { ...counter, have: 1, need: 1 } : null
}

/** The id the Slayer plan knows a counter by, or null for a line that is not one. */
export function counterIdOf(group: BookGroup, a: BookAchievement, c: BookComponent): string | null {
  const counter = slayerCounterOf(group, a, c)
  return counter === null ? null : counterId(counter)
}

/** Every finished kill counter of the book, which the dump's own record leaves out. */
export function finishedCounters(book: AchievementBook): SlayerCounter[] {
  return book.groups.flatMap((g) =>
    g.achievements.flatMap((a) =>
      a.components.flatMap((c) => (c.done ? (slayerCounterOf(g, a, c) ?? []) : []))
    )
  )
}

export function counterIds(group: BookGroup, a: BookAchievement): string[] {
  return a.components.flatMap((c) => counterIdOf(group, a, c) ?? [])
}

// ---- mobs and zones ------------------------------------------------------------------------------

export type MobIndex = ReadonlyMap<string, readonly MobEntry[]>

export function mobIndex(catalog: readonly MobEntry[]): MobIndex {
  const index = new Map<string, MobEntry[]>()
  for (const entry of catalog) {
    const key = entry.name.toLowerCase()
    const rows = index.get(key)
    if (rows === undefined) index.set(key, [entry])
    else rows.push(entry)
  }
  return index
}

/** The catalog's mobs of exactly this name. */
export function namedMobs(component: BookComponent, mobs: MobIndex): readonly MobEntry[] {
  return mobs.get(componentText(component).toLowerCase()) ?? []
}

const ZONE_NAME_RES = [/^Hunter of (.+)$/, /^Conqueror of (.+)$/, /^(.+) Traveler$/]

/** The map an achievement's name points at, when it names a zone the table knows. */
export function namedZone(name: string): ZoneShort | null {
  for (const re of ZONE_NAME_RES) {
    const zone = re.exec(name)?.[1]
    if (zone !== undefined) return zoneShortName(zone) ?? zoneShortNameFromCatalog(zone)
  }
  return null
}

/** The zone the character is in, as the list's "Zone I'm in" filter reads it. */
export interface ZoneHere {
  zone: ZoneShort
  /** the open counters with a mob in this zone, by `counterId`, as the Slayer plan places them */
  counters: ReadonlySet<string>
  mobs: MobIndex
}

/** An achievement that can be worked on in this zone: its own name is the zone, an open counter
 *  has a mob here, or an open line names a mob the catalog files here. */
export function worksHere(group: BookGroup, a: BookAchievement, here: ZoneHere): boolean {
  if (namedZone(a.name) === here.zone) return true
  return a.components.some((c) => {
    if (c.done) return false
    const id = counterIdOf(group, a, c)
    if (id !== null && here.counters.has(id)) return true
    return namedMobs(c, here.mobs).some((m) =>
      (m.zones ?? []).some((z) => zoneShortNameFromCatalog(z) === here.zone)
    )
  })
}

// ---- the rail ------------------------------------------------------------------------------------

/** What the list is showing: everything, one family, or one group of it. */
export interface Scope {
  family: string | null
  category: string | null
}

export const EVERYTHING: Scope = { family: null, category: null }

export function inScope(group: BookGroup, scope: Scope): boolean {
  if (scope.category !== null) return group.category === scope.category
  return scope.family === null || group.family === scope.family
}

export interface Tally {
  done: number
  total: number
}

export interface RailGroup {
  group: BookGroup
  tally: Tally
}

export interface RailFamily {
  name: string
  tally: Tally
  groups: RailGroup[]
}

function tallyOf(achievements: readonly BookAchievement[]): Tally {
  return { done: achievements.filter((a) => a.done).length, total: achievements.length }
}

/** The families in file order, each with its groups and what the file says is done of them. */
export function railFamilies(book: AchievementBook): RailFamily[] {
  const families = new Map<string, RailFamily>()
  for (const group of book.groups) {
    const family = families.get(group.family) ?? {
      name: group.family,
      tally: { done: 0, total: 0 },
      groups: []
    }
    families.set(group.family, family)
    const tally = tallyOf(group.achievements)
    family.groups.push({ group, tally })
    family.tally = {
      done: family.tally.done + tally.done,
      total: family.tally.total + tally.total
    }
  }
  return [...families.values()]
}

/** The whole file, an achievement printed under two groups counted once (the window's count). */
export function bookTally(index: BookIndex): Tally {
  return tallyOf([...index.values()].map((l) => l.achievement))
}

// ---- the list ------------------------------------------------------------------------------------

export type SortOrder = 'game' | 'closest'

export interface BookFilters {
  scope: Scope
  query: string
  open: boolean
  complete: boolean
  sort: SortOrder
  /** keep only what can be worked on in this zone; null keeps every zone */
  here: ZoneHere | null
  /** keep only achievements with a checked counter, open or complete; null keeps every one */
  picked?: ReadonlySet<string> | null
}

/** One group's achievements that the filters keep. */
export interface BookSection {
  group: BookGroup
  achievements: BookAchievement[]
}

function haystack(group: BookGroup, a: BookAchievement): string {
  return `${a.name} ${group.category} ${a.components.map((c) => c.line).join(' ')}`.toLowerCase()
}

function keeps(group: BookGroup, a: BookAchievement, f: BookFilters, words: readonly string[]): boolean {
  const picked = f.picked ?? null
  if (picked !== null) {
    if (!counterIds(group, a).some((id) => picked.has(id))) return false
  } else if (a.done ? !f.complete : !f.open) return false
  if (f.here !== null && !worksHere(group, a, f.here)) return false
  if (words.length === 0) return true
  const hay = haystack(group, a)
  return words.every((w) => hay.includes(w))
}

export function visibleSections(
  book: AchievementBook,
  index: BookIndex,
  f: BookFilters
): BookSection[] {
  const words = f.query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const sections: BookSection[] = []
  for (const group of book.groups) {
    if (!inScope(group, f.scope)) continue
    const achievements = group.achievements.filter((a) => keeps(group, a, f, words))
    if (achievements.length === 0) continue
    if (f.sort === 'closest') {
      // What is finished is as close as it gets and is no longer work, so it goes last. Among the
      // rest, the least left first, and the further along of two that have as much left.
      const rest = new Map(achievements.map((a) => [a, achievementLeft(a, index)]))
      const pct = new Map(achievements.map((a) => [a, achievementPct(a, index)]))
      achievements.sort(
        (a, b) =>
          Number(a.done) - Number(b.done) ||
          (rest.get(a) ?? 0) - (rest.get(b) ?? 0) ||
          (pct.get(b) ?? 0) - (pct.get(a) ?? 0)
      )
    }
    sections.push({ group, achievements })
  }
  return sections
}

/** How many achievements the sections hold. */
export function shownCount(sections: readonly BookSection[]): number {
  return sections.reduce((n, s) => n + s.achievements.length, 0)
}

/**
 * Whether a family holds a counter the Slayer plan can work on. Asked of the FAMILY and not of
 * what the list is showing: `Slayer: General` is made of achievements and prints no counter of
 * its own, and its lines open into the ones that do.
 */
export function familyHasCounter(book: AchievementBook, family: string | null): boolean {
  if (family === null) return false
  return book.groups.some(
    (g) => g.family === family && g.achievements.some((a) => counterIds(g, a).length > 0)
  )
}
