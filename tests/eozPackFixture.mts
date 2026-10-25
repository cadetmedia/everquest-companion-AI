// eozPackFixture.mts — a tiny synthetic stand-in for the wiki's GitHub data pack (eozPack.ts):
// generated PNGs, a gzipped JSON document shaped like the pack, its manifest, and a stub fetch that
// serves both from the two raw.githubusercontent URLs. No game art and no pack data are committed.

import { gzipSync, deflateSync, crc32 } from 'node:zlib'
import { EOZ_MANIFEST_FILE, EOZ_PACK_FILE, EOZ_RAW, sha256Hex } from '../src/main/eozPack'

/** One PNG chunk: length, type, data, CRC over type + data. */
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** A real, decodable w x h grey PNG; `shade` makes each one's bytes distinct. */
export function makePng(w = 2, h = 2, shade = 7): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 0 // greyscale
  const rows = Buffer.alloc((w + 1) * h, shade)
  for (let y = 0; y < h; y++) rows[y * (w + 1)] = 0 // filter byte
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

export const dataUrl = (png: Buffer): string => `data:image/png;base64,${png.toString('base64')}`

/** A pack document: decoys before the real `icons`, a section after it. */
export function packDoc(icons: Record<string, unknown>): Record<string, unknown> {
  return {
    meta: { generatedAt: '2026-10-25T08:47:14+00:00', note: 'a string with "icons":{"9":"x"} inside it' },
    zones: [{ name: 'Qeynos', icons: { 1: 'nested, not top level' } }],
    items: [{ name: 'Rusty Short Sword', iconId: 500, text: 'braces } ] { [ and an escaped quote \\" here' }],
    icons,
    wikiEntities: [{ title: 'after the icons' }]
  }
}

export interface FakePack {
  gz: Buffer
  manifest: { version: string; generatedAt: string; sha256: string; bytes: number }
}

export function fakePack(icons: Record<string, unknown>, version = 'v1'): FakePack {
  const gz = gzipSync(Buffer.from(JSON.stringify(packDoc(icons)), 'utf8'))
  return { gz, manifest: { version, generatedAt: '2026-10-25T08:47:20+00:00', sha256: sha256Hex(gz), bytes: gz.length } }
}

export interface StubGitHub {
  fetch: typeof fetch
  /** Every URL asked for, in order. */
  urls: string[]
  /** The User-Agent of every request. */
  agents: string[]
  /** Serve this pack from now on (or bytes that do not match the manifest, with `corrupt`). */
  serve(p: FakePack, corrupt?: boolean): void
}

export function stubGitHub(p: FakePack): StubGitHub {
  let current = p
  let bad = false
  const urls: string[] = []
  const agents: string[] = []
  const f = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    urls.push(url)
    agents.push(new Headers(init?.headers).get('user-agent') ?? '')
    if (url === `${EOZ_RAW}/${EOZ_MANIFEST_FILE}`) return Promise.resolve(new Response(JSON.stringify(current.manifest)))
    if (url === `${EOZ_RAW}/${EOZ_PACK_FILE}`) {
      const body = new Uint8Array(current.gz)
      if (bad) body[12] ^= 0xff // same size, different bytes
      return Promise.resolve(new Response(body))
    }
    return Promise.resolve(new Response(null, { status: 404, statusText: 'Not Found' }))
  }
  return {
    fetch: f as typeof fetch,
    urls,
    agents,
    serve: (next, corrupt = false) => {
      current = next
      bad = corrupt
    }
  }
}
