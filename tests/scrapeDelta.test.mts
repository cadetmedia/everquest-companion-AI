// scrape-delta's item fold keeps scrape-items.ts's key law: a page's title key is its own, an
// `|itemname` alias takes a key no page is titled with, every key a change touches is re-awarded.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DELTA_BATCH,
  patchItemBatches,
  writeItemCache,
  writeMobCache,
  type CachedPage
} from '../scripts/sources/deltaCache'
import { foldItems } from '../scripts/sources/deltaItems'
import {
  emptyFeed,
  foldMobs,
  foldRcRow,
  nextScrapedAt,
  readRevPages,
  type PageTexts,
  type RcRow,
  type RevPage,
  unfolded,
  unfoldedReport
} from '../scripts/sources/deltaPages'
import { itemKey, type ItemDbEntry, type ItemDbFile } from '../src/main/itemsDb'

const CANON: ItemDbEntry = {
  page: 'A Sealed Letter',
  statsBlock: 'QUEST ITEM  NO TRADE  WT: 0.1 Size: SMALL',
  iconId: 708
}
const VARIANT = 'A Sealed Letter (Thex Dagger Quest)'

function file(entries: ItemDbEntry[]): ItemDbFile {
  const items: Record<string, ItemDbEntry> = {}
  for (const e of entries) {
    items[itemKey(e.page) ?? ''] = e
    if (e.name) items[itemKey(e.name) ?? ''] = e
  }
  return { scrapedAt: '2026-09-01T00:00:00.000Z', source: 'test', count: entries.length, items }
}

const page = (fields: string): string => `{{Itempage\n${fields}\n}}`

/** Fold over `f` in place, the way the run writes the result. */
function fold(f: ItemDbFile, pages: PageTexts): ReturnType<typeof foldItems> {
  const r = foldItems(f, pages)
  f.items = r.items
  return r
}

test('an edited variant page does not repoint the canonical key its |itemname names', () => {
  const f = file([CANON])
  const variant = page('|itemname=A Sealed Letter\n|lucy_img_ID=708')
  const { folded } = fold(f, new Map([[VARIANT, variant]]))
  assert.deepEqual(folded, [VARIANT])
  assert.equal(f.items[itemKey(CANON.page) ?? ''], CANON)
  assert.equal(f.items[itemKey(VARIANT) ?? '']?.page, VARIANT)
})

test("a page's newer revision replaces its own keys even when it is poorer", () => {
  const f = file([CANON])
  fold(f, new Map([[CANON.page, page('|lucy_img_ID=709')]]))
  const now = f.items[itemKey(CANON.page) ?? '']
  assert.equal(now?.page, CANON.page)
  assert.equal(now?.statsBlock, undefined)
})

test('a richer record still wins a key held by another page', () => {
  const thin: ItemDbEntry = { page: 'Cyclops skull', iconId: 1 }
  const f = file([thin])
  const richPage = page('|statsblock=MAGIC ITEM  WT: 1.0\n|lucy_img_ID=2')
  fold(f, new Map([['Cyclops Skull', richPage]]))
  assert.equal(f.items[itemKey('Cyclops skull') ?? '']?.page, 'Cyclops Skull')
})

test("an edited page's old |itemname key is dropped, another page's key is not", () => {
  const renamed: ItemDbEntry = { page: 'Rusty Thing (quest)', name: 'Old Name', iconId: 3 }
  const other: ItemDbEntry = { page: 'Bystander', iconId: 4 }
  const f = file([renamed, other])
  fold(f, new Map([[renamed.page, page('|itemname=New Name\n|lucy_img_ID=3')]]))
  assert.equal(f.items[itemKey('Old Name') ?? ''], undefined)
  assert.equal(f.items[itemKey('New Name') ?? '']?.page, renamed.page)
  assert.equal(f.items[itemKey('Bystander') ?? ''], other)
})

test('a key a changed page stops naming goes to the unchanged page that still claims it', () => {
  // The wiki's Armadillo Tail page carried |itemname=Armadillo Tooth, a typo, and held that key.
  const tail: ItemDbEntry = { page: 'Armadillo Tail', name: 'Armadillo Tooth', iconId: 5 }
  const tooth: ItemDbEntry = { page: 'Armadillo Tooth', name: 'Tooth of an Armadillo', iconId: 6 }
  const f = file([tooth, tail])
  assert.equal(f.items['armadillo tooth'], tail)
  const { orphans } = fold(f, new Map([[tail.page, page('|lucy_img_ID=5')]]))
  assert.equal(f.items['armadillo tooth'], tooth)
  assert.deepEqual(orphans, [])
})

