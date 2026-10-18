// THE WATCH-LIST WRITES (JOS-194; the kept-number half is the owner's ruling of 2026-10-17).
//
// Every edit a surface can make to the respawn watch list, as pure functions over `RespawnPrefs`:
// watch a mob, type its number or clear it, unwatch it, unwatch a scope's worth of them. Main calls
// these and nothing else does the editing — each IPC door names ONE mob (or, for Clear all, a list
// of them) and main applies the matching function to the STORED list, so no renderer ever holds
// the whole list to rewrite it and no surface can lose a watch it did not touch (round 4's
// argument, in src/main/ipc/respawn.ts).
//
// ITS OWN FILE because shared/respawn.ts is at the repo's 400-code-line ceiling, and because these
// are the one part of the feature that is about the USER'S list rather than the fold's rows. The
// vocabulary (`RespawnPrefs`, `RespawnKeptCustom`, the bounds, `canonRespawnKey`) stays there,
// beside the normalizer every one of these results passes through on its way to the store.
//
// THE RULE ALL FOUR WRITES KEEP: A TYPED NUMBER IS MOVED, NEVER DROPPED BY ACCIDENT. A name lives in
// at most one of `watches` and `keptCustom`. Unwatch moves its `customSec` to the kept list; Watch
// moves it back; typing a number replaces it; and the edit modal's way back to the calculated
// number is the ONE write that throws a typed number away, because that is what it was asked to
// do. The argument is in shared/respawn.ts's header (Clear all section).

import {
  RESPAWN_MAX_KEPT,
  RESPAWN_MAX_WATCHES,
  canonRespawnKey,
  type RespawnKeptCustom,
  type RespawnPrefs,
  type RespawnRow,
  type RespawnWatchPref
} from './respawn'

/**
 * Longest mob key an IPC door will look at — the same 64 `canonRespawnKey` slices a stored key to,
 * so a string a door accepts is a string that could have been stored in the first place. Here so
 * the single unwatch and Clear all apply ONE test, and so that test can be pinned without Electron.
 */
export const RESPAWN_MAX_KEY_LEN = 64

/** A mob key a door accepts: a non-empty string no longer than `RESPAWN_MAX_KEY_LEN`. */
export function isRespawnMobKey(key: unknown): key is string {
  return typeof key === 'string' && key.length > 0 && key.length <= RESPAWN_MAX_KEY_LEN
}

/**
 * Clear all's payload, validated: the keys when it is a non-empty array of at most
 * `RESPAWN_MAX_WATCHES` keys that EACH pass `isRespawnMobKey`, otherwise null and the whole call is
 * refused — a half-applied Clear all is a state no dialog described.
 */
export function respawnClearKeys(keys: unknown): string[] | null {
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > RESPAWN_MAX_WATCHES) return null
  return keys.every(isRespawnMobKey) ? keys : null
}

/** The kept list with one name taken out. */
function keptWithout(kept: readonly RespawnKeptCustom[] | undefined, key: string): RespawnKeptCustom[] {
  return (kept ?? []).filter((k) => k.key !== key)
}

/** `prefs` carrying `kept`, newest `RESPAWN_MAX_KEPT` only, and no field at all when it is empty. */
function withKept(prefs: RespawnPrefs, kept: RespawnKeptCustom[]): RespawnPrefs {
  const next: RespawnPrefs = { ...prefs }
  delete next.keptCustom
  if (kept.length > 0) next.keptCustom = kept.slice(-RESPAWN_MAX_KEPT)
  return next
}

/**
 * STOP WATCHING ONE MOB — round 4's write, and since 2026-10-17 it keeps the number you typed.
 *
 * Pure, and shared by every surface through the IPC handlers that call it, so "stop watching this"
 * has ONE definition: the clock row in the tab, the row in the floating window, the Recently-killed
 * entry and Clear all cannot drift into four ideas of what the button did. The key is canonicalized
 * the way the store canonicalizes what it holds, so a row's `key` and a hand-edited settings file
 * land on the same entry.
 *
 * WHAT GOES IS THE WATCH. A `customSec` on the entry moves to the newest end of `keptCustom`, where
 * `respawnWithWatch` finds it again; an entry with no typed number leaves the kept list alone.
 *
 * Removing a name that is not watched is not an error and not a special case: it returns the prefs
 * it was given, and the caller decides whether an unchanged list is worth persisting. That is what
 * a click racing a delta looks like.
 */
