// shotTrigger.ts — what starts a capture of the EverQuest window (phase 3 of screenshot to wiki;
// owner, 2026-10-21: "i like the macro log thing, it makes it so that we don't touch the keyboard
// or game and stay faithful to the log reading only. I also like B too, lets do both? and avoid C").
// No system-wide key: (A) the player's own social macro says a marker on a private chat channel and
// the app captures when the LIVE log shows it; (B) a button on an overlay. Both run one capture
// (main/ipc/shotCapture.ts). Pure, so the line rule and the debounce are tested apart from Electron.
//
// The channel (owner, 2026-10-21, measured in the owner's log): the game has no /echo; `/tell` to
// oneself prints only "Talking to yourself again?"; `/say` is public. After `/join eqckaltinril` the
// log prints `Channels: 1=General(214), 2=eqckaltinril(1)` and the macro's line logs as
// `You tell eqckaltinril:2, 'eqc capture'`. One channel per character (`eqc` + the name): a shared
// name would show every app user's captures to each other.

import type { ItemShotReply } from './itemWindow'

/** The words the macro says; matched whole, any case. */
export const CAPTURE_MARKER = 'eqc capture'

/** The private channel the character joins for the macro: `eqckaltinril`. */
export const captureChannel = (character: string): string => `eqc${character.toLowerCase().replace(/[^a-z]/g, '')}`

/**
 * The player's OWN line on an eqc channel, as the game logs a channel message: `You tell
 * eqckaltinril:2, 'eqc capture'`. Another player's line starts with their name (`Soandso tells
 * eqckaltinril:2, ...`), so no one else can start a capture.
 */
export const CAPTURE_LINE_REGEX = "^\\[[^\\]]+\\] You tell eqc[^:,' ]*:\\d+, 'eqc capture'\\s*$"

const CAPTURE_LINE = new RegExp(CAPTURE_LINE_REGEX, 'i')

/** Whether a raw log line (timestamp included) is the macro's marker. */
export const isCaptureLine = (line: string): boolean => CAPTURE_LINE.test(line)

/** The line the game prints on /join and /list (and at login): every channel with its number. */
export const CHANNELS_LINE_REGEX = '^\\[[^\\]]+\\] Channels: '

/** A Channels line's numbers by channel name, lower-cased: `{ general: 1, eqckaltinril: 2 }`; null for another line. */
export function channelNumbers(line: string): Record<string, number> | null {
  if (!new RegExp(CHANNELS_LINE_REGEX, 'i').test(line)) return null
  return Object.fromEntries([...line.matchAll(/(\d+)=([^(,\s]+)\(/g)].map((m) => [m[2].toLowerCase(), Number(m[1])]))
}

/** What the player is shown: the join command, the macro line when the channel's number is known, and the words. */
export interface CaptureHowTo {
  join: string
  macro?: string
  text: string
}

/**
 * The macro for a character, from the latest Channels line (the number depends on join order). With
 * no number known yet, where its number comes from. A few words (owner, 2026-10-21: "we just hit
 * them with so much text to read"); the bar's tooltip says the rest.
 */
export function captureHowTo(character: string | null, channels: Readonly<Record<string, number>>): CaptureHowTo {
  const channel = character === null || character === '' ? 'eqc<yourname>' : captureChannel(character)
  const join = `/join ${channel}`
  const n = channels[channel]
  if (n === undefined) {
    return { join, text: `${join}, then /list for its number` }
  }
  const macro = `/${String(n)} ${CAPTURE_MARKER}`
  return { join, macro, text: `${join}, then macro ${macro}` }
}

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
