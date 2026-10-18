// slayer/slayerAreas.ts — WHERE ON THE MAP the picked counters' mobs stand. Pure: no React.
//
// The Maps tab pins a mob where its wiki page says it spawns. For someone working on Slayer
// counters the useful unit is coarser than a pin: "the corner of this zone with the scarecrows and
// the bats in it". So the spawn points of every mob that counts toward a PICKED counter are
// grouped into areas, and each area says which achievements it serves.
//
// HOW POINTS BECOME AREAS. Two spawn points closer than `LINK` map units are one area, and so is
// anything chained to them (single linkage). An area is drawn as the circle around its points'
// centre that holds them all, padded, and never smaller than `MIN_RADIUS`, so a lone spawn point
// is still a place you can see. The numbers are map units, the same ones `/loc` prints.
//
// WHAT IS NOT DRAWN, for the reason the pin layer gives (mobPins.ts): a mob whose page names
// several zones states locations nobody can assign to the map on screen, and a mob whose page
// states none has nowhere to be drawn. Both still count in the Achievements tab's zone list.
// A mob above the plan's level cap is left out here as the zone list leaves it out
// (`keptMob`: the level cap, the faction switch, and the out-of-era flag), so the list and the map
// never disagree about where to go.

import type { ZoneShort } from '@shared/maps'
import { matchMob } from '../../../../shared/slayer/slayerMatch'
import type { MobCap, SlayerMob, SlayerTarget } from '@shared/slayer/slayerPlan'
import { keptMob } from '../../../../shared/slayer/slayerPlan'
import { zoneShortNameFromCatalog } from '../../../../shared/zones'
import { mobPins } from '../maps/mobPins'

/** Spawn points this close, in map units, belong to one area. */
export const LINK = 300
/** What an area's circle keeps clear around its outermost point. */
export const PAD = 60
/** The smallest circle drawn. */
export const MIN_RADIUS = 90

export interface SlayerArea {
  /** the circle, in map coordinates */
  x: number
  y: number
  r: number
  spawns: number
  /** the picked counters served here, by id, in the order they were picked */
  targets: string[]
  /** the mobs standing here, each once */
  mobs: string[]
}

interface Point {
  x: number
  y: number
  mob: string
  targets: string[]
}

/** The ids of the picked counters a mob counts toward. */
function hits(mob: SlayerMob, targets: readonly SlayerTarget[]): string[] {
  const ids: string[] = []
  for (const t of targets) {
    if (matchMob(t.matcher, mob.facts) !== null) ids.push(t.id)
  }
  return ids
}

/** Every drawable spawn point on this map of a mob that counts toward a picked counter. */
function pointsOn(
  zone: ZoneShort,
  mobs: readonly SlayerMob[],
  targets: readonly SlayerTarget[],
  cap: MobCap
): Point[] {
  const points: Point[] = []
  for (const mob of mobs) {
    if (!keptMob(mob, cap)) continue
    const zones = mob.entry.zones ?? []
    if (zones.length !== 1 || zoneShortNameFromCatalog(zones[0]) !== zone) continue
    const counts = hits(mob, targets)
    if (counts.length === 0) continue
    for (const pin of mobPins(mob.entry)) {
      points.push({ x: pin.x, y: pin.y, mob: mob.entry.name, targets: counts })
    }
  }
  return points
}

/** Single-linkage groups: the index of each point's group, by union-find. */
function groups(points: readonly Point[]): number[] {
  const parent = points.map((_, i) => i)
  const find = (start: number): number => {
    let i = start
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  for (let a = 0; a < points.length; a++) {
    for (let b = a + 1; b < points.length; b++) {
      const near = Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y) <= LINK
      if (near) parent[find(a)] = find(b)
    }
  }
  return points.map((_, i) => find(i))
}

function areaOf(members: readonly Point[], order: ReadonlyMap<string, number>): SlayerArea {
  const x = members.reduce((sum, p) => sum + p.x, 0) / members.length
  const y = members.reduce((sum, p) => sum + p.y, 0) / members.length
  const reach = Math.max(...members.map((p) => Math.hypot(p.x - x, p.y - y)))
  const ids = [...new Set(members.flatMap((p) => p.targets))]
  return {
    x,
    y,
    r: Math.max(MIN_RADIUS, reach + PAD),
    spawns: members.length,
    targets: ids.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)),
    mobs: [...new Set(members.map((p) => p.mob))]
  }
}

/** The areas of one map, the one with the most spawn points first. `cap` is the plan's level cap,
 *  faction switch and era switch; `NO_CAP` draws every mob. */
export function slayerAreas(
  zone: ZoneShort,
  mobs: readonly SlayerMob[],
  targets: readonly SlayerTarget[],
  cap: MobCap
): SlayerArea[] {
  if (targets.length === 0) return []
  const points = pointsOn(zone, mobs, targets, cap)
  const byGroup = new Map<number, Point[]>()
  groups(points).forEach((group, i) => {
    byGroup.set(group, [...(byGroup.get(group) ?? []), points[i]])
  })
  const order = new Map(targets.map((t, i) => [t.id, i]))
  return [...byGroup.values()]
    .map((members) => areaOf(members, order))
    .sort((a, b) => b.spawns - a.spawns || a.x - b.x || a.y - b.y)
}
