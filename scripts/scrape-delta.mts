// scrape-delta.mts — top up the committed wiki DBs from MediaWiki's OWN change feed, instead of
// re-reading 18,000 pages that did not change.
//
//   npx tsx scripts/scrape-delta.mts [--dry-run] [--spell-titles] [--since-<file>=<ISO>]
//
// Files: items.json, mobs.json, spells.json, quests.json. `list=recentchanges` is read ONCE, from
// the oldest stamp among them; each file takes only the changes newer than its own scrapedAt
// (sources/deltaWindow.ts). Only changed pages' wikitext is fetched (50 per request, one request
// a second, no retry on a 4xx), parsed by the SAME parsers the full scrapers use, and folded
// over the committed records. Full scrape @ T plus every change since T is the wiki's state now,
// so scrapedAt moves to now; that holds only while the feed reaches back to T, so the run refuses
// when it does not. A move, delete or restore is applied by re-reading its titles. A page that
// could not be read keeps every scrapedAt where it was.
//
// Spells are re-derived from their cache, which needs every page's title (the spell name comes
// from it): `--spell-titles` lists them (list=embeddedin, ~5 requests); the index keeps them for
// later runs. `--since-<items|mobs|spells|quests>=<ISO>` moves a file's window back (never
// forward), for a file whose stamp is newer than the wiki text it was built from.
//
// After a run that changed anything: `npm run gen:data-weight` (the ledger pins exact bytes).

import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import type { ItemDbFile } from '../src/main/itemsDb'
import type { QuestData, SpellDbFile } from '../src/shared/types'
import {
  assertFeedReaches,
  changedPages,
  emptyReads,
  fetchWikitext,
  listSpellPages,
  pacing,
  type Reads
} from './sources/deltaApi'
import { writeItemCache, writeMobCache, type FreshPage } from './sources/deltaCache'
import { foldItems, isItemPage, type ItemFold } from './sources/deltaItems'
import {
  foldMobs,
  nextScrapedAt,
  QUESTS_FILE,
  SPELLS_FILE,
  type FeedChanges,
  type PageTexts,
  unfolded,
  unfoldedReport
} from './sources/deltaPages'
import {
  foldQuests,
  questRedirects,
  readQuestCache,
  writeQuestCache,
  type QuestCache,
  type QuestFold
} from './sources/deltaQuests'
import {
  printDryRun,
  printPageLogs,
  printRemoved,
  printSpellNames,
  printStamp,
  printWindows
} from './sources/deltaReport'
import {
  deriveSpells,
  foldSpells,
  readSpellIndex,
  spellFile,
  writeSpellCache,
  type SpellFold,
  type SpellIndex
} from './sources/deltaSpells'
import {
  type DeltaFile,
  type Known,
  newestStart,
  oldestStart,
  pagesFor,
  planReads,
  type ReadPlan,
  timeOf,
  windowStart,
  type Windows
} from './sources/deltaWindow'
import { isMobPage } from './sources/mobPage'

const HERE = dirname(fileURLToPath(import.meta.url))

export interface DeltaPaths {
  root: string
  items: string
  mobs: string
  spells: string
  quests: string
  itemCache: string
  mobCache: string
  spellCache: string
  questCache: string
}

/** The checkout's files, from `root` (the repo). */
export function deltaPaths(root: string): DeltaPaths {
  return {
    root,
    items: resolve(root, 'src/main/data/items.json'),
    mobs: resolve(root, 'src/renderer/src/data/eqlegends/mobs.json'),
    spells: resolve(root, SPELLS_FILE),
    quests: resolve(root, QUESTS_FILE),
    itemCache: resolve(root, 'scripts/sources/cache/items'),
    mobCache: resolve(root, 'scripts/sources/cache/mobs'),
    spellCache: resolve(root, 'scripts/sources/cache/spells'),
    questCache: resolve(root, 'scripts/sources/cache/quests')
  }
}

export interface DeltaOptions {
  dry: boolean
  spellTitles: boolean
  since: Partial<Record<DeltaFile, string>>
}

export function parseArgs(argv: string[]): DeltaOptions {
  const opts: DeltaOptions = { dry: false, spellTitles: false, since: {} }
  for (const a of argv) {
    const since = /^--since-(items|mobs|spells|quests)=(.+)$/.exec(a)
    if (a === '--dry-run') opts.dry = true
    else if (a === '--spell-titles') opts.spellTitles = true
    else if (since && Number.isFinite(Date.parse(since[2]))) {
      opts.since[since[1] as DeltaFile] = new Date(since[2]).toISOString()
    } else throw new Error(`unknown argument ${a}`)
  }
  return opts
}

interface MobsFile {
  scrapedAt: string
  source: string
  mobs: { page: string }[]
}

