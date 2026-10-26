// lib/useMetInLog.ts — FEEDS `shared/metInLog.ts` FROM THE ENGINE'S OWN MODULES, and tells the
// era-dependent views when that evidence moved.
//
// The owner ruling of 2026-10-17: the player's own log outranks a wiki era banner. A mob the log
// shows they killed, conned or looted from, an item they looted, a zone they entered, is in era for
// them. `shared/metInLog.ts` holds that evidence as module state so the PURE era predicates
// (`shared/mobEra.ts`, `shared/planner/era.ts`) can ask it; this file is the one writer.
//
// WHERE EACH KIND COMES FROM, every source the renderer is already served:
//   mobs  — `kills` (every mob killed: `KillsSnap.mobs`, display names), `loot` (every corpse
//           looted from: `LootEvent.source`) and `consider` (every mob conned: `ConsiderRow.mob`).
//   items — `loot` (every item looted: `LootEvent.item`, whatever its disposition).
//   zones — `progression` (the zone timeline: `ProgressionSnap.zoneName`, every zone line the log
//           printed), plus the zone stamped on each loot event and each con. The timeline is a
//           capped ring (4,000 zone intervals, drop-oldest), so on a very long log the oldest zone
//           entries can age out of it; the loot and con zones keep what they saw. No module lists
//           every zone ever entered beyond that.
//
// MOUNTED ONCE, at the main window's root (`App.tsx` renders `MetInLogFeed`). It is a component that
// renders nothing, so the module updates it rides re-render it alone and never the whole app. Each
// kind re-folds only when a source it reads moved (`createMetFeed`): `progression` moves about once
// a second while lines arrive, and only its zone timeline is evidence, so that is compared by content
// and a timestamp-only push folds nothing (the 2026-10-26 re-measure: ~11 ms a second on every tab).
// `setMet` still returns early on an unchanged set.
//
// RE-RENDERING THE VIEWS. An era verdict now depends on this evidence, and the evidence is module
// state React cannot see. `useMetVersion()` is the subscription: an era-dependent view reads it and
// puts it in the memo deps over a verdict, and the era chips read it so they redraw themselves.

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ConsiderSnap, KillsSnap, LootSnap, ProgressionSnap } from '@shared/types'
// RELATIVE value import (the mobSearch house law): the era join reaches this under the node runner.
import { metVersion, setMet } from '../../../shared/metInLog'
import { useModule } from './useModule'

const listeners = new Set<() => void>()

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/** The evidence's version, as React state: a view that reads it re-renders when the log meets more. */
export function useMetVersion(): number {
  return useSyncExternalStore(subscribe, metVersion)
}

/** Every mob the log names: killed, looted from, conned. Display spellings; `setMet` folds them. */
export function metMobNames(kills: KillsSnap | null, loot: LootSnap | null, consider: ConsiderSnap | null): string[] {
  const names: string[] = []
  for (const k of Object.values(kills?.mobs ?? {})) names.push(k.display)
  for (const l of loot ?? []) if (l.source !== undefined && l.source !== '') names.push(l.source)
  for (const c of consider ?? []) names.push(c.mob)
  return names
}

/** Every item the log looted. */
export function metItemNames(loot: LootSnap | null): string[] {
  return (loot ?? []).map((l) => l.item)
}

/** Every zone the log entered (the zone timeline), and the zone of every loot and con. */
export function metZoneNames(
  progression: ProgressionSnap | null,
  loot: LootSnap | null,
  consider: ConsiderSnap | null
): string[] {
  const zones = [...(progression?.zoneName ?? [])]
  for (const l of loot ?? []) if (l.zone !== undefined && l.zone !== '') zones.push(l.zone)
  for (const c of consider ?? []) if (c.zone !== undefined && c.zone !== '') zones.push(c.zone)
  return zones
}

/** The served snapshots the evidence is built from. */
export interface MetSources {
  kills: KillsSnap | null
  loot: LootSnap | null
  consider: ConsiderSnap | null
  progression: ProgressionSnap | null
}

/** The same names in the same order? Compared from the newest end, so an appended zone answers first. */
export function sameNames(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = a.length - 1; i >= 0; i--) if (a[i] !== b[i]) return false
  return true
}

/**
 * A feeder that re-folds a kind only when a source it reads moved: by identity, except the zone
 * timeline, which is compared by content (a `progression` push is a new object every time). Each
 * kind is a pure function of its sources, so a skipped kind would have folded to the set it holds.
 * Returns whether the evidence moved. `set` is `setMet`; a test passes a counting one.
 */
export function createMetFeed(set: typeof setMet = setMet): (now: MetSources) => boolean {
  let was: MetSources | null = null
  let timeline: readonly string[] = []
  return (now) => {
    const first = was === null
    const moved = (k: keyof MetSources): boolean => first || was?.[k] !== now[k]
    const nextTimeline = now.progression?.zoneName ?? []
    const timelineMoved = first || !sameNames(timeline, nextTimeline)
    const before = metVersion()
    if (moved('kills') || moved('loot') || moved('consider')) set('mobs', metMobNames(now.kills, now.loot, now.consider))
    if (moved('loot')) set('items', metItemNames(now.loot))
    if (timelineMoved || moved('loot') || moved('consider')) {
      set('zones', metZoneNames(now.progression, now.loot, now.consider))
    }
    was = now
    timeline = nextTimeline
    return metVersion() !== before
  }
}

/** Feed the evidence store from the served modules. Call it from ONE component (`MetInLogFeed`). */
export function useMetInLog(): void {
  const kills = useModule<KillsSnap>('kills')
  const loot = useModule<LootSnap>('loot')
  const consider = useModule<ConsiderSnap>('consider')
  const progression = useModule<ProgressionSnap>('progression')
  const [feed] = useState(() => createMetFeed())

  useEffect(() => {
    if (feed({ kills, loot, consider, progression })) for (const l of [...listeners]) l()
  }, [feed, kills, loot, consider, progression])
}

/** The root's mount point for the feed: renders nothing, so its updates re-render nothing else. */
export function MetInLogFeed(): null {
  useMetInLog()
  return null
}