test('a key with no known claimant left is dropped and its name is offered for a read', () => {
  const tail: ItemDbEntry = { page: 'Armadillo Tail', name: 'Armadillo Tooth', iconId: 5 }
  const f = file([tail])
  const edited = page('|lucy_img_ID=5')
  const first = foldItems(f, new Map([[tail.page, edited]]))
  assert.equal(first.items['armadillo tooth'], undefined)
  assert.deepEqual(first.orphans, ['Armadillo Tooth'])
  const tooth = page('|lucy_img_ID=6')
  const second = foldItems(f, new Map([[tail.page, edited], ['Armadillo Tooth', tooth]]))
  assert.equal(second.items['armadillo tooth']?.page, 'Armadillo Tooth')
  assert.equal(f.items['armadillo tooth'], tail, 'the committed file is not mutated')
})

test('a page titled with a key takes it back from an edited alias holder, however rich', () => {
  const quest: ItemDbEntry = { page: 'Rusty Dagger (quest)', name: 'Rusty Dagger', iconId: 7 }
  const real: ItemDbEntry = { page: 'Rusty Dagger', name: 'RD', iconId: 8 }
  const f = file([real, quest])
  const rich = page('|itemname=Rusty Dagger\n|lucy_img_ID=7\n|statsblock=MAGIC ITEM  WT: 1.0')
  fold(f, new Map([[quest.page, rich]]))
  assert.equal(f.items['rusty dagger'], real)
  assert.equal(f.items['rusty dagger (quest)']?.page, quest.page)
})

test('an edited case-variant page that is now poorer loses its key to the richer variant', () => {
  const rich: ItemDbEntry = { page: 'Cyclops skull', name: 'Skull of a Cyclops', iconId: 1 }
  const edited: ItemDbEntry = { page: 'Cyclops Skull', iconId: 2, statsBlock: 'MAGIC ITEM WT: 1' }
  const f = file([rich, edited])
  assert.equal(f.items['cyclops skull'], edited)
  fold(f, new Map([['Cyclops Skull', page('|lucy_img_ID=2')]]))
  assert.equal(f.items['cyclops skull'], rich)
})

test('equal claimants of a key go to the first title in sort order', () => {
  const a: ItemDbEntry = { page: 'Bone Chips', name: 'X1', iconId: 1 }
  const f = file([a])
  fold(f, new Map([['Bone chips', page('|itemname=X2\n|lucy_img_ID=1')]]))
  const first = ['Bone Chips', 'Bone chips'].sort((x, y) => x.localeCompare(y))[0]
  assert.equal(f.items['bone chips']?.page, first)
})

test('recentchanges rows: edits are re-read, and so is every title a log row names', () => {
  const feed = emptyFeed()
  const rows: RcRow[] = [
    { type: 'edit', title: 'Cyclops Skull', pageid: 11 },
    { type: 'new', title: 'Brand New Item', pageid: 12 },
    {
      type: 'log',
      title: 'Old Title',
      pageid: 13,
      logtype: 'move',
      logaction: 'move',
      logparams: { target_title: 'New Title' }
    },
    { type: 'log', title: 'Gone Page', pageid: 0, logtype: 'delete', logaction: 'delete' },
    { type: 'log', title: 'Back Page', pageid: 14, logtype: 'delete', logaction: 'restore' },
    { type: 'log', title: 'Locked Page', pageid: 15, logtype: 'protect', logaction: 'protect' }
  ]
  for (const rc of rows) foldRcRow(rc, feed)
  assert.deepEqual([...feed.pageids], [11, 12])
  assert.deepEqual(
    [...feed.titles],
    ['Old Title', 'New Title', 'Gone Page', 'Back Page', 'Locked Page']
  )
  assert.deepEqual(feed.logs, [
    { logtype: 'move', logaction: 'move', title: 'Old Title', target: 'New Title' },
    { logtype: 'delete', logaction: 'delete', title: 'Gone Page', target: undefined },
    { logtype: 'delete', logaction: 'restore', title: 'Back Page', target: undefined }
  ])
})

