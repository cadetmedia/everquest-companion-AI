// deltaFollow.ts — after the folds, every other wiki-derived file the change feed reaches, brought
// up to date by the tool that already owns it: offline from the caches where they hold the text
// (respawns, mob factions and races, the engine's spell overlay, the byte ledger), revid-checked or
// re-asked for the changed pages only where they do not (classes, era verdicts), in full only for
// Plane of Sky (one page plus its reward pages), and bundled images whose File: page changed are
// fetched again. Boss portraits are hand-picked across two wikis: a changed boss page is named.

import { spawnSync } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { cacheCandidateNames, normalizeUpstreamImageUrl, urlCacheHash, type EqImgRequest } from '../../src/main/imageCache'
import type { WikiRespawn } from '../../src/shared/respawnWiki'
import { dedupe, rowsFromBatch } from '../scrape-respawns'
import { changedPages } from './deltaApi'
import { CLASS_PAGES } from './deltaPages'
import { mobPagesFrom } from './mobCache'

const RESPAWNS = 'src/main/data/respawns.json'
const BOSSES = 'src/renderer/src/data/eqlegends/bosses.json'
const POSKY = 'src/renderer/src/data/eqlegends/posky.json'
const IMAGES = 'resources/wiki-images'
/** The drop-group pages scrape-drop-groups.ts read: the Gaps tab's missing-drop check. */
const DROP_GROUP_PAGES = 'scripts/sources/cache/drop-groups/pages.json'

/** The closing report's files this stage keeps current (refreshed, or nothing behind them changed). */
export const FOLLOWED = [
  RESPAWNS,
  'src/main/data/classes.json',
  POSKY,
  'src/main/data/pageEra.json',
  'src/renderer/src/data/eqlegends/mobRaces.json',
  'src/renderer/src/data/eqlegends/mobFactions.json'
]

/** What the run changed: every ns0 title it read or a log row named, and which DBs moved. */
export interface Changed {
  titles: ReadonlySet<string>
  items: boolean
  mobs: boolean
  spells: boolean
}

/** One file and the script, run from the repo root, that brings it up to date. */
export interface FollowUp {
  file: string
  script: string
  args?: string[]
  /** node flags the script needs (the ledger measures with --expose-gc) */
  node?: string[]
}

/** A committed file, or `absent` where this checkout does not carry it (the build then has nothing to refresh). */
const readJson = (root: string, file: string, absent: unknown = null): unknown =>
  existsSync(join(root, file)) ? JSON.parse(readFileSync(join(root, file), 'utf8')) : absent

/** The pages posky.json is built from: the Plane of Sky page and every reward and item page. */
function poskyPages(root: string): string[] {
  const { quests } = readJson(root, POSKY, { quests: [] }) as { quests: { rewardPage?: string; items?: { page?: string }[] }[] }
  return ['Plane of Sky', ...quests.flatMap((q) => [q.rewardPage ?? '', ...(q.items ?? []).map((i) => i.page ?? '')])]
}

/** The scripts a run's changes call for, in the order they run. `fresh` lists the changed titles. */
export function followUps(root: string, c: Changed, fresh: string): FollowUp[] {
  const touched = (pages: Iterable<string>): boolean => [...pages].some((t) => c.titles.has(t))
  const out: FollowUp[] = []
  if (c.mobs) {
    out.push({ file: 'src/renderer/src/data/eqlegends/mobFactions.json', script: 'scripts/gen-mob-factions.mts' })
    out.push({ file: 'src/renderer/src/data/eqlegends/mobRaces.json', script: 'scripts/gen-mob-races.mts' })
  }
  if (touched(CLASS_PAGES)) out.push({ file: 'src/main/data/classes.json', script: 'scripts/scrape-classes.ts' })
  if (touched(poskyPages(root))) out.push({ file: POSKY, script: 'scripts/scrape-posky.ts' })
  // A mob page can name a new group; a group page can change its members. Six requests, all of them.
  const groupPages = (readJson(root, DROP_GROUP_PAGES, []) as { title: string }[]).map((p) => p.title)
  if (c.mobs || touched(groupPages)) out.push({ file: 'src/renderer/src/data/eqlegends/dropGroups.json', script: 'scripts/scrape-drop-groups.ts' })
  if (c.items || c.mobs || c.spells) {
    out.push({ file: 'src/main/data/pageEra.json', script: 'scripts/scrape-page-era.ts', args: ['--fresh', fresh] })
  }
  if (c.spells) out.push({ file: 'engine/crates/eqlog/data/spell-overlay.json', script: 'scripts/gen-engine-spell-overlay.mts' })
  out.push({ file: IMAGES, script: 'scripts/fetch-wiki-images.mts' })
  out.push({ file: 'src/main/data/dataWeight.generated.json', script: 'scripts/gen-data-weight.mts', node: ['--expose-gc'] })
  return out
}