/** The committed files; spells and quests only where this checkout has their caches. */
export interface Dbs {
  items: ItemDbFile
  mobs: MobsFile
  spells: SpellDbFile | null
  spellIndex: SpellIndex | null
  quests: QuestData | null
  questCache: QuestCache | null
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))
const maybeJson = (path: string): unknown => (existsSync(path) ? readJson(path) : null)

function loadDbs(p: DeltaPaths): Dbs {
  return {
    items: readJson(p.items) as ItemDbFile,
    mobs: readJson(p.mobs) as MobsFile,
    spells: maybeJson(p.spells) as SpellDbFile | null,
    spellIndex: readSpellIndex(p.spellCache),
    quests: maybeJson(p.quests) as QuestData | null,
    questCache: readQuestCache(p.questCache)
  }
}

/** A file's window: its own stamp, or an earlier `--since-<file>`, minus the overlap hour. */
function startOf(stamp: string, since: string | undefined): string {
  return windowStart(since && since < stamp ? since : stamp)
}

/** Spells join only when their titles are at hand (listed this run, or kept in the index). */
export function windowsOf(db: Dbs, opts: DeltaOptions): Windows {
  const w: Windows = {
    items: startOf(db.items.scrapedAt, opts.since.items),
    mobs: startOf(db.mobs.scrapedAt, opts.since.mobs)
  }
  if (db.spells && db.spellIndex && (opts.spellTitles || db.spellIndex.titles)) {
    w.spells = startOf(db.spells.scrapedAt, opts.since.spells)
  }
  if (db.quests && db.questCache) w.quests = startOf(db.quests.scrapedAt, opts.since.quests)
  return w
}

function knownOf(db: Dbs): Known {
  const titles = db.spellIndex?.titles ?? {}
  const members = db.questCache?.members ?? []
  return {
    itemPages: new Set(Object.values(db.items.items).map((e) => e.page)),
    mobPages: new Set(db.mobs.mobs.map((m) => m.page)),
    spellIds: new Set(Object.keys(db.spellIndex?.revs ?? {}).map(Number)),
    spellTitles: new Set(Object.values(titles)),
    questIds: new Set(members.map((m) => m.pageid)),
    questTitles: new Set(members.map((m) => m.title))
  }
}

export async function run(paths: DeltaPaths, opts: DeltaOptions): Promise<void> {
  const db = loadDbs(paths)
  const w = windowsOf(db, opts)
  printWindows(db, w, opts)
  const oldest = oldestStart(w)
  await assertFeedReaches(oldest)
  console.log(`Changed ns0 pages since ${oldest}…`)
  const { feed, requests, extra } = await changedPages(oldest, newestStart(w))
  console.log(
    `  ${feed.pageids.size} pages changed, ${feed.titles.size} titles named by log rows; ` +
      `${requests} feed requests, ${extra} of them only for windows older than ${newestStart(w)}`
  )
  printPageLogs(feed.logs)
  const plan = planReads(feed, w, knownOf(db))
  if (opts.dry) {
    printDryRun(plan, requests, w.spells && opts.spellTitles ? spellListCost(db) : 0)
    return
  }
  const universe = w.spells ? await spellUniverse(db, opts) : null
  const reads = await readPlanned(paths, plan, universe)
  await applyDelta({ paths, db, w, feed, reads, universe })
}

/** list=embeddedin answers 500 titles a request. */
const spellListCost = (db: Dbs): number =>
  Math.ceil((Object.keys(db.spellIndex?.revs ?? {}).length + 1) / 500)

async function spellUniverse(db: Dbs, opts: DeltaOptions): Promise<Record<string, string>> {
  if (!opts.spellTitles) return { ...(db.spellIndex?.titles ?? {}) }
  console.log('Listing spell pages (Template:Spellpage, 500 a request)…')
  const list = await listSpellPages()
  console.log(`  ${list.length} spell pages`)
  return Object.fromEntries(list.map((p) => [String(p.pageid), p.title]))
}

/** The planned pages, plus any listed spell page the cache has no file for. */
async function readPlanned(
  paths: DeltaPaths,
  plan: ReadPlan,
  universe: Record<string, string> | null
): Promise<Reads> {
  const reads = emptyReads()
  const planned = new Set(plan.pageids)
  const uncached = Object.keys(universe ?? {})
    .map(Number)
    .filter((id) => !planned.has(id) && !existsSync(join(paths.spellCache, `${id}.wikitext`)))
  if (uncached.length) console.log(`  ${uncached.length} listed spell pages have no cache file`)
  await fetchWikitext('pageids', [...plan.pageids, ...uncached].map(String), reads)
  await fetchWikitext('titles', plan.titles.filter((t) => !reads.pages.has(t)), reads)
  return reads
}

interface DeltaCtx {
  paths: DeltaPaths
  db: Dbs
  w: Windows
  feed: FeedChanges
  reads: Reads
  universe: Record<string, string> | null
}

