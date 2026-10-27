// character/useDeity — the character's deity, folded, or null.
//
// R2's fourth condition (owner report 2026-09-11) needs one string, and `shared/planner/deity.ts`
// carries the whole argument for why deity is checkable where race is not.
//
// ── WHY NOT `useProgress` ─────────────────────────────────────────────────────────────────────
//
// `features/posky/useProgress` is the other reader of this store, and it is the PoSky tab's whole
// model: a loot-history module subscription, the count-source preference, the quest fold. Mounting
// six hundred lines of that to read one string would be the tail wagging the dog, and it would tie
// the Character tab's advice to a hook that changes for PoSky reasons.
//
// WHAT IS ACTUALLY SHARED IS THE DOOR, and both use it: `window.eq.getProgress()` plus the
// `onProgress` push. The three lines below are that door, not a second copy of that hook - the
// same relationship `useGearIndex` has with every feature that reads the corpus.
//
// ── IT PUSHES, BECAUSE THE DEITY CAN ARRIVE MID-SESSION ───────────────────────────────────────
//
// A player who types `/outputfile achievements` while the app is open should see the advice narrow
// without restarting it. Main writes the store and emits `onProgress`; this listens, exactly as
// the inventory sheet listens for its own reload.

import { useEffect, useState } from 'react'
import { deityKey } from '@shared/planner/deity'

/** The last answer this window read, so a remount starts from it rather than re-rendering on the read. */
let heldDeity: string | null = null

/**
 * The FOLDED deity key, or null when nothing has stated one.
 *
 * NULL IS THE ORDINARY ANSWER and it means UNKNOWN rather than "none" - most players have never
 * typed the command. Every consumer treats it as "do not filter" (`deityFits`), so a character we
 * know nothing about gets the advice he always got.
 */
export function useDeity(): string | null {
  const [deity, setDeity] = useState<string | null>(heldDeity)
  useEffect(() => {
    const read = (p: { deity?: string } | null): void => {
      heldDeity = p?.deity === undefined ? null : deityKey(p.deity)
      setDeity(heldDeity)
    }
    // A push is newer than the initial read, so a reply that lands after one is stale; a failed
    // read leaves the deity unknown, which every consumer already handles.
    let pushed = false
    void window.eq
      .getProgress()
      .then((p) => {
        if (!pushed) read(p)
      })
      .catch(() => undefined)
    const off = window.eq.onProgress((p) => {
      pushed = true
      read(p)
    })
    return off
  }, [])
  return deity
}