/** Run each in turn; the files whose script is missing here or failed. */
export function runFollowUps(root: string, list: readonly FollowUp[]): string[] {
  const stale: string[] = []
  for (const f of list) {
    if (!existsSync(join(root, f.script))) {
      console.log(`\n${f.file}: ${f.script} is not in this checkout, so it was not refreshed`)
      stale.push(f.file)
      continue
    }
    console.log(`\n→ ${f.file}: ${[f.script, ...(f.args ?? [])].join(' ')}`)
    const r = spawnSync(process.execPath, [...(f.node ?? []), '--import', 'tsx', f.script, ...(f.args ?? [])], { cwd: root, stdio: 'inherit' })
    if (r.status !== 0) stale.push(f.file)
  }
  return stale
}

/**
 * respawns.json from the mob cache, as scrape-respawns reads it (catalog order, the same rows and
 * de-duplication), with zero requests. Refuses when a catalog page is not in the cache.
 */
export function writeRespawns(root: string, mobs: readonly { page: string; name: string }[]): string | null {
  const prev = readJson(root, RESPAWNS)
  if (prev === null) return null
  const cache = mobPagesFrom(root, [])
  const missing = mobs.filter((m) => !cache.has(m.page)).map((m) => m.page)
  if (missing.length > 0) {
    console.log(`respawns.json: ${String(missing.length)} catalog pages are not in the mob cache (${missing.slice(0, 5).join(' | ')}); run npm run scrape:respawns`)
    return RESPAWNS
  }
  const byTitle = new Map(mobs.map((m) => [m.page, m.name]))
  const pages = mobs.map((m) => ({ title: m.page, revisions: [{ slots: { main: { content: cache.get(m.page) ?? '' } } }] }))
  const stripped = new Set<WikiRespawn>()
  const { rows, conflicts } = dedupe(rowsFromBatch(pages, byTitle, stripped), stripped)
  const out = { ...(prev as object), scrapedAt: new Date().toISOString().slice(0, 10), rows }
  writeFileSync(join(root, RESPAWNS), JSON.stringify(out, null, 1) + '\n')
  console.log(`respawns.json: ${String(rows.length)} rows from the mob cache (${String(conflicts.length)} name collisions)`)
  return null
}

/** The bundled images a changed eqlwiki File: page stands behind, removed so they are fetched again. */
export function dropChangedImages(root: string, fileTitles: Iterable<string>): string[] {
  const { targets } = readJson(root, BOSSES, { targets: [] }) as { targets: { image?: string }[] }
  const dropped: string[] = []
  for (const title of fileTitles) {
    const name = title.replace(/^File:/, '').replace(/ /g, '_')
    const item = /^Item_(\d+)\.png$/i.exec(name)
    const reqs: EqImgRequest[] = item ? [{ kind: 'item', id: item[1] }] : []
    for (const t of targets) {
      const url = t.image ? normalizeUpstreamImageUrl(t.image) : null
      if (url?.includes('eqlwiki.com') && decodeURIComponent(url).endsWith(`/${name}`)) reqs.push({ kind: 'url', url, hash: urlCacheHash(url) })
    }
    for (const file of reqs.flatMap(cacheCandidateNames).map((n) => join(root, IMAGES, n))) {
      if (!existsSync(file)) continue
      rmSync(file)
      dropped.push(name)
    }
  }
  return dropped
}

/** Boss names and spellings whose eqlwiki page changed (portraits are picked by hand). */
export function changedBosses(root: string, titles: ReadonlySet<string>): string[] {
  const { targets } = readJson(root, BOSSES, { targets: [] }) as { targets: { name: string; match?: string[] }[] }
  return [...new Set(targets.flatMap((t) => [t.name, ...(t.match ?? [])]))].filter((n) => titles.has(n))
}

/** The whole stage. Returns the files left stale (a script missing or failed). */
export async function followDelta(root: string, c: Changed, since: string, mobs: readonly { page: string; name: string }[]): Promise<string[]> {
  const stale: string[] = []
  if (c.mobs) {
    const left = writeRespawns(root, mobs)
    if (left) stale.push(left)
  }
  const { feed } = await changedPages(since, since, '6')
  const dropped = dropChangedImages(root, [...feed.pageTitle.values(), ...feed.titles])
  if (dropped.length) console.log(`Images whose File: page changed, fetched again: ${dropped.join(' | ')}`)
  const bosses = changedBosses(root, c.titles)
  if (bosses.length) console.log(`Boss pages changed (bosses.json portraits are hand-picked; look at each): ${bosses.join(' | ')}`)
  const dir = mkdtempSync(join(tmpdir(), 'scrape-delta-'))
  const fresh = join(dir, 'fresh.json')
  writeFileSync(fresh, JSON.stringify([...c.titles]))
  try {
    return [...stale, ...runFollowUps(root, followUps(root, c, fresh))]
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