export function respawnWithoutWatch(prefs: RespawnPrefs, key: string): RespawnPrefs {
  const want = canonRespawnKey(key)
  const gone = prefs.watches.find((w) => w.key === want)
  if (gone === undefined) return prefs
  const watches = prefs.watches.filter((w) => w.key !== want)
  if (gone.customSec === undefined) return { ...prefs, watches }
  const kept = [...keptWithout(prefs.keptCustom, want), { key: want, customSec: gone.customSec }]
  return withKept({ ...prefs, watches }, kept)
}

/**
 * CLEAR ALL: `respawnWithoutWatch` once per key, as ONE value the caller stores in one write.
 *
 * Nothing new is decided here, which is the point — Clear all means exactly what that many single
 * Unwatches would mean, typed numbers kept included. A key that is not watched is skipped the way
 * the single write skips it, and a key given twice is cleared once.
 */
export function respawnWithoutWatches(prefs: RespawnPrefs, keys: readonly string[]): RespawnPrefs {
  let next = prefs
  for (const key of keys) next = respawnWithoutWatch(next, key)
  return next
}

/**
 * WATCH A MOB — the Recently-killed panel's Watch, and the only door a clock comes through.
 *
 * A number the player typed before an earlier unwatch comes back with the watch (2026-10-17), so
 * the clock returns exactly as it was. Already watched is a no-op returning the same prefs — a
 * second click must never overwrite the entry and with it the number typed on it — and so is a
 * full list, which the normalizer would otherwise truncate AFTER the kept number had been taken out
 * of the kept list.
 */
export function respawnWithWatch(prefs: RespawnPrefs, key: string, display: string): RespawnPrefs {
  const want = canonRespawnKey(key)
  if (want.length === 0 || prefs.watches.some((w) => w.key === want)) return prefs
  if (prefs.watches.length >= RESPAWN_MAX_WATCHES) return prefs
  const keptSec = prefs.keptCustom?.find((k) => k.key === want)?.customSec
  const entry: RespawnWatchPref = keptSec === undefined ? { key: want, display } : { key: want, display, customSec: keptSec }
  return withKept({ ...prefs, watches: [...prefs.watches, entry] }, keptWithout(prefs.keptCustom, want))
}

/**
 * THE WHOLE-LIST REPLACE (`respawn:set`), held to the same promise as the key-shaped writes.
 *
 * Another surface (the Maps tab) still adds watches by sending the whole list, so the replace has
 * to keep the kept numbers honest too rather than let the normalizer silently drop them:
 *
 *   * a name NEWLY watched by `incoming`, arriving with no `customSec`, gets its kept number back
 *     (and leaves the kept list), exactly as `respawnWithWatch` does;
 *   * a newly watched name arriving WITH its own `customSec` keeps its own, and its kept copy goes;
 *   * a name that was already watched is taken as `incoming` states it, as the replace always did;
 *   * a name `incoming` no longer watches sets its typed number aside, as `respawnWithoutWatch`
 *     does — so an unwatch by replace keeps the number an unwatch by key keeps;
 *   * every other kept number stays kept.
 *
 * `incoming` should be the normalized list (canonical keys); main passes it through
 * `normalizeRespawnPrefs` first, which is also the door's validation.
 */
