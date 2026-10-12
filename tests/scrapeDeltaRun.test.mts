// scrape-delta's whole run against a stubbed wiki: one feed from the oldest stamp, each file
// taking only its own window, spells re-derived by pageid with title names, quests folded by
// title, caches left current. No request leaves the process.
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { deltaPaths, parseArgs, run, type DeltaPaths } from '../scripts/scrape-delta.mts'
import { pacing } from '../scripts/sources/deltaApi'
import { emptyFeed, foldRcRow } from '../scripts/sources/deltaPages'
import { planReads, windowStart, type Known } from '../scripts/sources/deltaWindow'
import { buildCatalog } from '../scripts/scrape-quests'
import type { QuestData, SpellDbFile } from '../src/shared/types'

const ITEMS_AT = '2026-09-28T00:45:01.872Z'
const SPELLS_AT = '2026-08-22T19:37:30.196Z'
const QUESTS_AT = '2026-09-06T03:13:20.569Z'

const spellPage = (spellname: string): string =>
  `{{Spellpagesmart|\n| spellname = ${spellname}\n| classes = [[Druid]] - Level 34\n| mana = 10\n}}`
const itemPage = (icon: number): string => `{{Itempage\n|lucy_img_ID=${icon}\n|statsblock=MAGIC ITEM\n}}`
const QUEST_OLD = 'Bring the pieces.\n== Reward ==\n{{:Rusty Dagger}}\n'
const QUEST_NEW = `${QUEST_OLD}{{Gear Set|Breastplate of Ro}}\n`

interface Live {
  pageid: number
  title: string
  revid: number
  content: string
}

/** The wiki now: Healing Water still says |spellname = Greater Healing (page 57458). */
const LIVE: Live[] = [
  { pageid: 57458, title: 'Healing Water', revid: 170001, content: spellPage('Greater Healing') },
  { pageid: 600, title: 'Brand New Spell', revid: 170002, content: spellPage('Brand New Spell') },
  { pageid: 500, title: 'Armor Quest', revid: 170003, content: QUEST_NEW },
  { pageid: 300, title: 'Rusty Blade', revid: 170004, content: itemPage(1) },
  { pageid: 301, title: 'Old Item', revid: 170005, content: itemPage(9) },
  { pageid: 700, title: 'Rusty Dagger', revid: 170006, content: '#REDIRECT [[Rusty Blade]]' },
  { pageid: 800, title: 'Zone X', revid: 170007, content: '{{Zonepage}}' }
]

/** Newest first, as the feed answers. */
const FEED = [
  { type: 'log', title: 'Rusty Dagger', pageid: 300, logtype: 'move', logaction: 'move',
    logparams: { target_title: 'Rusty Blade' }, timestamp: '2026-10-05T00:00:00Z' },
  { type: 'log', title: 'Doomed Spell', pageid: 0, logtype: 'delete', logaction: 'delete',
    timestamp: '2026-10-01T00:00:00Z' },
  { type: 'new', title: 'Brand New Spell', pageid: 600, timestamp: '2026-09-15T00:00:00Z' },
  { type: 'edit', title: 'Armor Quest', pageid: 500, timestamp: '2026-09-10T00:00:00Z' },
  { type: 'edit', title: 'Old Item', pageid: 301, timestamp: '2026-09-10T00:00:00Z' },
  { type: 'edit', title: 'Zone X', pageid: 800, timestamp: '2026-09-09T00:00:00Z' },
  { type: 'edit', title: 'Healing Water', pageid: 57458, timestamp: '2026-09-03T00:00:00Z' }
]

const asRev = (p: Live): object => ({
  pageid: p.pageid, ns: 0, title: p.title, revisions: [{ revid: p.revid, slots: { main: { content: p.content } } }]
})

/** The stubbed api.php; every request is logged. */
function wiki(calls: URLSearchParams[]) {
  return async (url: string | URL): Promise<Response> => {
    const q = new URL(String(url)).searchParams
    calls.push(q)
    const body = answer(q)
    return new Response(JSON.stringify(body), { status: 200 })
  }
}

function answer(q: URLSearchParams): object {
  if (q.get('list') === 'recentchanges') {
    if (q.get('rcdir') === 'newer') return { query: { recentchanges: [{ timestamp: '2026-07-01T00:00:00Z' }] } }
    return { query: { recentchanges: FEED } }
  }
  if (q.get('list') === 'embeddedin') {
    const listed = LIVE.filter((p) => p.content.includes('{{Spellpage'))
    return { query: { embeddedin: [...listed, { pageid: 200, title: 'Unchanged Spell' }] } }
  }
  const ids = q.get('pageids')?.split('|').map(Number)
  const titles = q.get('titles')?.split('|')
  const pages = ids
    ? ids.map((id) => LIVE.find((p) => p.pageid === id) ?? { pageid: id, missing: true })
    : (titles ?? []).map((t) => LIVE.find((p) => p.title === t) ?? { title: t, ns: 0, missing: true })
  return { query: { pages: pages.map((p) => ('revisions' in p || 'missing' in p ? p : asRev(p as Live))) } }
}