test('an edited page moved since is read by pageid, under its current title', () => {
  // mobs.json kept 'Megan OReilly' after the wiki page (40178) moved to 'Megan O`Reilly'.
  const feed = emptyFeed()
  foldRcRow({ type: 'edit', title: 'Megan OReilly', pageid: 40178 }, feed)
  const move = { target_title: 'Megan O`Reilly' }
  foldRcRow({ type: 'log', title: 'Megan OReilly', logtype: 'move', logparams: move }, feed)
  const pages: PageTexts = new Map()
  const unapplied: string[] = []
  const mob = '{{Namedmobpage\n|name=Megan O`Reilly\n|zone=[[Qeynos]]\n}}'
  const current = { pageid: 40178, ns: 0, title: 'Megan O`Reilly' }
  const rev = (content: string): RevPage['revisions'] => [{ slots: { main: { content } } }]
  readRevPages([{ ...current, revisions: rev(mob) }], pages, unapplied)
  const byTitle = [...feed.titles].filter((t) => !pages.has(t))
  assert.deepEqual(byTitle, ['Megan OReilly'])
  const redirect = '#REDIRECT [[Megan O`Reilly]]'
  readRevPages([{ title: 'Megan OReilly', ns: 0, revisions: rev(redirect) }], pages, unapplied)
  const r = foldMobs([{ page: 'Megan OReilly' }], pages)
  assert.deepEqual([...r.byPage.keys()], ['Megan O`Reilly'])
  assert.deepEqual(r.removed, ['Megan OReilly'])
})

test('a pageid that is gone or a page moved out of ns0 is left to its log row', () => {
  const pages: PageTexts = new Map()
  const unapplied: string[] = []
  const userPage = { title: 'User:Someone/Sandbox', ns: 2, revisions: [] }
  readRevPages([{ missing: true }, userPage], pages, unapplied)
  assert.equal(pages.size, 0)
  assert.deepEqual(unapplied, [])
})

test('a revisions response: content, a page that is gone, a page that could not be read', () => {
  const out: PageTexts = new Map()
  const unapplied: string[] = []
  readRevPages(
    [
      { title: 'Here', revisions: [{ slots: { main: { content: 'text' } } }] },
      { title: 'Gone', missing: true },
      { title: 'Hidden', revisions: [{ slots: { main: {} } }] }
    ],
    out,
    unapplied
  )
  assert.deepEqual([...out], [['Here', 'text'], ['Gone', null]])
  assert.deepEqual(unapplied, ['Hidden'])
  assert.equal(nextScrapedAt('then', unapplied, 'now'), 'then')
  assert.equal(nextScrapedAt('then', [], 'now'), 'now')
})

test('an item page deleted or turned into a redirect leaves the DB, its keys re-awarded', () => {
  const gone: ItemDbEntry = { page: 'Gone Item', name: 'Shared Name', iconId: 1 }
  const redirected: ItemDbEntry = { page: 'Old Item', iconId: 2 }
  const other: ItemDbEntry = { page: 'Other', name: 'Shared Name', iconId: 3 }
  const f = file([other, gone, redirected])
  const r = fold(f, new Map([['Gone Item', null], ['Old Item', '#REDIRECT [[New Item]]']]))
  assert.equal(f.items['gone item'], undefined)
  assert.equal(f.items['old item'], undefined)
  assert.equal(f.items['shared name'], other)
  assert.deepEqual(r.removed.sort(), ['Gone Item', 'Old Item'])
})

test('a mob page that is gone or no longer a mob leaves mobs.json', () => {
  const mobs = [{ page: 'A kobold king' }, { page: 'Megan OReilly' }, { page: 'Stays' }]
  const pages: PageTexts = new Map([
    ['Megan OReilly', '#REDIRECT [[Megan O`Reilly]]'],
    ['A kobold king', null]
  ])
  const r = foldMobs(mobs, pages)
  assert.deepEqual([...r.byPage.keys()], ['Stays'])
  assert.deepEqual(r.removed, ['Megan OReilly', 'A kobold king'])
})

