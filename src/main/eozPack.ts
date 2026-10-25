// eozPack.ts — the wiki's own GitHub data pack (`Maergoth/EQL-EOZ`, branch `dataset`): a small
// `manifest.json` (version, generatedAt, sha256, bytes) and the gzipped pack it describes. The pack
// is downloaded only when the manifest's sha256 differs from the cached copy's, and kept only once
// its bytes hash to that sha256. Third-party DATA: nothing in it is run. GitHub, never the wiki, so
// nothing here is a wiki request.
//
// Electron-free and shared: scripts/eoz-compare.mts (the pre-delta compare), scripts/fetch-wiki-
// images.mts (bundled item icons) and the app's item icons (itemIconPack.ts) all fetch through
// `refreshEozPack`, so there is one fetch-and-verify, not three.

import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const EOZ_RAW = 'https://raw.githubusercontent.com/Maergoth/EQL-EOZ/dataset'
export const EOZ_PACK_FILE = 'eqlwiki-eye-of-zomm-data.json.gz'
export const EOZ_MANIFEST_FILE = 'manifest.json'

/** The largest pack accepted (it is ~6.4 MB in 2026-10); a bound, not a budget. */
export const MAX_PACK_BYTES = 64 * 1024 * 1024
const MAX_MANIFEST_BYTES = 64 * 1024
const MANIFEST_TIMEOUT_MS = 15_000
const PACK_TIMEOUT_MS = 180_000
const CLOCK_SKEW_MS = 5 * 60_000

export interface EozManifest {
  version?: string
  generatedAt?: string
  sha256: string
  bytes?: number
}

export const sha256Hex = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')

/** The manifest, or null when it is not one: the sha256 must be 64 hex characters, the size sane. */
export function parseEozManifest(text: string): EozManifest | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const m = raw as Record<string, unknown>
  if (typeof m.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(m.sha256)) return null
  const bytes = m.bytes
  if (bytes !== undefined && (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes <= 0 || bytes > MAX_PACK_BYTES)) {
    return null
  }
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length <= 100 ? v : undefined)
  return { version: str(m.version), generatedAt: str(m.generatedAt), sha256: m.sha256, bytes }
}

export interface EozFetchOptions {
  /** Where the manifest and the pack are cached. */
  dir: string
  /** The User-Agent GitHub sees; it names the fork. */
  ua: string
  /** Use the cached copy and send nothing. */
  offline?: boolean
  /** Skip GitHub when the cached manifest was checked less than this long ago (the app: a day). */
  maxAgeMs?: number
  fetchImpl?: typeof fetch
  now?: () => number
}

export interface EozPackFile {
  manifest: EozManifest
  gzPath: string
  /** GitHub requests this call sent (0, 1 for the manifest, 2 with the pack). */
  requests: number
  /** Bytes received from GitHub this call. */
  downloaded: number
  /** True when the pack itself was downloaded this call. */
  fetchedPack: boolean
}

async function get(f: typeof fetch, url: string, ua: string, limit: { max: number; timeoutMs: number }): Promise<Buffer> {
  const { max, timeoutMs } = limit
  const res = await f(url, { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`${String(res.status)} ${res.statusText} for ${url}`)
  if (Number(res.headers.get('content-length') ?? 0) > max) throw new Error(`${url} is larger than ${String(max)} bytes`)
  const body = Buffer.from(await res.arrayBuffer())
  if (body.length > max) throw new Error(`${url} is larger than ${String(max)} bytes`)
  return body
}

/** Write next to the target, then rename: a torn pack never sits under the real name. */
async function writeAtomic(path: string, bytes: Uint8Array | string): Promise<void> {
  const tmp = `${path}.${String(process.pid)}.${Math.random().toString(36).slice(2, 8)}.tmp`
  try {
    await writeFile(tmp, bytes)
    await rename(tmp, path)
  } catch (err) {
    await unlink(tmp).catch(() => undefined)
    throw err
  }
}

const readIf = (p: string): Promise<Buffer | null> => readFile(p).catch(() => null)

/** The cached manifest and pack, the pack checked against the manifest; throws when either is unusable. */
async function cachedPack(mPath: string, gzPath: string): Promise<EozManifest> {
  const text = await readIf(mPath)
  const manifest = text ? parseEozManifest(text.toString('utf8')) : null
  if (!manifest) throw new Error(`no usable cached manifest at ${mPath}`)
  const gz = await readIf(gzPath)
  if (!gz) throw new Error(`no cached pack at ${gzPath}`)
  if (sha256Hex(gz) !== manifest.sha256) throw new Error(`cached pack ${gzPath} does not match its manifest's sha256`)
  return manifest
}

/** Was the cached manifest written (checked) less than `maxAgeMs` ago? */
async function recentlyChecked(mPath: string, maxAgeMs: number | undefined, now: number): Promise<boolean> {
  if (maxAgeMs === undefined) return false
  const s = await stat(mPath).catch(() => null)
  // A little negative age is timestamp rounding; a lot is a clock set back, which checks again.
  return s !== null && now - s.mtimeMs > -CLOCK_SKEW_MS && now - s.mtimeMs < maxAgeMs
}

/**
 * The manifest from GitHub and, when the cached pack's sha256 is not the manifest's, the pack, kept
 * only once it hashes to the manifest's sha256 (and matches its stated size). Offline, or checked
 * within `maxAgeMs`: the cached copy, verified the same way. Throws on any failure; the caller
 * decides what a missing pack means.
 */
export async function refreshEozPack(o: EozFetchOptions): Promise<EozPackFile> {
  const f = o.fetchImpl ?? fetch
  const mPath = join(o.dir, EOZ_MANIFEST_FILE)
  const gzPath = join(o.dir, EOZ_PACK_FILE)
  const out: EozPackFile = { manifest: { sha256: '' }, gzPath, requests: 0, downloaded: 0, fetchedPack: false }
  if (o.offline || (await recentlyChecked(mPath, o.maxAgeMs, (o.now ?? Date.now)()))) {
    return { ...out, manifest: await cachedPack(mPath, gzPath) }
  }
  await mkdir(o.dir, { recursive: true })
  const body = await get(f, `${EOZ_RAW}/${EOZ_MANIFEST_FILE}`, o.ua, { max: MAX_MANIFEST_BYTES, timeoutMs: MANIFEST_TIMEOUT_MS })
  out.requests++
  out.downloaded += body.length
  const live = parseEozManifest(body.toString('utf8'))
  if (!live) throw new Error('the GitHub manifest is not a valid pack manifest')
  const have = await readIf(gzPath)
  if (!have || sha256Hex(have) !== live.sha256) {
    const gz = await get(f, `${EOZ_RAW}/${EOZ_PACK_FILE}`, o.ua, { max: MAX_PACK_BYTES, timeoutMs: PACK_TIMEOUT_MS })
    out.requests++
    out.downloaded += gz.length
    if (live.bytes !== undefined && gz.length !== live.bytes) {
      throw new Error(`pack is ${String(gz.length)} bytes, the manifest says ${String(live.bytes)}`)
    }
    if (sha256Hex(gz) !== live.sha256) throw new Error(`pack sha256 ${sha256Hex(gz)} is not the manifest's ${live.sha256}`)
    await writeAtomic(gzPath, gz)
    out.fetchedPack = true
  }
  // Written on every check, so its mtime is when the pack was last confirmed current.
  await writeAtomic(mPath, JSON.stringify(live, null, 2) + '\n')
  return { ...out, manifest: live }
}
