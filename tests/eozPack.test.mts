// eozPack.test.mts — the wiki's GitHub data pack: fetched once per version and kept only when its
// sha256 matches the manifest (eozPack.ts), and its item icons read out of it as checked PNGs
// without parsing the whole pack (eozIcons.ts). A synthetic pack and a stub fetch: nothing is sent.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { EOZ_MANIFEST_FILE, EOZ_PACK_FILE, EOZ_RAW, parseEozManifest, refreshEozPack } from '../src/main/eozPack'
import { TopLevelValueScanner, decodeIconDataUrl, isSanePng, readPackIcons } from '../src/main/eozIcons'
import { takeIconsFromPack } from '../scripts/sources/packIcons'
import { dataUrl, fakePack, makePng, stubGitHub } from './eozPackFixture.mts'

const A = makePng(2, 2, 1)
const B = makePng(40, 40, 2)
const UA = 'everquest-companion test (+https://github.com/kaltinril/everquest-companion)'

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'eqc-eoz-'))
}

test('a manifest needs a 64-hex sha256 and a sane size; anything else is refused', () => {
  const sha = 'a'.repeat(64)
  assert.deepEqual(parseEozManifest(JSON.stringify({ version: 'v', sha256: sha, bytes: 10 })), {
    version: 'v',
    generatedAt: undefined,
    sha256: sha,
    bytes: 10
  })
  assert.equal(parseEozManifest('not json'), null)
  assert.equal(parseEozManifest(JSON.stringify({ sha256: 'A'.repeat(64) })), null)
  assert.equal(parseEozManifest(JSON.stringify({ sha256: sha.slice(1) })), null)
  assert.equal(parseEozManifest(JSON.stringify({ sha256: sha, bytes: 1e12 })), null)
  assert.equal(parseEozManifest(JSON.stringify({ sha256: sha, bytes: -1 })), null)
  assert.equal(parseEozManifest('null'), null)
})

