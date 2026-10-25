// eozIcons.ts — the item icons inside the wiki's GitHub data pack (eozPack.ts): its top-level
// `icons` object maps an icon id (`lucy_img_ID`) to `data:image/png;base64,...` (784 of them in
// 2026-10, 40x40 PNGs). Third-party data, so every entry is checked before it is used: the id is
// digits, the value is strict base64 of a real PNG (signature, IHDR, IEND) of sane size. Anything
// else is dropped, never run and never written.
//
// THE PACK IS NOT PARSED WHOLE. It unzips to ~125 MB of JSON; parsing that in the app's main
// process would stall it for most of a second and hold ~0.5 GB. `readPackIcons` streams the gunzip
// through `TopLevelValueScanner`, which tracks only string state and nesting depth, keeps the bytes
// of the one top-level value it is asked for (~1.8 MB), and stops reading once that value closes.
// Electron-free: the build script and the app share it.

import { createReadStream } from 'node:fs'
import { createGunzip } from 'node:zlib'

/** The largest icon accepted, decoded; real ones are 0.4 to 3.6 KB. */
export const MAX_ICON_BYTES = 64 * 1024
/** The largest icon side accepted, in pixels; real ones are 40. */
export const MAX_ICON_SIDE = 256
/** The largest `icons` object accepted, as JSON text; the real one is ~1.8 MB. */
export const MAX_ICONS_JSON_BYTES = 32 * 1024 * 1024
/** The most a pack may unzip to before the read gives up (a gzip bomb ends here). */
export const MAX_UNZIPPED_BYTES = 1024 * 1024 * 1024

const DATA_URL_PREFIX = 'data:image/png;base64,'
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/
const ICON_ID_RE = /^\d{1,12}$/
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const ascii = (b: Uint8Array, at: number, len: number): string => String.fromCharCode(...b.subarray(at, at + len))
const u32 = (b: Uint8Array, at: number): number => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0

/** A PNG by its structure: the signature, an IHDR first with sides 1..MAX_ICON_SIDE, IEND last. */
export function isSanePng(b: Uint8Array): boolean {
  if (b.length < 8 + 25 + 12 || b.length > MAX_ICON_BYTES) return false
  if (!PNG_SIGNATURE.every((v, i) => b[i] === v)) return false
  if (u32(b, 8) !== 13 || ascii(b, 12, 4) !== 'IHDR') return false
  const w = u32(b, 16)
  const h = u32(b, 20)
  if (w < 1 || h < 1 || w > MAX_ICON_SIDE || h > MAX_ICON_SIDE) return false
  return ascii(b, b.length - 8, 4) === 'IEND'
}

/** The PNG bytes of one pack entry, or null when it is not a sane PNG data URL. */
export function decodeIconDataUrl(v: unknown): Uint8Array | null {
  if (typeof v !== 'string' || !v.startsWith(DATA_URL_PREFIX)) return null
  const b64 = v.slice(DATA_URL_PREFIX.length)
  if (b64.length > Math.ceil(MAX_ICON_BYTES / 3) * 4 || b64.length % 4 !== 0 || !BASE64_RE.test(b64)) return null
  const bytes = new Uint8Array(Buffer.from(b64, 'base64'))
  return isSanePng(bytes) ? bytes : null
}

/** id -> PNG bytes for every entry of a parsed `icons` object that passes the checks. */
export function iconsFromJson(obj: unknown): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>()
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return out
  for (const [id, v] of Object.entries(obj as Record<string, unknown>)) {
    if (!ICON_ID_RE.test(id)) continue
    const png = decodeIconDataUrl(v)
    if (png) out.set(id, png)
  }
  return out
}

const QUOTE = 0x22
const BACKSLASH = 0x5c
const COLON = 0x3a
const OPENERS = new Set([0x7b, 0x5b])
const CLOSERS = new Set([0x7d, 0x5d])
const WHITESPACE = new Set([0x20, 0x09, 0x0a, 0x0d])
/** Top-level keys are short; a longer string at depth 1 can never be the key asked for. */
const MAX_KEY_BYTES = 64

/**
 * Finds one top-level object value in a JSON document fed as byte chunks, without parsing the
 * rest. JSON's structural characters are ASCII and never occur inside a UTF-8 multibyte sequence,
 * so bytes are scanned directly. Only an object value is captured; anything else ends the scan.
 */
