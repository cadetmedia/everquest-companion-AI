// slayerPlan.ts — WHERE TO GO for a set of Slayer counters. Pure: no Node, no Electron, no React.
//
// THE QUESTION (owner ask, 2026-09-28): one achievement wants gargoyles or scarecrows, another
// wants bats, and a place that has both is the better trip. So the unit of the answer is a ZONE,
// and a zone is better the more of the picked counters it serves at once.
//
// WHAT A ZONE IS RANKED ON, in this order:
//   1. how many of the picked counters have at least one mob there;
//   2. `advances`: counter ticks per clear of the zone's matching spawn points. A spawn point
//      whose mob counts toward three picked counters is three ticks (one gnoll kill moves
//      `Gnolls` in Conquest, Special and Skill together);
//   3. the name, so the order is total.
//
// WHAT A SPAWN POINT IS. The wiki's stated `/loc` rows on the mob's page (`MobEntry.loc`). A mob
// whose page states none counts as one, and so does a mob whose page names several zones, because
// the page does not say which location is in which zone. It is a count of places to stand, not a
// kill rate: the catalog states a respawn time for one page in twenty.
//
// WHAT IS LEFT OUT, and each is a switch on `PlanOptions`:
//   - a mob whose lowest stated level is above `maxLevel`;
//   - a zone every era reading places in a later expansion than the server has opened;
//   - a mob the era rules put out of era (`MobEntry.outOfEra`, computed at data build from the
//     page's banner and its zones). The zone alone cannot say it: the Fear/Hate revamp refilled a
//     classic zone, so A Hatebone Drake (`{{FearHateRevamp Era}}`) is filed under The Plane of
//     Hate and passed the zone rule (owner, 2026-10-17). It is left out of the zone's mobs, its
//     spawn points, its level range and its counts, and a zone left with nothing in era is not
//     listed. THE FLAG IS THE ONLY WITNESS: a raw banner is not read here, because it hides mobs
//     the player fights (a cave bat is bannered Velious and lives in a classic zone).
// A zone the era table makes no claim about stays in (`unknown` is not `out-of-era`), and so does
// a mob with no flag. The "Zones not open yet" switch brings both kinds back.

import type { ZoneShort } from '../maps'
import type { MobEntry } from '../mobTypes'
import { achievementKey, type SlayerCounter } from '../outputs/slayer'
import { eraVerdict } from '../planner/era'
import { ZONES, zoneKey, zoneShortNameFromCatalog } from '../zones'
import {
  labelMatcher,
  matchMob,
  mobFacts,
  strictMatcher,
  type LabelMatcher,
  type MatchBasis,
  type MobFacts
} from './slayerMatch'

/** A counter with its requirement line compiled. */
export interface SlayerTarget {
  id: string
  counter: SlayerCounter
  matcher: LabelMatcher
}

/** A counter's identity: `I'm a People Person!` has one counter per race under one name. */
export function counterId(c: SlayerCounter): string {
  return `${c.achievement} / ${c.label}`
}

/** The one achievement that counts the race itself (slayerMatch.ts `strictMatcher`). */
const STRICT_ACHIEVEMENT = "i'm a people person!"

export function slayerTarget(counter: SlayerCounter): SlayerTarget {
  const strict = achievementKey(counter.achievement) === STRICT_ACHIEVEMENT
  const matcher = strict ? strictMatcher(counter.label) : labelMatcher(counter.label)
  return { id: counterId(counter), counter, matcher }
}

/** A catalog mob with everything the join reads, computed once. */
export interface SlayerMob {
  entry: MobEntry
  facts: MobFacts
  /** the lowest and highest level the page states; null when it states none */
  low: number | null
  high: number | null
  /** the wiki says a kill lowers a faction (`mobFactions.json`); false when it says none or nothing */
  factionHit: boolean
  /** the era rules put this mob out of era (`mobOutOfEra`) */
  outOfEra: boolean
}

/** The data build's era verdict says this mob is not in the game the server runs. Absent is in
 *  era: silence is not a verdict. Every surface that offers a catalog mob asks this. */
export function mobOutOfEra(entry: MobEntry): boolean {
  return entry.outOfEra === true
}

/** The number the text opens with, and the one a dash or `to` joins to it. */
const LEVEL_RE = /^\D{0,12}?(\d+)(?:\s*(?:-|to)\s*(\d+))?/

/**
 * `36-40`, `2 - 4`, `18`, `50+`. ONLY THE OPENING OF THE TEXT IS READ: the field is prose on some
 * pages (`6 (strangely cons dark blue to me at lvl 42, at night)`), and a number further in is
 * somebody's character, not the mob.
 */
