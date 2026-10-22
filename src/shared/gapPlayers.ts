// gapPlayers — names that are never a Gaps row: the ones the player marked as players (Mobs rows),
// and the player's own characters (any row; owner, 2026-10-22: a /con with nothing targeted filed the
// player as a "may be a player" Mobs row, "this is me").

import type { GapRow } from './gaps'

/** The names the player marked as players, lower-cased, with the player's own characters beside them. */
export interface PlayerNames extends ReadonlySet<string> {
  /** Every character in the Logs folder (`eqlog_<Name>_<server>.txt`), lower-cased: never a row in any domain. */
  readonly own?: ReadonlySet<string>
}

const NO_OWN: ReadonlySet<string> = new Set()

/** The marked players and the player's own character names, as `withoutPlayers` reads them. */
export function playerNames(marked: Iterable<string>, own: Iterable<string>): PlayerNames {
  return Object.assign(new Set(marked), { own: new Set([...own].map((n) => n.toLowerCase())) })
}

/** The rows less the Mobs rows the player marked as players, and less every row named for an own character. */
export function withoutPlayers(rows: readonly GapRow[], players: PlayerNames): GapRow[] {
  const own = players.own ?? NO_OWN
  if (players.size === 0 && own.size === 0) return [...rows]
  return rows.filter((r) => !own.has(r.name.toLowerCase()) && (r.domain !== 'mob' || !players.has(r.name.toLowerCase())))
}
