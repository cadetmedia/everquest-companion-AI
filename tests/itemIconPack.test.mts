// itemIconPack.test.mts — the app's item icons from the wiki's GitHub data pack first, the wiki
// next, cached either way (owner, 2026-10-25). The manager (itemIconPack.ts) over a synthetic pack
// and a stub GitHub, then the real `eqimg://` handler (imageCache.ts) with the pack injected: an
// icon the pack holds never reaches the wiki and is written to the image cache, so it is fetched
// once. Nothing is sent anywhere.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EOZ_RAW } from '../src/main/eozPack'
import { EOZ_PACK_DIR_NAME, PACK_CHECK_INTERVAL_MS, createItemIconPack } from '../src/main/itemIconPack'
import {
  IMAGE_CACHE_DIR_NAME,
  type ProtocolLike,
  installImageCacheProtocol,
  resetImageFailures,
  resetImageFetchWarnings,
  wikiItemIconUrl
} from '../src/main/imageCache'
import { dataUrl, fakePack, makePng, stubGitHub } from './eozPackFixture.mts'

const A = makePng(2, 2, 1)
const B = makePng(40, 40, 2)
const WIKI_PNG = makePng(3, 3, 9)

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'eqc-iconpack-'))
}

test('an icon comes from the pack; the pack is loaded once a session and GitHub is logged', async () => {
  const root = tempRoot()
  try {
    const gh = stubGitHub(fakePack({ 500: dataUrl(A), 501: dataUrl(B) }))
    const lines: string[] = []
    const pack = createItemIconPack({ userData: root, fetchImpl: gh.fetch, log: (m) => lines.push(m) })
    const [a, b, none] = await Promise.all([pack.iconBytes('500'), pack.iconBytes('501'), pack.iconBytes('777')])
    assert.deepEqual(a, new Uint8Array(A))
    assert.deepEqual(b, new Uint8Array(B))
    assert.equal(none, null)
    assert.equal(gh.urls.length, 2, 'one manifest, one pack, for three concurrent asks')
    assert.ok(gh.urls.every((u) => u.startsWith(EOZ_RAW)))
    assert.ok(existsSync(join(root, EOZ_PACK_DIR_NAME, 'manifest.json')), 'the pack is cached in userData')
    assert.equal(lines.length, 1)
    assert.match(lines[0], /2 icons \(2 GitHub request\(s\), [\d.]+ KB, pack downloaded\)/)
    await pack.iconBytes('500')
    assert.equal(gh.urls.length, 2, 'later asks in the session send nothing')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the manifest is checked at most once per interval, and a new version is the only download', async () => {
  const root = tempRoot()
  try {
    const gh = stubGitHub(fakePack({ 500: dataUrl(A) }))
    await createItemIconPack({ userData: root, fetchImpl: gh.fetch, log: () => undefined }).iconBytes('500')
    gh.urls.length = 0
    await createItemIconPack({ userData: root, fetchImpl: gh.fetch, log: () => undefined }).iconBytes('500')
    assert.deepEqual(gh.urls, [], 'a second session the same day uses the cached pack')
    gh.serve(fakePack({ 500: dataUrl(B) }, 'v2'))
    const tomorrow = (): number => Date.now() + PACK_CHECK_INTERVAL_MS + 1
    const next = createItemIconPack({ userData: root, fetchImpl: gh.fetch, log: () => undefined, now: tomorrow })
    assert.deepEqual(await next.iconBytes('500'), new Uint8Array(B))
    assert.equal(gh.urls.length, 2, 'a day later: the manifest, and the new pack it names')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('GitHub down with a cached pack: the cache serves; with none: null, one line, no retry', async () => {
  const root = tempRoot()
  try {
    const gh = stubGitHub(fakePack({ 500: dataUrl(A) }))
    await createItemIconPack({ userData: root, fetchImpl: gh.fetch, log: () => undefined }).iconBytes('500')
    let asked = 0
    const down = (): Promise<Response> => {
      asked++
      return Promise.reject(new TypeError('fetch failed'))
    }
    const later = (): number => Date.now() + PACK_CHECK_INTERVAL_MS + 1
    const stale = createItemIconPack({ userData: root, fetchImpl: down as typeof fetch, log: () => undefined, now: later })
    assert.deepEqual(await stale.iconBytes('500'), new Uint8Array(A))
    const empty = tempRoot()
    const lines: string[] = []
    const none = createItemIconPack({ userData: empty, fetchImpl: down as typeof fetch, log: (m) => lines.push(m) })
    assert.equal(await none.iconBytes('500'), null)
    assert.equal(await none.iconBytes('501'), null)
    rmSync(empty, { recursive: true, force: true })
    assert.equal(asked, 2, 'one failed check per session, not one per icon')
    assert.match(lines.at(-1) ?? '', /unavailable .*come from the wiki this session/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a request that arrives while the pack is still downloading waits only up to waitMs', async () => {
  const root = tempRoot()
  try {
    const hang = (): Promise<Response> => new Promise<Response>(() => undefined)
    const pack = createItemIconPack({ userData: root, fetchImpl: hang as typeof fetch, log: () => undefined, waitMs: 20 })
    const t0 = Date.now()
    assert.equal(await pack.iconBytes('500'), null)
    assert.ok(Date.now() - t0 < 2000)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

interface Rig {
  ask(url: string): Promise<GlobalResponse>
  wiki: string[]
  packAsks: string[]
  cacheDir: string
  dispose(): void
}

function rig(pack: (id: string) => Promise<Uint8Array | null>): Rig {
  const root = tempRoot()
  const bundledDir = join(root, 'wiki-images')
  mkdirSync(bundledDir)
  const wiki: string[] = []
  const packAsks: string[] = []
  let handler: ((r: GlobalRequest) => GlobalResponse | Promise<GlobalResponse>) | null = null
  const protocol: ProtocolLike = {
    registerSchemesAsPrivileged: () => undefined,
    handle: (_s, h) => {
      handler = h
    }
  }
  installImageCacheProtocol(protocol, {
    userData: root,
    bundledDir,
    fetchImpl: (input) => {
      wiki.push(String(input))
      return Promise.resolve(new Response(new Uint8Array(WIKI_PNG), { status: 200 }))
    },
    itemIconPack: (id) => {
      packAsks.push(id)
      return pack(id)
    },
    log: () => undefined,
    onError: () => undefined,
    warn: () => undefined
  })
  const h = handler as unknown as (r: GlobalRequest) => GlobalResponse | Promise<GlobalResponse>
  return {
    ask: (url) => Promise.resolve(h(new Request(url))),
    wiki,
    packAsks,
    cacheDir: join(root, IMAGE_CACHE_DIR_NAME),
    dispose: () => rmSync(root, { recursive: true, force: true })
  }
}

test('THE HANDLER: pack first, written to the image cache, so the second ask touches neither', async () => {
  resetImageFailures()
  resetImageFetchWarnings()
  const r = rig((id) => Promise.resolve(id === '500' ? new Uint8Array(A) : null))
  try {
    const res = await r.ask('eqimg://item/500')
    assert.equal(res.status, 200)
    assert.deepEqual(new Uint8Array(await res.arrayBuffer()), new Uint8Array(A))
    assert.deepEqual(r.wiki, [], 'the wiki is not asked for an icon the pack holds')
    assert.deepEqual(readFileSync(join(r.cacheDir, 'item-500.png')), A)
    await r.ask('eqimg://item/500')
    assert.deepEqual(r.packAsks, ['500'], 'served from the image cache the second time')
    const miss = await r.ask('eqimg://item/501')
    assert.equal(miss.status, 200)
    assert.deepEqual(r.wiki, [wikiItemIconUrl('501')], 'an icon the pack lacks goes to the wiki')
    assert.deepEqual(readFileSync(join(r.cacheDir, 'item-501.png')), WIKI_PNG)
  } finally {
    r.dispose()
  }
})

test('THE HANDLER: a pack that throws or hands back a non-PNG falls through to the wiki; url images never ask it', async () => {
  resetImageFailures()
  resetImageFetchWarnings()
  const r = rig((id) => (id === '600' ? Promise.reject(new Error('boom')) : Promise.resolve(new Uint8Array(Buffer.from('GIF89a-not-a-png')))))
  try {
    assert.equal((await r.ask('eqimg://item/600')).status, 200)
    assert.equal((await r.ask('eqimg://item/601')).status, 200)
    assert.deepEqual(r.wiki, [wikiItemIconUrl('600'), wikiItemIconUrl('601')])
    const boss = 'https://wiki.project1999.com/images/Npc_lord_nagafen.png'
    await r.ask(`eqimg://url/${encodeURIComponent(boss)}`)
    assert.deepEqual(r.packAsks, ['600', '601'])
  } finally {
    r.dispose()
  }
})
