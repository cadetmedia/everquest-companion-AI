// shotTrigger.ts — what starts a capture of the EverQuest window (phase 3 of screenshot to wiki;
// owner, 2026-10-21: "i like the macro log thing, it makes it so that we don't touch the keyboard
// or game and stay faithful to the log reading only. I also like B too, lets do both? and avoid C").
// No system-wide key: (A) the player's own social macro writes a marker line with /echo and the app
// captures when the LIVE log shows it; (B) a button on an overlay. Both run one capture
// (main/ipc/shotCapture.ts). Pure, so the line rule and the debounce are tested apart from Electron.

import type { ItemShotReply } from './itemWindow'

/** The words the macro writes; matched whole, any case. */
export const CAPTURE_MARKER = 'eqc capture'

/** The one line of the social macro the player makes. */
export const CAPTURE_MACRO = `/echo ${CAPTURE_MARKER}`

/**
 * The marker alone after the timestamp, as /echo writes it. A say, tell, emote or channel line
 * starts with its speaker, so no other player can start a capture.
 */
export const CAPTURE_LINE_REGEX = '^\\[[^\\]]+\\] eqc capture\\s*$'

const CAPTURE_LINE = new RegExp(CAPTURE_LINE_REGEX, 'i')

/** Whether a raw log line (timestamp included) is the macro's marker. */
export const isCaptureLine = (line: string): boolean => CAPTURE_LINE.test(line)

/** A marker line further than this from the clock is not the player pressing the macro now. */
export const RECENT_MS = 60_000

/** Presses closer than this are one (a double click on the hotbar, a macro pressed twice). */
export const DEBOUNCE_MS = 1500

/**
 * The gate every capture goes through: answers whether a press at `now` runs. A marker line's own
 * time (`lineAt`, ms epoch) must be recent; an overlay click has none.
 */
export function captureGate(debounceMs = DEBOUNCE_MS): (now: number, lineAt?: number) => boolean {
  let last = Number.NEGATIVE_INFINITY
  return (now, lineAt) => {
    if (lineAt !== undefined && Math.abs(now - lineAt) > RECENT_MS) return false
    if (now - last < debounceMs) return false
    last = now
    return true
  }
}

/** One capture, waiting for the Gaps tab to file it. */
export interface Captured {
  at: string
  /** What started it: the macro's log line or the overlay's button. */
  via?: 'macro' | 'overlay'
  /** The captured window's title (several clients: which one was read). */
  window?: string
  reply?: ItemShotReply
  /** Why nothing was read. */
  error?: string
  ms: number
}
