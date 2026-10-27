// lib/characterEpoch.ts — WHICH CHARACTER A WINDOW-HELD VALUE WAS READ FOR.
//
// A few hooks keep their last read at module scope so a tab's revisit paints with it instead of
// rendering twice (the second optimization pass). That value belongs to the character it was read
// for: after a switch, a remount must start empty, as it did before, and never flash the previous
// character's ownership, deity or name. The epoch counts `onCharacter` pushes; a held value is
// reused only under the epoch it was read in.
//
// The bridge listener is attached on the first call, as moduleStore attaches its own: nothing is
// held before that call, so no switch before it can matter.

let epoch = 0
let listening = false

/** The current character epoch; it moves on every character push. */
export function characterEpoch(): number {
  if (!listening && typeof window !== 'undefined') {
    const eq = (window as { eq?: { onCharacter?: (cb: () => void) => () => void } }).eq
    if (eq?.onCharacter !== undefined) {
      listening = true
      eq.onCharacter(() => {
        epoch += 1
      })
    }
  }
  return epoch
}

/** A value read for one character: the epoch it was read in. */
export interface Held<T> {
  epoch: number
  value: T
}

/** The held value when it was read for the current character, else undefined. */
export function heldNow<T>(held: Held<T> | null): T | undefined {
  return held !== null && held.epoch === characterEpoch() ? held.value : undefined
}

/** Hold `value` as read in epoch `asked`; a reply that lands after a switch is not held. */
export function holdFor<T>(asked: number, value: T): Held<T> | null {
  return asked === characterEpoch() ? { epoch: asked, value } : null
}
