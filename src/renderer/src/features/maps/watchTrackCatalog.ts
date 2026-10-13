// The overlay's door to `watchedPoints`: it binds the 3 MB mob catalog, so the Map pins window
// imports this file dynamically and no other overlay window loads the catalog.

import type { RespawnWatchPref } from '@shared/respawn'
import { MOB_CATALOG } from '../mobs/mobSearch'
import type { TrackedPoint } from './mapTrack'
import { watchedPoints } from './watchTrack'

export function watchedPointsHere(stem: string | null, watches: readonly RespawnWatchPref[]): TrackedPoint[] {
  return watchedPoints(stem, watches, MOB_CATALOG)
}
