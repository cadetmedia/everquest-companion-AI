// packIcons.ts — the bundled item icons' first source: the GitHub data pack the wiki publishes
// (owner, 2026-10-25: "Try to get them from the WIKI Github first, and the wiki directly next.").
// fetch-wiki-images.mts asks here for the icons it still lacks, then asks the wiki for the rest.
// The pack is fetched and sha256-verified by src/main/eozPack.ts (one fetch-and-verify for the
// scripts and the app) and every icon is checked as a PNG by src/main/eozIcons.ts. GitHub, not
// the wiki: nothing here is a wiki request or goes in the wiki ledger.

import { readPackIcons } from '../../src/main/eozIcons'
import { refreshEozPack } from '../../src/main/eozPack'

const UA = 'everquest-companion fetch-wiki-images (+https://github.com/kaltinril/everquest-companion)'

export interface PackIconOptions {
  /** The pack's cache (fetch-wiki-images: scripts/sources/cache/eoz, shared with eoz-compare). */
  packDir: string
  /** Use the cached pack without asking GitHub. */
  offline: boolean
  fetchImpl?: typeof fetch
  log?: (msg: string) => void
}

/**
 * Hands `write` the pack's PNG for each of `ids` it holds; returns how many. A pack that cannot be
 * had (offline with no cache, a bad sha256) is reported and 0 returned, so the wiki fetch goes on
 * exactly as before.
 */
export async function takeIconsFromPack(
  ids: readonly string[],
  o: PackIconOptions,
  write: (id: string, png: Uint8Array) => void
): Promise<number> {
  const log = o.log ?? ((m: string) => console.log(m))
  let icons: Map<string, Uint8Array>
  try {
    const f = await refreshEozPack({ dir: o.packDir, ua: UA, offline: o.offline, fetchImpl: o.fetchImpl })
    icons = await readPackIcons(f.gzPath)
    log(
      `[fetch-wiki-images] data pack ${f.manifest.version ?? '?'}: ${String(icons.size)} icons; ` +
        `${String(f.requests)} GitHub request(s), ${String(f.downloaded)} bytes (not wiki requests)`
    )
  } catch (err) {
    log(`[fetch-wiki-images] data pack unavailable (${err instanceof Error ? err.message : String(err)}); missing icons go to the wiki`)
    return 0
  }
  let taken = 0
  for (const id of ids) {
    const png = icons.get(id)
    if (!png) continue
    write(id, png)
    taken++
  }
  return taken
}
