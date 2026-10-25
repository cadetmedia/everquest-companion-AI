// itemIconPack.ts — the app's item icons from the wiki's GitHub data pack, before the wiki (owner,
// 2026-10-25: "Try to get them from the WIKI Github first, and the wiki directly next. Either way
// should cache it."). `imageCache.ts` asks here for an item icon that is neither bundled nor in the
// image cache; whatever comes back is written to the image cache there, so it is fetched once.
//
// WHEN GITHUB IS ASKED. Only on the first such miss of a session (a normal install, whose bundle
// holds every icon, never asks at all), and then at most once per PACK_CHECK_INTERVAL_MS: the
// manifest's mtime in `<userData>/eoz-pack/` says when it was last checked. The ~6.4 MB pack is
// downloaded only when the manifest's sha256 differs from the cached pack's, and is kept only once
// it hashes to it (eozPack.ts). A failed check falls back to the cached pack, verified; no pack at
// all means every icon goes to the wiki, as before. One attempt per session, one log line.
//
// A REQUEST THAT ARRIVES WHILE THE PACK DOWNLOADS WAITS, up to PACK_WAIT_MS. The misses come in a
// burst (a window of icons), so going to the wiki meanwhile would send it the very requests the
// pack exists to save; an icon a few seconds late costs nothing. Past the wait it goes to the wiki.
// Nothing blocks: the download and the streamed read are async and the main process keeps running.
//
// GitHub requests are not wiki requests: they are logged here (requests, bytes, pack version), not
// counted as wiki calls. Electron-free: the composition root injects userData.

import { join } from 'node:path'
import { logInfo } from './errorLog'
import { readPackIcons } from './eozIcons'
import { refreshEozPack, type EozPackFile } from './eozPack'

/** The pack's manifest is checked at most once a day (the wiki rebuilds it about daily). */
export const PACK_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
/** How long an icon request waits for a pack that is still loading before it goes to the wiki. */
export const PACK_WAIT_MS = 15_000
export const EOZ_PACK_DIR_NAME = 'eoz-pack'
const UA = 'everquest-companion/0.1 (+https://github.com/kaltinril/everquest-companion)'

export interface ItemIconPackOptions {
  readonly userData: string
  readonly fetchImpl?: typeof fetch
  readonly log?: (msg: string) => void
  readonly now?: () => number
  readonly waitMs?: number
}

export interface ItemIconPack {
  /** The pack's PNG for this icon id, or null (no pack, not in it, or still loading past the wait). */
  readonly iconBytes: (id: string) => Promise<Uint8Array | null>
}

const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err))

function describe(f: EozPackFile, icons: number): string {
  const net = f.requests === 0 ? 'cached, GitHub not asked' : `${String(f.requests)} GitHub request(s), ${(f.downloaded / 1024).toFixed(1)} KB`
  return `[everquest-companion] Item icon pack ${f.manifest.version ?? '?'}: ${String(icons)} icons (${net}${f.fetchedPack ? ', pack downloaded' : ''})`
}

/** The pack file: checked against GitHub when due, else the cached copy; a failed check falls back to the cache. */
async function packFile(o: ItemIconPackOptions, dir: string, log: (m: string) => void): Promise<EozPackFile> {
  const base = { dir, ua: UA, fetchImpl: o.fetchImpl, now: o.now }
  try {
    return await refreshEozPack({ ...base, maxAgeMs: PACK_CHECK_INTERVAL_MS })
  } catch (err) {
    log(`[everquest-companion] Item icon pack: GitHub check failed (${reason(err)}); trying the cached pack`)
    return refreshEozPack({ ...base, offline: true })
  }
}

export function createItemIconPack(o: ItemIconPackOptions): ItemIconPack {
  const dir = join(o.userData, EOZ_PACK_DIR_NAME)
  const log = o.log ?? ((m: string) => logInfo(m))
  const waitMs = o.waitMs ?? PACK_WAIT_MS
  let loading: Promise<Map<string, Uint8Array> | null> | null = null

  async function load(): Promise<Map<string, Uint8Array> | null> {
    try {
      const f = await packFile(o, dir, log)
      const icons = await readPackIcons(f.gzPath)
      log(describe(f, icons.size))
      return icons
    } catch (err) {
      log(`[everquest-companion] Item icon pack unavailable (${reason(err)}); item icons come from the wiki this session`)
      return null
    }
  }

  return {
    iconBytes: async (id: string): Promise<Uint8Array | null> => {
      loading ??= load()
      let timer: NodeJS.Timeout | undefined
      const late = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), waitMs)
      })
      const icons = await Promise.race([loading, late])
      clearTimeout(timer)
      return icons?.get(id) ?? null
    }
  }
}