/** Items over their window; a key whose last claimant let go may still have a page of that name. */
async function readAndFoldItems(ctx: DeltaCtx): Promise<ItemFold> {
  const pages = pagesFor('items', ctx.w, ctx.feed, ctx.reads)
  let itemFold = foldItems(ctx.db.items, pages)
  const orphans = itemFold.orphans.filter((t) => !ctx.reads.pages.has(t))
  if (orphans.length === 0) return itemFold
  console.log(`  ${orphans.length} item keys lost their holder; reading those titles`)
  await fetchWikitext('titles', orphans, ctx.reads)
  for (const t of itemFold.orphans) {
    const wt = ctx.reads.pages.get(t)
    if (wt !== undefined) pages.set(t, wt)
  }
  itemFold = foldItems(ctx.db.items, pages)
  return itemFold
}

/** Quests over their window; a page turned redirect is read through its target, as scrape:quests does. */
async function readAndFoldQuests(ctx: DeltaCtx): Promise<QuestFold | null> {
  const { db, reads } = ctx
  if (!ctx.w.quests || !db.quests || !db.questCache) return null
  const pages = pagesFor('quests', ctx.w, ctx.feed, reads)
  const targets = questRedirects(db.questCache, pages, reads)
  if (targets.length) await fetchWikitext('titles', targets, reads)
  const aux: PageTexts = new Map(targets.map((t) => [t, reads.pages.get(t) ?? null]))
  return foldQuests(db.questCache, db.quests.quests, { pages, ids: reads, aux })
}

/** Spells over their window (plus listed pages read for a missing cache file), then re-derived. */
interface SpellRun {
  fold: SpellFold
  missing: number[]
  file: SpellDbFile
}

function foldAndDeriveSpells(ctx: DeltaCtx): SpellRun | null {
  const { universe, reads } = ctx
  const prev = ctx.db.spells
  if (!universe || !ctx.w.spells || !prev) return null
  const pages = pagesFor('spells', ctx.w, ctx.feed, reads)
  for (const [title, id] of reads.pageids) {
    if (universe[String(id)] !== undefined && !pages.has(title)) {
      pages.set(title, reads.pages.get(title) ?? null)
    }
  }
  const fold = foldSpells(universe, pages, reads)
  const fresh = new Map(fold.fresh.map((p) => [p.pageid, p.content]))
  const text = (id: number): string | null => {
    const file = join(ctx.paths.spellCache, `${id}.wikitext`)
    return fresh.get(id) ?? (existsSync(file) ? readFileSync(file, 'utf8') : null)
  }
  const { spells, missing } = deriveSpells(fold.titles, text)

  printSpellNames(prev.spells, spells)
  return { fold, missing, file: spellFile(prev, spells, prev.scrapedAt) }
}

async function applyDelta(ctx: DeltaCtx): Promise<void> {
  const { db, reads, paths } = ctx
  const itemFold = await readAndFoldItems(ctx)
  const mobFold = foldMobs(db.mobs.mobs, pagesFor('mobs', ctx.w, ctx.feed, reads))
  const questFold = await readAndFoldQuests(ctx)
  const spellRun = foldAndDeriveSpells(ctx)
  const now = new Date().toISOString()
  const stamp = (prev: string, more: string[] = []): string =>
    nextScrapedAt(prev, [...reads.unapplied, ...more], now)

  const distinctPages = new Set(Object.values(itemFold.items).map((e) => e.page)).size
  const items = Object.entries(itemFold.items).sort((a, b) => a[0].localeCompare(b[0]))
  writeAtomic(paths.items, JSON.stringify({
    scrapedAt: stamp(db.items.scrapedAt),
    source: deltaSource(db.items.source),
    count: distinctPages,
    items: Object.fromEntries(items)
  }))
  const mobs = [...mobFold.byPage.values()].sort((a, b) => a.page.localeCompare(b.page))
  writeAtomic(paths.mobs, JSON.stringify({
    scrapedAt: stamp(db.mobs.scrapedAt),
    source: deltaSource(db.mobs.source),
    mobs
  }))
  console.log(`\nFolded ${itemFold.folded.length} item pages and ${mobFold.folded.length} mob pages.`)
  printRemoved('item', itemFold.removed)
  printRemoved('mob', mobFold.removed)
  console.log(`items.json count: ${db.items.count} → ${distinctPages}`)

  const refreshed = new Set<string>()
  const spellStuck = writeSpells(ctx, spellRun, stamp, now)
  if (spellRun) refreshed.add(SPELLS_FILE)
  if (questFold && db.quests && db.questCache) {
    writeQuests(ctx, questFold, stamp(db.quests.scrapedAt, questFold.unapplied))
    refreshed.add(QUESTS_FILE)
  }
  printStamp([...reads.unapplied, ...(questFold?.unapplied ?? []), ...spellStuck])
  console.log(`Requests this run: ${pacing.requests}`)
  console.log(`Next: npm run gen:data-weight  (the ledger pins exact bytes)`)
  const folded = new Set([
    ...itemFold.folded, ...mobFold.folded, ...(questFold?.folded ?? []), ...(spellRun?.fold.folded ?? [])
  ])
  for (const line of unfoldedReport(unfolded(censusPages(ctx), folded), refreshed)) console.log(line)
  writeBackCaches(paths, reads, folded)
}