function put(path: string, data: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
}

/** The committed state: spells and quests from their caches, items and mobs at 09-28. */
function seed(root: string): DeltaPaths {
  const p = deltaPaths(root)
  put(p.items, JSON.stringify({ scrapedAt: ITEMS_AT, source: 'test', count: 2, items: {
    'old item': { page: 'Old Item', iconId: 8 }, 'rusty dagger': { page: 'Rusty Dagger', iconId: 1 }
  } }))
  put(p.mobs, JSON.stringify({ scrapedAt: ITEMS_AT, source: 'test', mobs: [] }))
  const spells: Record<string, [string, string]> = {
    57458: ['Healing Water', 'Greater Healing'], 100: ['Doomed Spell', 'Doomed Spell'], 200: ['Unchanged Spell', 'Wrong Name']
  }
  for (const [id, [, sn]] of Object.entries(spells)) put(join(p.spellCache, `${id}.wikitext`), spellPage(sn))
  put(join(p.spellCache, 'index.json'), JSON.stringify({ updatedAt: SPELLS_AT, revs: { 57458: 159545, 100: 10, 200: 20 } }))
  const names = ['Doomed Spell', 'Greater Healing', 'Wrong Name']
  const old = names.map((name) => ({ name, classes: 'Druid - Level 34', illusion: false, mana: 10 }))
  put(p.spells, JSON.stringify({ scrapedAt: SPELLS_AT, schema: 3, count: 3, withEffects: 0, spells: old }))
  const member = { pageid: 500, ns: 0, title: 'Armor Quest' }
  put(join(p.questCache, 'quest-pages.json'), JSON.stringify([member]))
  put(join(p.questCache, 'item-titles.json'), JSON.stringify(['breastplate of ro', 'rusty dagger']))
  put(join(p.questCache, 'page-500.wikitext'), QUEST_OLD)
  const isItem = (t: string): boolean => ['breastplate of ro', 'rusty dagger'].includes(t.toLowerCase())
  const { quests } = buildCatalog([member], () => QUEST_OLD, isItem)
  put(p.quests, JSON.stringify({ scrapedAt: QUESTS_AT, source: 'test', quests }))
  return p
}

function stubbed(t: TestContext): { root: string; calls: URLSearchParams[] } {
  const root = mkdtempSync(join(tmpdir(), 'scrape-delta-run-'))
  const calls: URLSearchParams[] = []
  pacing.delayMs = 0
  t.mock.method(globalThis, 'fetch', wiki(calls))
  t.mock.method(console, 'log', () => undefined)
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return { root, calls }
}

const json = <T,>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

test('a run reads the feed once and refreshes items, spells and quests, each from its own stamp', async (t) => {
  const { root, calls } = stubbed(t)
  const p = seed(root)
  await run(p, parseArgs(['--spell-titles', '--since-quests=2026-08-22T19:51:37.602Z']))
  const feedReads = calls.filter((q) => q.get('list') === 'recentchanges' && !q.get('rcdir'))
  assert.equal(feedReads.length, 1)
  assert.equal(feedReads[0].get('rcend'), windowStart(SPELLS_AT))
  for (const q of calls) assert.ok((q.get('pageids') ?? q.get('titles') ?? '').split('|').length <= 50)
  const read = calls.flatMap((q) => q.get('pageids')?.split('|') ?? [])
  assert.ok(!read.includes('301'), 'a known item changed before items.json was scraped is not read')
  assert.ok(read.includes('800'), 'an unknown page in the spell window is read: it could be a new spell')

  const spells = json<SpellDbFile>(p.spells)
  assert.deepEqual(spells.spells.map((s) => s.name), ['Brand New Spell', 'Healing Water', 'Unchanged Spell'])
  assert.notEqual(spells.scrapedAt, SPELLS_AT)
  const idx = json<{ revs: Record<string, number>; titles: Record<string, string> }>(join(p.spellCache, 'index.json'))
  assert.deepEqual(idx.titles, { 200: 'Unchanged Spell', 600: 'Brand New Spell', 57458: 'Healing Water' })
  assert.equal(idx.revs['57458'], 170001)
  assert.equal(idx.revs['600'], 170002)
  assert.ok(existsSync(join(p.spellCache, '600.wikitext')))

  const quests = json<QuestData>(p.quests)
  assert.deepEqual(quests.quests[0].rewards?.map((r) => r.name), ['Rusty Dagger', 'Breastplate of Ro'])
  assert.equal(readFileSync(join(p.questCache, 'page-500.wikitext'), 'utf8'), QUEST_NEW)
  assert.deepEqual(json<{ revs: object }>(join(p.questCache, 'index.json')).revs, { 500: 170003 })

  const items = json<{ items: Record<string, { page: string; iconId?: number }> }>(p.items).items
  assert.ok(Object.values(items).some((e) => e.page === 'Rusty Blade'), 'the moved item is under its new title')
  assert.ok(!Object.values(items).some((e) => e.page === 'Rusty Dagger'), 'its old title, now a redirect, left')
  assert.equal(items['old item']?.iconId, 8, 'the pre-stamp edit was not applied to items.json')
})