export function respawnWithWatchList(stored: RespawnPrefs, incoming: readonly RespawnWatchPref[]): RespawnPrefs {
  const keptSec = new Map((stored.keptCustom ?? []).map((k) => [k.key, k.customSec]))
  const before = new Set(stored.watches.map((w) => w.key))
  const watches = incoming.map((w) => {
    const sec = keptSec.get(w.key)
    return before.has(w.key) || w.customSec !== undefined || sec === undefined ? w : { ...w, customSec: sec }
  })
  const now = new Set(watches.map((w) => w.key))
  let kept = (stored.keptCustom ?? []).filter((k) => !now.has(k.key))
  for (const w of stored.watches) {
    if (now.has(w.key) || w.customSec === undefined) continue
    kept = [...keptWithout(kept, w.key), { key: w.key, customSec: w.customSec }]
  }
  return withKept({ ...stored, watches }, kept)
}

/**
 * TYPE A MOB'S NUMBER, OR CLEAR IT — the edit modal's Save and its way back (round 9).
 *
 * With a number, the watch carries it (the entry is updated in place, or added when the row's watch
 * went away while the modal was open, which is what the round-7 box always did). Without one, the
 * watch goes back to what the ladder calculates, AND any kept copy of an older typed number is
 * dropped with it: a cleared override must not come back on the next unwatch-and-watch.
 */
export function respawnWithCustom(prefs: RespawnPrefs, key: string, display: string, sec?: number): RespawnPrefs {
  const want = canonRespawnKey(key)
  if (want.length === 0) return prefs
  const entry: RespawnWatchPref = sec === undefined ? { key: want, display } : { key: want, display, customSec: sec }
  let watches = prefs.watches.map((w) => (w.key === want ? entry : w))
  if (sec !== undefined && !prefs.watches.some((w) => w.key === want)) watches = [...watches, entry]
  return withKept({ ...prefs, watches }, keptWithout(prefs.keptCustom, want))
}

// ─────────────────────────────────────────────────────────────────────────────
// CLEAR ALL ON THE TIMERS TAB
// ─────────────────────────────────────────────────────────────────────────────

/** What one Clear all will do, worked out before the dialog asks. */
export interface RespawnClearPlan {
  /** The distinct mob keys to unwatch — what the IPC carries. */
  keys: string[]
  /** How many clocks the current scope shows, i.e. what the button is clearing. */
  clocks: number
  /**
   * How many clocks OUTSIDE the scope stop as well, because they belong to the same names. A watch
   * is a name and follows it into every zone (round 4), so clearing a zone's clocks also clears
   * those; the dialog says so rather than letting the user find out.
   */
  elsewhere: number
}

/**
 * The plan for clearing `shown` (the rows the scope is showing) out of `all` (every row the fold
 * published). Pure and here rather than in the view because it filters served rows, which the
 * renderer does not do (owner ruling 4).
 */
export function respawnClearPlan(shown: readonly RespawnRow[], all: readonly RespawnRow[]): RespawnClearPlan {
  const keys = [...new Set(shown.map((r) => r.key))]
  const want = new Set(keys)
  const ids = new Set(shown.map((r) => r.id))
  const elsewhere = all.filter((r) => want.has(r.key) && !ids.has(r.id)).length
  return { keys, clocks: shown.length, elsewhere }
}

/** The Clear all dialog's words. `zone` is the zone the scope shows, or null for all zones. */
export function respawnClearAllText(plan: RespawnClearPlan, zone: string | null): { title: string; body: string } {
  const clocks = `${String(plan.clocks)} clock${plan.clocks === 1 ? '' : 's'}`
  const title = zone === null ? `Clear all ${clocks} in all zones?` : `Clear all ${clocks} in ${zone}?`
  const mobs = `${String(plan.keys.length)} mob${plan.keys.length === 1 ? '' : 's'}`
  const elsewhere =
    plan.elsewhere > 0
      ? ` A watch follows the name, so this also stops ${String(plan.elsewhere)} clock${plan.elsewhere === 1 ? '' : 's'} for the same names in other zones.`
      : ''
  const body = `This stops watching ${mobs}.${elsewhere} Their kills stay, and a respawn you typed comes back if you watch the mob again.`
  return { title, body }
}