/** spells.json and its cache; returns the listed pages that could not be read (they hold the stamp). */
function writeSpells(
  ctx: DeltaCtx,
  spellRun: SpellRun | null,
  stamp: (prev: string, more?: string[]) => string,
  now: string
): string[] {
  const { db } = ctx
  if (!spellRun || !db.spells || !db.spellIndex) return []
  const { file } = spellRun

  const stuck = spellRun.missing.map((id) => `spell page ${id}`)
  writeAtomic(ctx.paths.spells, JSON.stringify({ ...file, scrapedAt: stamp(db.spells.scrapedAt, stuck) }, null, 2))
  writeSpellCache(ctx.paths.spellCache, db.spellIndex, spellRun.fold, now)
  console.log(
    `spells.json: ${db.spells.count} → ${file.count} spells (${spellRun.fold.folded.length} pages ` +
      `folded); spellCorrectionsList.ts name rows may need the re-derived names`
  )
  printRemoved('spell', spellRun.fold.removed)
  return stuck
}

function writeQuests(ctx: DeltaCtx, fold: QuestFold, scrapedAt: string): void {
  const { db } = ctx
  if (!db.quests || !db.questCache) return
  const out: QuestData = { scrapedAt, source: deltaSource(db.quests.source), quests: fold.quests }
  writeAtomic(ctx.paths.quests, JSON.stringify(out, null, 2))
  writeQuestCache(ctx.paths.questCache, db.questCache, fold)
  console.log(`quests.json: ${db.quests.quests.length} → ${fold.quests.length} (${fold.folded.length} pages folded)`)
  printRemoved('quest', fold.removed)
}

/**
 * The census: every read page, less the item and mob pages changed before those files' stamps
 * (read only because a spell or quest window reaches further back; their DB already has them).
 */
function censusPages(ctx: DeltaCtx): PageTexts {
  const start = [ctx.w.items, ctx.w.mobs].sort()[0] ?? ''
  const out: PageTexts = new Map()
  for (const [title, wt] of ctx.reads.pages) {
    const early = Date.parse(timeOf(title, ctx.feed, ctx.reads)) < Date.parse(start)
    if (wt != null && early && (isItemPage(wt) || isMobPage(wt))) continue
    out.set(title, wt)
  }
  return out
}

/** The fresh wikitext into the gitignored item and mob caches this checkout has (sources/deltaCache). */
function writeBackCaches(paths: DeltaPaths, reads: Reads, keep: ReadonlySet<string>): void {
  const fresh: FreshPage[] = []
  for (const [title, pageid] of reads.pageids) {
    const content = reads.pages.get(title)
    if (content != null) fresh.push({ pageid, title, content })
  }
  const gone = new Set([...reads.pages].filter(([, wt]) => wt === null).map(([t]) => t))
  const absent: string[] = []
  if (existsSync(paths.itemCache)) {
    const files = writeItemCache(paths.itemCache, { fresh, gone, keep })
    console.log(`Item cache: ${files} batch files updated`)
  } else absent.push('scripts/sources/cache/items')
  if (existsSync(paths.mobCache)) {
    console.log(`Mob cache: ${writeMobCache(paths.mobCache, fresh)} pages updated`)
  } else absent.push('scripts/sources/cache/mobs')
  if (absent.length === 0) return
  console.log(
    `No ${absent.join(' or ')} in this checkout, so it was not refreshed: scrape-page-era.ts, ` +
      'gen-mob-races.mts and gen-mob-factions.mts read that cache wherever they run, and there it ' +
      'still holds the text of the last full scrape.'
  )
}

function deltaSource(source: string): string {
  if (source.includes('delta')) return source
  return `${source} + recentchanges delta (scripts/scrape-delta.mts)`
}

/** Write beside, then rename: an interrupted run never leaves a truncated committed DB. */
function writeAtomic(path: string, data: string): void {
  writeFileSync(`${path}.tmp`, data, 'utf8')
  renameSync(`${path}.tmp`, path)
}

if ((process.argv[1] ?? '').endsWith('scrape-delta.mts')) {
  void run(deltaPaths(resolve(HERE, '..')), parseArgs(process.argv.slice(2)))
}
