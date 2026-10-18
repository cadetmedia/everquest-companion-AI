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
// renders nothing, so the module updates it rides re-render it alone and never the whole app. The
// name arrays are memoized per source and `setMet` itself returns early on an unchanged set, so a
// snapshot that moved for another reason (a con's enrichment landing) costs one comparison.
//
// RE-RENDERING THE VIEWS. An era verdict now depends on this evidence, and the evidence is module
// state React cannot see. `useMetVersion()` is the subscription: an era-dependent view reads it and
// puts it in the memo deps over a verdict, and the era chips read it so they redraw themselves.

import { useEffect, useMemo, useSyncExternalStore } from 'react'
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

/** Feed the evidence store from the served modules. Call it from ONE component (`MetInLogFeed`). */
export function useMetInLog(): void {
  const kills = useModule<KillsSnap>('kills')
  const loot = useModule<LootSnap>('loot')
  const consider = useModule<ConsiderSnap>('consider')
  const progression = useModule<ProgressionSnap>('progression')

  const mobs = useMemo(() => metMobNames(kills, loot, consider), [kills, loot, consider])
  const items = useMemo(() => metItemNames(loot), [loot])
  const zones = useMemo(() => metZoneNames(progression, loot, consider), [progression, loot, consider])

  useEffect(() => {
    const before = metVersion()
    setMet('mobs', mobs)
    setMet('items', items)
    setMet('zones', zones)
    if (metVersion() !== before) for (const l of [...listeners]) l()
  }, [mobs, items, zones])
}

/** The root's mount point for the feed: renders nothing, so its updates re-render nothing else. */
export function MetInLogFeed(): null {
  useMetInLog()
  return null
}
