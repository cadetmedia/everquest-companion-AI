// The delta covers every wiki-derived file (owner, 2026-10-18: "the delta process should pull in
// ALL WIKI changes since the last timestamp, and correctly update our cache"). Fixtures only.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { changedBosses, dropChangedImages, followUps, writeRespawns, type Changed } from '../scripts/sources/deltaFollow'
import { foldRedirects, type PageTexts } from '../scripts/sources/deltaPages'
import type { NamedMob } from '../scripts/sources/mobRedirects'
import { cacheCandidateNames, normalizeUpstreamImageUrl, urlCacheHash } from '../src/main/imageCache'

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'delta-follow-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

const BOSSES = JSON.stringify({
  targets: [
    { name: 'Sister of the Spire', match: ['Sister of the Spire'], image: 'https://eqlwiki.com/images/a/ab/Npc_Sister.png' },
    { name: 'Lord Nagafen', image: 'https://wiki.project1999.com/images/thumb/Npc_Sister.png/300px-Npc_Sister.png' }
  ]
})
const POSKY = JSON.stringify({ quests: [{ rewardPage: 'Mask of Song', items: [{ page: 'Light Woolen Mask' }] }] })

test('a redirect read this run lands on its mob; one re-read as no redirect leaves it', () => {
  const before: NamedMob[] = [{ page: 'The Ghoul Lord', name: 'the ghoul lord', otherNames: ['Old Alias'] }]
  const after: NamedMob[] = [{ page: 'The Ghoul Lord', name: 'the ghoul lord' }]
  const pages: PageTexts = new Map([
    ['Hoptor Thaggelum', '#REDIRECT [[The Ghoul Lord]]'],
    ['Old Alias', 'an article now'],
    ['The Ghoul Lord', '{{Namedmobpage}}']
  ])
  assert.deepEqual(foldRedirects(before, after, pages), ['Hoptor Thaggelum'])
  assert.deepEqual(after[0].otherNames, ['Hoptor Thaggelum'])
  // Untouched redirects ride along.
  const kept: NamedMob[] = [{ page: 'The Ghoul Lord', name: 'the ghoul lord' }]
  foldRedirects(before, kept, new Map())
  assert.deepEqual(kept[0].otherNames, ['Old Alias'])
})

test('each follow-up runs only when a change reaches it; images and the byte ledger always', () => {
  const root = tree({ 'src/renderer/src/data/eqlegends/posky.json': POSKY })
  try {
    const of = (c: Partial<Changed>, titles: string[] = []): string[] =>
      followUps(root, { items: false, mobs: false, spells: false, ...c, titles: new Set(titles) }, 'f.json').map((f) => f.script)
    assert.deepEqual(of({}), ['scripts/fetch-wiki-images.mts', 'scripts/gen-data-weight.mts'])
    assert.ok(of({}, ['Shadow Knight']).includes('scripts/scrape-classes.ts'))
    assert.ok(of({}, ['Light Woolen Mask']).includes('scripts/scrape-posky.ts'))
    assert.ok(!of({}).includes('scripts/scrape-drop-groups.ts'))
    const mobs = of({ mobs: true })
    for (const s of ['gen-mob-factions.mts', 'gen-mob-races.mts', 'scrape-page-era.ts', 'scrape-drop-groups.ts']) assert.ok(mobs.includes(`scripts/${s}`), s)
    assert.ok(of({ spells: true }).includes('scripts/gen-engine-spell-overlay.mts'))
    const era = followUps(root, { items: true, mobs: false, spells: false, titles: new Set() }, 'f.json').find((f) => f.script.includes('page-era'))
    assert.deepEqual(era?.args, ['--fresh', 'f.json'])
    const ledger = followUps(root, { items: false, mobs: false, spells: false, titles: new Set() }, 'f.json').at(-1)
    assert.deepEqual(ledger?.node, ['--expose-gc'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('respawns are rebuilt from the mob cache, and refused when a catalog page is not in it', () => {
  const page = (respawn: string): string => `{{Namedmobpage\n|name = x\n|respawn_time = ${respawn}\n}}`
  const root = tree({
    'src/main/data/respawns.json': JSON.stringify({ source: 'eqlwiki.com', scrapedAt: '2026-10-18', rows: [] }),
    'scripts/sources/cache/mobs/mob-pages.json': JSON.stringify([{ pageid: 1, title: 'A bat' }]),
    'scripts/sources/cache/mobs/page-1.wikitext': page('6 minutes')
  })
  try {
    assert.equal(writeRespawns(root, [{ page: 'A bat', name: 'a bat' }]), null)
    const out = JSON.parse(readFileSync(join(root, 'src/main/data/respawns.json'), 'utf8')) as { rows: { key: string; seconds?: number }[] }
    assert.deepEqual(out.rows.map((r) => [r.key, r.seconds]), [['a bat', 360]])
    assert.equal(writeRespawns(root, [{ page: 'A bat', name: 'a bat' }, { page: 'Gone', name: 'gone' }]), 'src/main/data/respawns.json')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a changed File: page drops the bundled image behind it, on eqlwiki only; changed boss pages are named', () => {
  const root = tree({
    'src/renderer/src/data/eqlegends/bosses.json': BOSSES,
    'resources/wiki-images/item-708.png': 'png'
  })
  try {
    assert.deepEqual(dropChangedImages(root, ['File:Item 708.png', 'File:Item 9.png']), ['Item_708.png'])
    assert.equal(existsSync(join(root, 'resources/wiki-images/item-708.png')), false)
    assert.deepEqual(changedBosses(root, new Set(['Sister of the Spire', 'A bat'])), ['Sister of the Spire'])
    // The same file name on the P99 wiki is another file: only the eqlwiki portrait goes.
    const bossFile = (raw: string): string => {
      const url = normalizeUpstreamImageUrl(raw) ?? ''
      return join(root, 'resources/wiki-images', cacheCandidateNames({ kind: 'url', url, hash: urlCacheHash(url) })[0])
    }
    const [eql, p99] = (JSON.parse(BOSSES) as { targets: { image: string }[] }).targets.map((t) => bossFile(t.image))
    for (const f of [eql, p99]) writeFileSync(f, 'png')
    assert.deepEqual(dropChangedImages(root, ['File:Npc Sister.png']), ['Npc_Sister.png'])
    assert.deepEqual([existsSync(eql), existsSync(p99)], [false, true])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