test('spell and quest pages are not added to the item cache', async (t) => {
  const { root } = stubbed(t)
  const p = seed(root)
  mkdirSync(p.itemCache, { recursive: true })
  put(join(p.itemCache, 'batch-1-1.json'), '[]')
  await run(p, parseArgs(['--spell-titles']))
  const added = json<{ title: string }[]>(join(p.itemCache, 'batch-delta.json')).map((c) => c.title)
  assert.deepEqual(added, ['Rusty Blade'])
})

test('without its own window a quest change before quests.json\'s stamp is not applied', async (t) => {
  const { root } = stubbed(t)
  const p = seed(root)
  const before = readFileSync(join(p.questCache, 'page-500.wikitext'), 'utf8')
  const feed = FEED.map((r) => (r.pageid === 500 ? { ...r, timestamp: '2026-09-01T00:00:00Z' } : r))
  FEED.splice(0, FEED.length, ...feed)
  try {
    await run(p, parseArgs(['--spell-titles']))
  } finally {
    FEED.splice(0, FEED.length, ...feed.map((r) => (r.pageid === 500 ? { ...r, timestamp: '2026-09-10T00:00:00Z' } : r)))
  }
  assert.equal(readFileSync(join(p.questCache, 'page-500.wikitext'), 'utf8'), before)
  assert.deepEqual(json<QuestData>(p.quests).quests[0].rewards?.map((r) => r.name), ['Rusty Dagger'])
})

test('a dry run asks for the feed and nothing else, and writes nothing', async (t) => {
  const { root, calls } = stubbed(t)
  const p = seed(root)
  const before = readFileSync(p.spells, 'utf8')
  await run(p, parseArgs(['--dry-run', '--spell-titles']))
  assert.deepEqual(calls.map((q) => q.get('list')), ['recentchanges', 'recentchanges'])
  assert.equal(readFileSync(p.spells, 'utf8'), before)
})

test('without titles in the spell index and no --spell-titles, spells sit out and the window starts later', async (t) => {
  const { root, calls } = stubbed(t)
  const p = seed(root)
  const before = readFileSync(p.spells, 'utf8')
  await run(p, parseArgs([]))
  const feed = calls.find((q) => q.get('list') === 'recentchanges' && !q.get('rcdir'))
  assert.equal(feed?.get('rcend'), windowStart(QUESTS_AT))
  assert.equal(readFileSync(p.spells, 'utf8'), before)
  assert.ok(!calls.some((q) => q.get('list') === 'embeddedin'))
})

test('the read plan: each change is read only when a window that could use it holds it', () => {
  const feed = emptyFeed()
  for (const rc of FEED) foldRcRow(rc, feed)
  const known: Known = {
    itemPages: new Set(['Old Item', 'Rusty Dagger']), mobPages: new Set(),
    spellIds: new Set([57458]), spellTitles: new Set(['Doomed Spell']),
    questIds: new Set([500]), questTitles: new Set(['Armor Quest'])
  }
  const w = { items: windowStart(ITEMS_AT), mobs: windowStart(ITEMS_AT), quests: windowStart(QUESTS_AT) }
  const noSpells = planReads(feed, w, known)
  assert.deepEqual(noSpells.pageids, [500])
  assert.deepEqual(noSpells.titles, ['Rusty Dagger', 'Rusty Blade', 'Doomed Spell'])
  const all = planReads(feed, { ...w, spells: windowStart(SPELLS_AT) }, known)
  assert.deepEqual(all.pageids, [600, 500, 800, 57458])
  assert.equal(all.byOwner.get('spells'), 2)
  assert.equal(all.byOwner.get('unknown'), 3)
})