export class TopLevelValueScanner {
  private depth = 0
  private inString = false
  private escaped = false
  private keyBytes: number[] = []
  private lastString: string | null = null
  private awaitingValue = false
  private capturing = false
  private parts: Buffer[] = []
  private size = 0
  private finished = false
  private found: Buffer | null = null
  /** Where the captured value starts in the current chunk. */
  private start = -1

  constructor(
    private readonly key: string,
    private readonly maxBytes = MAX_ICONS_JSON_BYTES
  ) {}

  /** The captured value's JSON text, or null when the document had none (or it was too large). */
  value(): Buffer | null {
    return this.found
  }

  /** Feed the next chunk; true once the scan is over and nothing more need be read. */
  push(chunk: Uint8Array): boolean {
    if (this.finished) return true
    this.start = this.capturing ? 0 : -1
    for (let i = 0; i < chunk.length; i++) {
      if (this.step(chunk, i)) return true
    }
    return this.capturing ? this.take(chunk.subarray(this.start), false) : false
  }

  /** One byte; true when the scan is over. */
  private step(chunk: Uint8Array, i: number): boolean {
    const b = chunk[i]
    if (this.inString) {
      this.stringByte(b)
      return false
    }
    if (this.awaitingValue && !WHITESPACE.has(b) && !this.beginValue(b, i)) return true
    if (b === QUOTE) this.openString()
    else if (OPENERS.has(b)) this.depth++
    else if (CLOSERS.has(b)) return this.close(chunk, i)
    else if (b === COLON && this.depth === 1 && !this.capturing) this.awaitingValue = this.lastString === this.key
    return false
  }

  /** The asked-for key's value begins at `i`: capture it if it is an object, else end the scan. */
  private beginValue(b: number, i: number): boolean {
    this.awaitingValue = false
    if (b !== 0x7b) return !this.finish(null)
    this.capturing = true
    this.start = i
    return true
  }

  private close(chunk: Uint8Array, i: number): boolean {
    this.depth--
    if (this.capturing && this.depth === 1) return this.take(chunk.subarray(this.start, i + 1), true)
    return this.depth <= 0 ? this.finish(null) : false
  }

  private openString(): void {
    this.inString = true
    this.keyBytes = []
    this.lastString = null
  }

  private stringByte(b: number): void {
    if (this.escaped) this.escaped = false
    else if (b === BACKSLASH) this.escaped = true
    else if (b === QUOTE) {
      this.inString = false
      if (this.depth === 1 && !this.capturing && this.keyBytes.length <= MAX_KEY_BYTES) {
        this.lastString = Buffer.from(this.keyBytes).toString('utf8')
      }
    }
    if (this.depth === 1 && !this.capturing && this.keyBytes.length <= MAX_KEY_BYTES) this.keyBytes.push(b)
  }

  private take(part: Uint8Array, last: boolean): boolean {
    this.size += part.length
    if (this.size > this.maxBytes) return this.finish(null)
    this.parts.push(Buffer.from(part))
    return last ? this.finish(Buffer.concat(this.parts)) : false
  }

  private finish(found: Buffer | null): boolean {
    this.finished = true
    this.found = found
    this.parts = []
    return true
  }
}

/**
 * The pack's item icons, streamed out of the gzipped file (`eozPack.ts refreshEozPack` verified
 * it). An empty map when the pack has no `icons` object; throws when the file will not unzip.
 */
export async function readPackIcons(gzPath: string, maxUnzipped = MAX_UNZIPPED_BYTES): Promise<Map<string, Uint8Array>> {
  const scanner = new TopLevelValueScanner('icons')
  const file = createReadStream(gzPath)
  const gunzip = createGunzip()
  // Not `pipeline`: it rejects when the reader stops early, and stopping early is the point.
  file.on('error', (err) => gunzip.destroy(err))
  file.pipe(gunzip)
  let total = 0
  try {
    for await (const chunk of gunzip as AsyncIterable<Buffer>) {
      total += chunk.length
      if (total > maxUnzipped) throw new Error(`pack unzips to more than ${String(maxUnzipped)} bytes`)
      if (scanner.push(chunk)) break
    }
  } finally {
    file.destroy()
    gunzip.destroy()
  }
  const raw = scanner.value()
  return raw ? iconsFromJson(JSON.parse(raw.toString('utf8'))) : new Map()
}