export function levelSpan(text: string | undefined): { low: number | null; high: number | null } {
  const found = LEVEL_RE.exec(text ?? '')
  if (found === null) return { low: null, high: null }
  const a = Number(found[1])
  const b = found[2] === undefined ? a : Number(found[2])
  return { low: Math.min(a, b), high: Math.max(a, b) }
}

/** A span as the tab prints it: `14-17`, `20`, or nothing when the page stated no level. */
function levelText(low: number | null, high: number | null): string {
  if (low === null || high === null) return ''
  return low === high ? String(low) : `${String(low)}-${String(high)}`
}

export function slayerMobs(
  catalog: readonly MobEntry[],
  raceOf: (page: string) => string | undefined,
  hitsFaction: (page: string) => boolean = () => false
): SlayerMob[] {
  return catalog.map((entry) => ({
    entry,
    facts: mobFacts(entry.name, raceOf(entry.page)),
    ...levelSpan(entry.level),
    factionHit: hitsFaction(entry.page),
    outOfEra: mobOutOfEra(entry)
  }))
}

export interface PlanOptions {
  /** leave out mobs whose lowest stated level is above this; null keeps every level */
  maxLevel: number | null
  /** keep zones from expansions the server has not opened, and mobs flagged out of era */
  outOfEra: boolean
  /** leave out mobs the wiki says lower a faction; a mob it is silent on stays */
  noFactionHits: boolean
}

/** One mob in a zone that counts toward at least one picked counter. */
export interface PlanMob {
  /** the catalog row, which is what a link to the mob's page pins its identity with */
  entry: MobEntry
  name: string
  /** the stated level as numbers (`14-17`), '' when the page stated none */
  level: string
  spawns: number
  /** `name` when any counter it is listed for was read off its name */
  basis: MatchBasis
  targets: string[]
}

export interface PlanZone {
  key: string
  name: string
  /** the map stem, when the zone table knows the zone */
  short: ZoneShort | null
  mobs: PlanMob[]
  /** the picked counters with a mob here, in the order they were picked */
  targets: string[]
  spawns: number
  advances: number
  low: number | null
  high: number | null
  /** the counting mobs' lowest levels, averaged over their spawn points; null when none states one */
  level: number | null
}

let NAME_BY_SHORT: Map<ZoneShort, string> | null = null

function zoneNameByShort(): Map<ZoneShort, string> {
  NAME_BY_SHORT ??= new Map(ZONES.map((z) => [z.short, z.name]))
  return NAME_BY_SHORT
}

/** The catalog writes placeholders where a zone belongs; they are not places to go. Besides
 *  these, any `various ...` (`Various Starter Zones`) and any guess ending in `?` (`Warsliks?`). */
const NOT_A_ZONE = new Set(['', 'various', 'varies', 'unknown', 'none', '?'])

function isPlaceholder(key: string): boolean {
  return NOT_A_ZONE.has(key) || key.startsWith('various') || key.endsWith('?')
}

function spawnPoints(entry: MobEntry): number {
  if ((entry.zones?.length ?? 0) !== 1) return 1
  return Math.max(1, entry.loc?.length ?? 0)
}

/** The level cap, read off the LOWEST stated level. The zone list and the map shading both ask
 *  this, so a mob the list leaves out is not shaded either. */
export function withinLevel(mob: SlayerMob, maxLevel: number | null): boolean {
  return maxLevel === null || mob.low === null || mob.low <= maxLevel
}

/** The options that leave a MOB out, which the zone list and the map shading both apply. */
export type MobCap = Pick<PlanOptions, 'maxLevel' | 'noFactionHits' | 'outOfEra'>

export const NO_CAP: MobCap = { maxLevel: null, noFactionHits: false, outOfEra: true }

/** The mob is under the level cap, costs no faction while the faction switch is on, and is in era
 *  unless the switch for what is not open yet is on. */
export function keptMob(mob: SlayerMob, cap: MobCap): boolean {
  if (mob.outOfEra && !cap.outOfEra) return false
  return withinLevel(mob, cap.maxLevel) && !(cap.noFactionHits && mob.factionHit)
}

/** The mob as one zone row's line, or null when it counts toward nothing picked. */
function planMob(mob: SlayerMob, targets: readonly SlayerTarget[]): PlanMob | null {
  const hits: string[] = []
  let basis: MatchBasis = 'race'
  for (const t of targets) {
    const how = matchMob(t.matcher, mob.facts)
    if (how === null) continue
    hits.push(t.id)
    if (how === 'name') basis = 'name'
  }
  if (hits.length === 0) return null
  const { entry } = mob
  return {
    entry,
    name: entry.name,
    level: levelText(mob.low, mob.high),
    spawns: spawnPoints(entry),
    basis,
    targets: hits
  }
}

