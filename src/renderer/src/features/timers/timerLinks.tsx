// The Timers tab's two doors (owner ask, 2026-10-23): a mob's name opens its Mobs page, its zone
// opens the Maps tab on that zone. Both wear the app's one link idiom, `CellLink`; with no opener
// handed in they are the plain text they were.

import type { JSX } from 'react'
import type { ZoneShort } from '@shared/maps'
import { zoneShortName } from '@shared/zones'
import { CellLink } from '../../lib/CellLink'
import type { MobTarget } from '../mobs/mobTarget'

/** App's `openMob` and `openMapZone`, as one object so a memoized row takes one stable prop. */
export interface TimerLinks {
  openMob: (t: MobTarget) => void
  openMapZone: (zone: ZoneShort) => void
}

export function MobNameLink({ name, links }: { name: string; links?: TimerLinks | undefined }): JSX.Element {
  if (links === undefined) return <>{name}</>
  return <CellLink text={name} onOpen={() => { links.openMob({ mob: name }) }} />
}

/** A zone the app has no map for stays plain text: the Maps tab would have nothing to show. */
export function ZoneLink({ zone, links }: { zone: string; links?: TimerLinks | undefined }): JSX.Element {
  const label = zone.length > 0 ? zone : 'unknown zone'
  const stem = links === undefined ? null : zoneShortName(zone)
  if (links === undefined || stem === null) return <>{label}</>
  return <CellLink text={label} onOpen={() => { links.openMapZone(stem) }} />
}