test('pages folded nowhere are counted by kind; the report names every skipped file', () => {
  const pages: PageTexts = new Map([
    ['Healing Water', '{{Classic Era}}\n{{Spellpagesmart\n|name=Healing Water\n}}'],
    ['Old Name', '#REDIRECT [[New Name]]'],
    ['Plane of Sky', 'quests by class'],
    ['Bard', 'class prose'],
    ['A Quest', 'steps\n[[Category:Cleric Quests]]'],
    ['Some Zone', '{{Zonepage}}'],
    ['Folded Item', '{{Itempage}}'],
    ['Gone', null]
  ])
  const groups = unfolded(pages, new Set(['Folded Item']))
  assert.deepEqual(Object.fromEntries(groups), {
    spell: ['Healing Water'],
    redirect: ['Old Name'],
    'Plane of Sky': ['Plane of Sky'],
    'class page': ['Bard'],
    quest: ['A Quest'],
    other: ['Some Zone']
  })
  const report = unfoldedReport(groups).join('\n')
  assert.ok(report.startsWith('6 read pages folded into no DB:'))
  const skipped = ['spells', 'classes', 'quests', 'respawns', 'bosses', 'pageEra', 'posky']
  for (const f of [...skipped, 'mobRaces', 'mobFactions']) {
    assert.ok(report.includes(`/${f}.json`), f)
  }
  assert.ok(report.includes('`npm run scrape:spells` asks the wiki for current revids'))
  assert.ok(!unfoldedReport(new Map()).join('\n').includes('Spell pages changed'))
})

const cached = (pageid: number, title: string, content: string): CachedPage => ({
  pageid,
  ns: 0,
  title,
  revisions: [{ slots: { main: { content } } }]
})

test('item cache: a page replaces its copy by pageid, a new item page goes to the delta batch', () => {
  const batches = new Map<string, CachedPage[]>([
    ['batch-1-2.json', [cached(1, 'Megan OReilly', 'old'), cached(2, 'Gone Page', 'old')]],
    ['batch-3-1.json', [cached(3, 'Untouched', 'old')]]
  ])
  const dirty = patchItemBatches(batches, {
    fresh: [
      { pageid: 1, title: 'Megan O`Reilly', content: 'new' },
      { pageid: 9, title: 'New Item', content: '{{Itempage}}' },
      { pageid: 10, title: 'Some Spell', content: '{{Spellpage}}' }
    ],
    gone: new Set(['Gone Page']),
    keep: new Set(['New Item'])
  })
  assert.deepEqual(dirty.sort(), ['batch-1-2.json', DELTA_BATCH])
  assert.deepEqual(batches.get('batch-1-2.json'), [cached(1, 'Megan O`Reilly', 'new')])
  assert.deepEqual(batches.get(DELTA_BATCH), [cached(9, 'New Item', '{{Itempage}}')])
  assert.deepEqual(batches.get('batch-3-1.json'), [cached(3, 'Untouched', 'old')])
})

test('the caches on disk: batches rewritten, a mob page file and its index title moved', () => {
  const root = mkdtempSync(join(tmpdir(), 'scrape-delta-'))
  try {
    const items = join(root, 'items')
    const mobs = join(root, 'mobs')
    mkdirSync(items)
    mkdirSync(mobs)
    writeFileSync(join(items, 'batch-1-1.json'), JSON.stringify([cached(1, 'Old', 'old')]))
    writeFileSync(join(items, 'item-pages.json'), '[]')
    writeFileSync(join(mobs, 'page-1.wikitext'), 'old')
    const member = { pageid: 1, ns: 0, title: 'Old' }
    writeFileSync(join(mobs, 'mob-pages.json'), JSON.stringify([member]))
    const fresh = [
      { pageid: 1, title: 'New', content: 'new' },
      { pageid: 2, title: 'X', content: 'x' }
    ]
    assert.equal(writeItemCache(items, { fresh, gone: new Set(), keep: new Set() }), 1)
    const batch = JSON.parse(readFileSync(join(items, 'batch-1-1.json'), 'utf8')) as CachedPage[]
    assert.deepEqual(batch, [cached(1, 'New', 'new')])
    assert.equal(readFileSync(join(items, 'item-pages.json'), 'utf8'), '[]')
    assert.equal(writeMobCache(mobs, fresh), 1)
    assert.equal(readFileSync(join(mobs, 'page-1.wikitext'), 'utf8'), 'new')
    assert.equal(existsSync(join(mobs, 'page-2.wikitext')), false)
    const index = JSON.parse(readFileSync(join(mobs, 'mob-pages.json'), 'utf8')) as CachedPage[]
    assert.deepEqual(index, [{ pageid: 1, ns: 0, title: 'New' }])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