function emptyZone(key: string, catalogName: string): PlanZone {
  const short = zoneShortNameFromCatalog(catalogName)
  const name = (short === null ? undefined : zoneNameByShort().get(short)) ?? catalogName
  return { key, name, short, mobs: [], targets: [], spawns: 0, advances: 0, low: null, high: null, level: null }
}

function addMob(zone: PlanZone, row: PlanMob, mob: SlayerMob): void {
  zone.mobs.push(row)
  zone.spawns += row.spawns
  zone.advances += row.spawns * row.targets.length
  if (mob.low !== null) zone.low = zone.low === null ? mob.low : Math.min(zone.low, mob.low)
  if (mob.high !== null) zone.high = zone.high === null ? mob.high : Math.max(zone.high, mob.high)
}

/** The zones a mob is filed under that are places and that the options keep, each without the
 *  closing period a page sometimes leaves on it (`Lake of Ill Omen.`). */
function keptZones(entry: MobEntry, opts: PlanOptions): string[] {
  return (entry.zones ?? [])
    .map((z) => z.replace(/\.\s*$/, ''))
    .filter((z) => {
      if (isPlaceholder(zoneKey(z))) return false
      return opts.outOfEra || eraVerdict([z]) !== 'out-of-era'
    })
}

function byRank(a: PlanZone, b: PlanZone): number {
  return (
    b.targets.length - a.targets.length || b.advances - a.advances || a.name.localeCompare(b.name)
  )
}

/** Every zone with a mob that counts toward a picked counter, best first. */
export function planZones(
  mobs: readonly SlayerMob[],
  targets: readonly SlayerTarget[],
  opts: PlanOptions
): PlanZone[] {
  const zones = new Map<string, PlanZone>()
  const levels = new Map<PlanZone, { sum: number; spawns: number }>()
  for (const mob of mobs) {
    if (!keptMob(mob, opts)) continue
    const row = planMob(mob, targets)
    if (row === null) continue
    for (const catalogName of keptZones(mob.entry, opts)) {
      const key = zoneShortNameFromCatalog(catalogName) ?? zoneKey(catalogName)
      const zone = zones.get(key) ?? emptyZone(key, catalogName)
      zones.set(key, zone)
      addMob(zone, row, mob)
      if (mob.low === null) continue
      const l = levels.get(zone) ?? { sum: 0, spawns: 0 }
      levels.set(zone, { sum: l.sum + mob.low * row.spawns, spawns: l.spawns + row.spawns })
    }
  }
  const order = new Map(targets.map((t, i) => [t.id, i]))
  for (const zone of zones.values()) {
    const l = levels.get(zone)
    zone.level = l === undefined ? null : Math.round(l.sum / l.spawns)
    const seen = new Set(zone.mobs.flatMap((m) => m.targets))
    zone.targets = [...seen].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
    zone.mobs.sort((a, b) => b.spawns * b.targets.length - a.spawns * a.targets.length)
  }
  return [...zones.values()].sort(byRank)
}

/** How the zone list is ordered: by how many picked counters a zone serves (the plan's own
 *  ranking), by spawn points, or by level, lowest first. Each falls back to the plan's ranking. */
export type ZoneOrder = 'matches' | 'spawns' | 'level'

const NO_LEVEL = Number.MAX_SAFE_INTEGER

export function sortZones(zones: readonly PlanZone[], order: ZoneOrder): PlanZone[] {
  if (order === 'matches') return [...zones]
  if (order === 'spawns') return [...zones].sort((a, b) => b.spawns - a.spawns || byRank(a, b))
  return [...zones].sort((a, b) => (a.level ?? NO_LEVEL) - (b.level ?? NO_LEVEL) || byRank(a, b))
}

/** The counters with a mob in this zone, by id. */
export function countersIn(zones: readonly PlanZone[], zone: ZoneShort): Set<string> {
  return new Set(zones.filter((z) => z.short === zone).flatMap((z) => z.targets))
}

/** How many zones and spawn points each counter has, over a plan made for ALL of them. */
export function targetReach(zones: readonly PlanZone[]): Map<string, { zones: number; spawns: number }> {
  const reach = new Map<string, { zones: number; spawns: number }>()
  for (const zone of zones) {
    const here = new Map<string, number>()
    for (const mob of zone.mobs) {
      for (const id of mob.targets) here.set(id, (here.get(id) ?? 0) + mob.spawns)
    }
    for (const [id, spawns] of here) {
      const r = reach.get(id) ?? { zones: 0, spawns: 0 }
      reach.set(id, { zones: r.zones + 1, spawns: r.spawns + spawns })
    }
  }
  return reach
}
