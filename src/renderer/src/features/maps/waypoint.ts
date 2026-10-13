// waypoint.ts — a map position as the `/waypoint` command EverQuest Legends takes, ready to paste.
//
// THE COMMAND IS THE GAME'S OWN. `eqstr_us.txt` in the install, string 8326: "Usage: /waypoint
// x, y, z. This command allows you to draw a path to a specific location using x, y, and
// optionally z coordinates in your current zone. The location will also be marked on your map."
// The ask (vorpaldicepress on Discord, via the owner, 2026-10-13) called it `/way`; the game's
// string names `/waypoint`, so that is the word written. Zone is not part of it: the path is
// drawn in the zone you are standing in.
//
// THE ORDER IS /loc's: north/south, then west/east, then elevation. The usage string says "x, y"
// and /loc prints north/south first, so which of the two the game calls x is not settled by any
// file in the install. Players paste /loc output into chat as waypoints (`/waypoint 1377, 1172`
// in the owner's log, 2026-10-11), and that is the order written here. ONE constant decides it,
// so if a test in game shows the marker landing mirrored across the diagonal, the fix is here.
//
// THE CONVERSION IS `locFromMap` (mapGeometry.ts), the measured inverse of the pins' transform,
// so a waypoint copied off a pin names the same spot the wiki stated. Nothing re-derives it.

import { locFromMap } from './mapGeometry'

/** Which /loc reading comes first in the command. See the header: one switch, one place. */
const NS_FIRST = true

/** Whole numbers: the path needs no centimetres, and a short line pastes cleanly. */
function whole(n: number): string {
  const r = Math.round(n)
  // `Math.round(-0.4)` is -0, which String() prints as "0" anyway; this keeps `-0` from ever
  // reaching the clipboard through a later change of formatter.
  return String(r === 0 ? 0 : r)
}

/**
 * Map-file coordinates → `/waypoint a, b[, z]`.
 *
 * Elevation is written only when it is known: a mob pin carries none (about 2% of wiki pages
 * state a third number) and a double-click on the map has none, and the game takes z as
 * optional. A made-up 0 would draw the path to the wrong floor of a multi-level zone.
 */
export function waypointCommand(p: { x: number; y: number; z?: number }): string {
  const loc = locFromMap({ x: p.x, y: p.y, z: p.z ?? 0 })
  const pair = NS_FIRST ? [loc.ns, loc.ew] : [loc.ew, loc.ns]
  const parts = pair.map(whole)
  if (p.z !== undefined && Number.isFinite(p.z)) parts.push(whole(p.z))
  return `/waypoint ${parts.join(', ')}`
}
