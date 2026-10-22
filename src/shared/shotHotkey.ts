// shotHotkey.ts — the capture hotkey's rules (phase 3 of screenshot to wiki; owner, 2026-10-21).
// A key pressed in the game reaches the hotkey before the game, so it must not be a key the game
// uses alone: Ctrl, Alt or Win is required (the idea from AustonZ/EQL-Wiki-Editor-Assistant, MIT;
// no code taken). Off until the player picks one: no default steals a key from the game.

import type { ItemShotReply } from './itemWindow'

/** One capture, waiting for the Gaps tab to file it. */
export interface Captured {
  at: string
  /** The captured window's title (several clients: which one was read). */
  window?: string
  reply?: ItemShotReply
  /** Why nothing was read. */
  error?: string
  ms: number
}

/** What a key press says, as a browser KeyboardEvent carries it. */
export interface KeyPress {
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
  /** `KeyboardEvent.code`: `KeyS`, `Digit5`, `F9`, `Numpad1`. */
  code: string
}

const MODIFIERS = new Set(['Ctrl', 'Control', 'CommandOrControl', 'CmdOrCtrl', 'Alt', 'Super', 'Meta', 'Command', 'Cmd', 'Shift'])
const REQUIRED = new Set(['Ctrl', 'Control', 'CommandOrControl', 'CmdOrCtrl', 'Alt', 'Super', 'Meta', 'Command', 'Cmd'])

/** The key part of a press, as Electron's accelerator names it; undefined for a modifier alone or a key it cannot name. */
function keyName(code: string): string | undefined {
  const m = /^(?:Key([A-Z])|Digit(\d)|(F\d{1,2})|Numpad(\d))$/.exec(code)
  if (m === null) return undefined
  return m[1] ?? m[2] ?? m[3] ?? (m[4] === undefined ? undefined : `num${m[4]}`)
}

/** A press as an accelerator (`Ctrl+Alt+S`); undefined until a key beside the modifiers is down. */
export function acceleratorOf(p: KeyPress): string | undefined {
  const key = keyName(p.code)
  if (key === undefined) return undefined
  return [p.ctrlKey ? 'Ctrl' : '', p.altKey ? 'Alt' : '', p.shiftKey ? 'Shift' : '', p.metaKey ? 'Super' : '', key].filter(Boolean).join('+')
}

/** Why an accelerator cannot be the hotkey, in the player's words; undefined when it can. */
export function hotkeyProblem(accel: string): string | undefined {
  const parts = accel.split('+').map((s) => s.trim()).filter(Boolean)
  const keys = parts.filter((p) => !MODIFIERS.has(p))
  if (keys.length !== 1) return 'Press one key with Ctrl, Alt or Win held.'
  if (!parts.some((p) => REQUIRED.has(p))) return 'Hold Ctrl, Alt or Win with the key: a key alone (or with Shift) is the game\'s.'
  return undefined
}