test('the pack is downloaded once per version: a second check asks for the manifest only', async () => {
  const dir = tempDir()
  try {
    const gh = stubGitHub(fakePack({ 500: dataUrl(A) }))
    const first = await refreshEozPack({ dir, ua: UA, fetchImpl: gh.fetch })
    assert.equal(first.requests, 2)
    assert.equal(first.fetchedPack, true)
    assert.deepEqual(gh.urls, [`${EOZ_RAW}/${EOZ_MANIFEST_FILE}`, `${EOZ_RAW}/${EOZ_PACK_FILE}`])
    assert.ok(gh.agents.every((a) => a === UA), 'every GitHub request names the fork')
    const again = await refreshEozPack({ dir, ua: UA, fetchImpl: gh.fetch })
    assert.equal(again.requests, 1)
    assert.equal(again.fetchedPack, false)
    gh.serve(fakePack({ 500: dataUrl(B) }, 'v2'))
    const moved = await refreshEozPack({ dir, ua: UA, fetchImpl: gh.fetch })
    assert.equal(moved.fetchedPack, true, 'a new sha256 is a new pack')
    assert.equal(moved.manifest.version, 'v2')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('within maxAgeMs, or offline, the cached pack is used and GitHub is not asked', async () => {
  const dir = tempDir()
  try {
    const gh = stubGitHub(fakePack({ 500: dataUrl(A) }))
    await refreshEozPack({ dir, ua: UA, fetchImpl: gh.fetch })
    gh.urls.length = 0
    const day = 24 * 3600 * 1000
    const recent = await refreshEozPack({ dir, ua: UA, fetchImpl: gh.fetch, maxAgeMs: day })
    assert.equal(recent.requests, 0)
    const offline = await refreshEozPack({ dir, ua: UA, fetchImpl: gh.fetch, offline: true })
    assert.equal(offline.manifest.version, 'v1')
    assert.deepEqual(gh.urls, [])
    const later = await refreshEozPack({ dir, ua: UA, fetchImpl: gh.fetch, maxAgeMs: day, now: () => Date.now() + day + 1 })
    assert.equal(later.requests, 1, 'past the interval the manifest is checked again')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a pack whose sha256 is not the manifest is never kept, and a cached one that drifted is refused', async () => {
  const dir = tempDir()
  try {
    const p = fakePack({ 500: dataUrl(A) })
    const gh = stubGitHub(p)
    gh.serve(p, true)
    await assert.rejects(refreshEozPack({ dir, ua: UA, fetchImpl: gh.fetch }), /sha256/)
    assert.equal(existsSync(join(dir, EOZ_PACK_FILE)), false)
    assert.deepEqual(readdirSync(dir), [], 'no temp file and no manifest are left behind')
    gh.serve(p)
    await refreshEozPack({ dir, ua: UA, fetchImpl: gh.fetch })
    writeFileSync(join(dir, EOZ_PACK_FILE), gzipSync(Buffer.from('{}')))
    await assert.rejects(refreshEozPack({ dir, ua: UA, offline: true }), /does not match/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('offline with nothing cached is an error the caller handles', async () => {
  const dir = tempDir()
  try {
    await assert.rejects(refreshEozPack({ dir, ua: UA, offline: true }), /no usable cached manifest/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('only sane PNG data URLs are icons', () => {
  assert.deepEqual(decodeIconDataUrl(dataUrl(A)), new Uint8Array(A))
  assert.equal(isSanePng(A), true)
  assert.equal(decodeIconDataUrl(`data:image/jpeg;base64,${A.toString('base64')}`), null)
  assert.equal(decodeIconDataUrl(dataUrl(A).replace('i', '!')), null, 'not strict base64')
  assert.equal(decodeIconDataUrl(`data:image/png;base64,${Buffer.from('<script>alert(1)</script>xx').toString('base64')}`), null)
  assert.equal(decodeIconDataUrl(dataUrl(makePng(300, 2))), null, 'too wide for an icon')
  assert.equal(decodeIconDataUrl(dataUrl(A.subarray(0, A.length - 12))), null, 'no IEND')
  assert.equal(decodeIconDataUrl(42), null)
})

test('readPackIcons takes the top-level icons only, and drops every entry that fails a check', async () => {
  const dir = tempDir()
  try {
    const p = fakePack({
      500: dataUrl(A),
      501: dataUrl(B),
      '../x': dataUrl(A),
      502: `data:image/jpeg;base64,${A.toString('base64')}`,
      503: { nested: true },
      504: 'data:image/png;base64,@@@@'
    })
    const gz = join(dir, 'pack.json.gz')
    writeFileSync(gz, p.gz)
    const icons = await readPackIcons(gz)
    assert.deepEqual([...icons.keys()].sort(), ['500', '501'])
    assert.deepEqual(icons.get('501'), new Uint8Array(B))
    assert.equal(icons.has('9'), false, 'the decoy inside a string is not the icons object')
    assert.equal(icons.has('1'), false, 'a nested icons key is not the top-level one')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the scanner gives the same answer fed a byte at a time, and stops once icons closes', () => {
  const raw = Buffer.from(JSON.stringify({ a: 'x"icons":{', icons: { 7: 's}' }, after: [1, 2] }))
  const whole = new TopLevelValueScanner('icons')
  whole.push(raw)
  const bytewise = new TopLevelValueScanner('icons')
  let doneAt = -1
  for (let i = 0; i < raw.length && doneAt < 0; i++) if (bytewise.push(raw.subarray(i, i + 1))) doneAt = i
  assert.equal(whole.value()?.toString(), '{"7":"s}"}')
  assert.equal(bytewise.value()?.toString(), '{"7":"s}"}')
  assert.ok(doneAt < raw.indexOf('after'), 'nothing after the icons object is read')
  const none = new TopLevelValueScanner('icons')
  none.push(Buffer.from('{"icons": null, "b": {}}'))
  assert.equal(none.value(), null)
})

test('a pack that unzips past the bound is refused, not read to the end', async () => {
  const dir = tempDir()
  try {
    const gz = join(dir, 'pack.json.gz')
    writeFileSync(gz, gzipSync(Buffer.from(JSON.stringify({ pad: 'x'.repeat(200_000), icons: {} }))))
    await assert.rejects(readPackIcons(gz, 100_000), /unzips to more than/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the build takes what the pack holds and leaves the rest for the wiki; no pack means nothing taken', async () => {
  const dir = tempDir()
  try {
    const gh = stubGitHub(fakePack({ 500: dataUrl(A), 501: dataUrl(B) }))
    const written = new Map<string, Uint8Array>()
    const lines: string[] = []
    const n = await takeIconsFromPack(['500', '777'], { packDir: dir, offline: false, fetchImpl: gh.fetch, log: (m) => lines.push(m) }, (id, png) =>
      written.set(id, png)
    )
    assert.equal(n, 1)
    assert.deepEqual([...written.keys()], ['500'])
    assert.ok(gh.urls.every((u) => u.startsWith(EOZ_RAW)), 'only GitHub is asked')
    assert.match(lines[0], /2 GitHub request\(s\).*not wiki requests/)
    const empty = tempDir()
    const none = await takeIconsFromPack(['500'], { packDir: empty, offline: true, log: (m) => lines.push(m) }, () => assert.fail('nothing to write'))
    rmSync(empty, { recursive: true, force: true })
    assert.equal(none, 0)
    assert.match(lines.at(-1) ?? '', /data pack unavailable/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
