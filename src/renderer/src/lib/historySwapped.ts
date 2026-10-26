// lib/historySwapped.ts — when a celebration baseline (boss kills, Sky turn-ins) must re-seed.
//
// A detector that fires on a count rising seeds its baseline silently from the first snapshot it
// sees. Two moments hand it a snapshot whose rise the player did not just make: a character
// switch, and the world-changed frame (the engine went live or away, or archived history was
// shown, hidden or refreshed: main/logArchive/actions.ts). Both mean "seed again, celebrate nothing".

import { MODULE_WORLD_CHANGED } from '../../../shared/types'

/** Calls `cb` on a character switch and on the world-changed frame. Returns the unsubscribe. */
export function onHistorySwapped(cb: () => void): () => void {
  const offChar = window.eq.onCharacter(() => cb())
  const offWorld = window.eq.onModuleChanged((c) => {
    if (c.moduleId === MODULE_WORLD_CHANGED) cb()
  })
  return () => {
    offChar()
    offWorld()
  }
}
