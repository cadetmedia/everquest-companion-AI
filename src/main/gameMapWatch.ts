// gameMapWatch.ts — is the in-game map open? Watched for the Map pins overlay, which can hide while
// it is closed (owner ask, 2026-10-13; the reading rules are shared/gameMapIni.ts).
//
// READ-ONLY AND LIGHT: one stat of one file every half second, and a read only when its mtime
// moved, and only while the Map pins window exists; it stops itself when the window is gone. The
// character's file is re-found every 15 s, so a character switch follows within that.
//
// OFF MAIN'S THREAD (performance review 2026-10-20, finding 9). Every stat, listing and read is
// `fs/promises`, so the disk work runs on libuv's pool and main only wakes to compare an mtime: a
// slow or scanned disk can no longer stall the thread that answers IPC. The next look is armed when
// the last one is done (or given up after 5 s, never to commit), so two never overlap; after a give-up
// no look starts until the hung call settles, so a stuck disk holds one pool thread, not all four. Detection
// latency is what it was: EQ writes the file within about a second of an M press (gameMapIni.ts),
// and this sees the write within 500 ms of it.
// `fs.watch` was not used: one stat per half second is already cheap, and a missed notification
// (a network drive, an editor's rename) would leave the overlay wrong until something else moved.

import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { IPC } from '../shared/ipc'
import { parseMapShown, pickUiIni } from '../shared/gameMapIni'
import { resolveActiveCharacter } from './log/config'
import { getOverlayWindow } from './windows'

const POLL_MS = 500
const REFIND_MS = 15_000
/** No file yet (no character, or not logged in): look again sooner than a switch is checked. */
const MISS_MS = 2_000
/** A look still out after this is given up, so a disk call that never settles cannot stop the watch. */
const LOOK_TIMEOUT_MS = 5_000

let timer: ReturnType<typeof setTimeout> | null = null
let running = false
let path: string | null = null
let foundAt = 0
let mtime = 0
let shown: boolean | null = null
/** The look in progress, so the first ask and a tick never run two at once. */
let looking: Promise<void> | null = null
/** Bumped by every stop; a look started before it commits nothing. */
let generation = 0
/** Bumped by every look and every look given up on; only the newest look commits. */
let lookId = 0
/** A given-up look's disk call, until it settles: it still holds a libuv pool thread (of 4), so no
 *  look starts beside it. A stop leaves it, since the thread stays busy either way. */
let hung: Promise<void> | null = null

async function findIni(): Promise<string | null> {
  const c = resolveActiveCharacter()
  if (c == null) return null
  // The logs folder sits in the game folder, beside the UI files.
  const root = dirname(dirname(c.logPath))
  const names = (await readdir(root)).filter((n) => n.toLowerCase().startsWith('ui_'))
  const files = await Promise.all(
    names.map(async (n) => ({ name: n, mtime: (await stat(join(root, n))).mtimeMs }))
  )
  const name = pickUiIni(files, c.name, c.server)
  return name == null ? null : join(root, name)
}

/**
 * One look at the disk. Its answers are committed only while it is `live`: no stop came while it was
 * out, and it was not given up on. A look that lands after the window closed must not seed the next
 * watch with the last file.
 */
async function read(live: () => boolean): Promise<void> {
  const now = Date.now()
  let file = path
  let known = mtime
  if (foundAt === 0 || now - foundAt > (path == null ? MISS_MS : REFIND_MS)) {
    // Stamped first, so a find that throws is not retried on every tick.
    foundAt = now
    const next = await findIni()
    if (!live()) return
    if (next !== file) known = 0
    file = next
    path = next
    mtime = known
  }
  if (file == null) {
    // No file to read: the answer is "cannot be found", never the last file's.
    shown = null
    return
  }
  const m = (await stat(file)).mtimeMs
  if (m === known) return
  const text = await readFile(file, 'latin1')
  if (!live()) return
  mtime = m
  shown = parseMapShown(text)
}

/** Settles with `p`, or after LOOK_TIMEOUT_MS having called `giveUp`. */
function timeLimited(p: Promise<void>, giveUp: () => void): Promise<void> {
  let t: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<void>((resolve) => {
    t = setTimeout(() => {
      giveUp()
      resolve()
    }, LOOK_TIMEOUT_MS)
  })
  return Promise.race([p, late]).finally(() => clearTimeout(t))
}

/** One look, its errors kept: mid-write, locked, gone or hung keeps the last answer for the next. */
function look(): Promise<void> {
  if (looking) return looking
  // A hung disk: the last answer stands, and the cadence resumes once that call settles.
  if (hung) return Promise.resolve()
  const gen = generation
  const id = ++lookId
  const reading = read(() => gen === generation && id === lookId).catch(() => undefined)
  const p = timeLimited(reading, () => {
    if (id === lookId) lookId++
    hung = reading
    void reading.finally(() => {
      if (hung === reading) hung = null
    })
  }).finally(() => {
    if (looking === p) looking = null
  })
  looking = p
  return p
}

function arm(): void {
  if (running) timer = setTimeout(() => void tick(), POLL_MS)
}

async function tick(): Promise<void> {
  timer = null
  const w = getOverlayWindow('mapPins')
  if (w == null || w.isDestroyed()) {
    stopGameMapWatch()
    return
  }
  const was = shown
  const gen = generation
  await look()
  // Stopped (or stopped and restarted) while the look was out: say nothing, arm nothing.
  if (gen !== generation) return
  if (shown !== was && !w.isDestroyed()) w.webContents.send(IPC.onGameMapShown, shown)
  arm()
}

/** Start watching (idempotent) and answer what is known now: null until a file says. */
export async function gameMapShown(): Promise<boolean | null> {
  if (!running) {
    running = true
    await look()
    // The first look's answer is the reply; the watch takes over from here.
    if (running && timer == null) arm()
  } else if (looking) {
    await looking
  }
  return shown
}

export function stopGameMapWatch(): void {
  if (timer != null) clearTimeout(timer)
  timer = null
  running = false
  generation++
  looking = null
  path = null
  foundAt = 0
  mtime = 0
  shown = null
}
