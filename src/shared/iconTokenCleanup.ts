// iconTokenCleanup — the kept data a robe's icon read as `1` left behind, put right once (owner,
// 2026-10-24: "can you clean up my bad data for the 1's?"). Before the fix in itemWindow.ts
// (`iconJunkDropped`) a capture of Alexa's Robe was kept as `1 Alexa's Robe`: a captured row of its
// own, its reading under that name, and a hand rename on the row. Each moves to the real name.

import { iconFree } from './itemShotKeep'
import type { CapturedItem } from './gapExtraItems'
import type { GapEdit } from './gapEdits'

/** A kept reading as this reads it: its tier (a `+N` window) and when it was kept. */
interface Kept {
  tier?: number
  at: string
}

/** Which of two readings of one item the page wants: a +0 window over a +N one, else the newer. */
function better<T extends Kept>(a: T, b: T): T {
  const [a0, b0] = [(a.tier ?? 0) === 0, (b.tier ?? 0) === 0]
  if (a0 !== b0) return a0 ? a : b
  return a.at >= b.at ? a : b
}

/** The readings with each `1 <name>` one moved onto `<name>`, the better of the two kept. */
export function cleanShots<T extends Kept>(shots: Readonly<Record<string, T>>): Record<string, T> {
  const out: Record<string, T> = {}
  for (const [name, shot] of Object.entries(shots)) {
    const to = iconFree(name)
    const there = out[to] ?? shots[to]
    out[to] = to === name || there === undefined ? shot : better(shot, there)
  }
  return out
}

/** The captured items with each `1 <name>` as `<name>`, once, at its newest time. */
export function cleanCaptured(items: readonly CapturedItem[]): CapturedItem[] {
  const out = new Map<string, CapturedItem>()
  for (const c of items) {
    const name = iconFree(c.name)
    const had = out.get(name.toLowerCase())
    if (had === undefined || c.at > had.at) out.set(name.toLowerCase(), { name, at: c.at })
  }
  return [...out.values()]
}

/**
 * Each character's hand edits less the ones on a `1 <name>` item row: the row is gone. An edit that
 * only renamed it to `<name>` was the fix itself; one with more in it moves to `<name>`'s row.
 */
export function cleanEdits(all: Readonly<Record<string, Readonly<Record<string, GapEdit>>>>): Record<string, Record<string, GapEdit>> {
  const out: Record<string, Record<string, GapEdit>> = {}
  for (const [who, edits] of Object.entries(all)) {
    const mine: Record<string, GapEdit> = {}
    for (const [key, edit] of Object.entries(edits)) {
      const m = /^item:(.*)$/.exec(key)
      const to = m === null ? undefined : iconFree(m[1])
      if (m === null || to === undefined || to === m[1]) {
        mine[key] = edit
        continue
      }
      const { name, ...rest } = edit
      const kept: GapEdit = name === undefined || name === to ? rest : edit
      if (Object.keys(kept).length > 0 && mine[`item:${to}`] === undefined) mine[`item:${to}`] = kept
    }
    out[who] = mine
  }
  return out
}
