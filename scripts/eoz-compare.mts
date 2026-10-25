// eoz-compare.mts — our item and mob data against the wiki's GitHub data pack, before a delta in dev
// pre-release (owner, 2026-10-23). Reads GitHub, never the wiki: the manifest (~300 bytes) each run,
// the ~4 MB pack only when the manifest's sha256 changed. Never writes our data files.
//
//   npx tsx scripts/eoz-compare.mts               compare and report
//   npx tsx scripts/eoz-compare.mts --release     also apply the release rule: a pack built within 5 h
//                                                 stands in for the delta (stale pages named, nothing lost)
//   npx tsx scripts/eoz-compare.mts --seed-revs   seed the item and mob revision indexes from the pack,
//                                                 only when our files are newer than it (revIndex.ts)
//   --offline     use the cached pack, fetch nothing      --root <repo>   data and caches from there
//   --cache <dir> where the pack and reports live (default scripts/sources/cache/eoz)

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { gunzipSync } from 'zlib'
import { comparePack, packRevisions, releaseDecision, wikiTitle, type CompareReport, type FamilyReport, type OurFamily, type OurFields, type Pack } from './sources/eozCompare'
import { readRevIndex, seedRevs, writeRevIndex } from './sources/revIndex'
import { refreshEozPack, type EozManifest } from '../src/main/eozPack'

const UA = 'everquest-companion eoz-compare (+https://github.com/kaltinril/everquest-companion)'

interface Args {
  release: boolean
  seed: boolean
  offline: boolean
  root: string
  cache: string
}

function parseArgs(argv: string[]): Args {
  const valueOf = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const root = resolve(valueOf('--root') ?? join(dirname(fileURLToPath(import.meta.url)), '..'))
  const cache = resolve(valueOf('--cache') ?? join(root, 'scripts/sources/cache/eoz'))
  return { release: argv.includes('--release'), seed: argv.includes('--seed-revs'), offline: argv.includes('--offline'), root, cache }
}

const readJson = (p: string): unknown => JSON.parse(readFileSync(p, 'utf8'))

/**
 * The pack, downloaded only when the manifest's sha256 differs from the cached one and kept only when
 * it hashes to it (src/main/eozPack.ts, the fetch-and-verify the app and fetch-wiki-images share).
 */
async function freshPack(a: Args): Promise<{ pack: Pack; manifest: EozManifest; downloaded: number }> {
  const f = await refreshEozPack({ dir: a.cache, ua: UA, offline: a.offline })
  return { pack: JSON.parse(gunzipSync(readFileSync(f.gzPath)).toString('utf8')) as Pack, manifest: f.manifest, downloaded: f.downloaded }
}

interface ItemFile { scrapedAt: string; items: Record<string, { page: string; stats?: { classes?: string[]; slot?: string; ac?: number } }> }
interface MobFile { scrapedAt: string; mobs: { page: string; level?: string; zones?: string[] }[] }

function family(dir: string, list: string, ours: { stamp: string; pages: Map<string, OurFields> }): OurFamily {
  const { stamp, pages } = ours
  const listPath = join(dir, list)
  const listed = (existsSync(listPath) ? readJson(listPath) : []) as { pageid: number; title: string }[]
  return { stamp, pages, pageids: new Map(listed.map((p) => [wikiTitle(p.title), p.pageid])), revs: readRevIndex(dir).revs }
}

function ours(root: string): { items: OurFamily; mobs: OurFamily } {
  const it = readJson(join(root, 'src/main/data/items.json')) as ItemFile
  const mb = readJson(join(root, 'src/renderer/src/data/eqlegends/mobs.json')) as MobFile
  const cache = join(root, 'scripts/sources/cache')
  const itemPages = new Map<string, OurFields>()
  for (const e of Object.values(it.items)) {
    itemPages.set(wikiTitle(e.page), { classes: e.stats?.classes, slot: e.stats?.slot, ac: e.stats?.ac })
  }
  const mobPages = new Map<string, OurFields>(mb.mobs.map((m) => [wikiTitle(m.page), { level: m.level, zones: m.zones }]))
  return {
    items: family(join(cache, 'items'), 'item-pages.json', { stamp: it.scrapedAt, pages: itemPages }),
    mobs: family(join(cache, 'mobs'), 'mob-pages.json', { stamp: mb.scrapedAt, pages: mobPages })
  }
}

const SHOW = 12

function printFamily(f: FamilyReport): void {
  console.log(`\n${f.family}: pack ${String(f.packRows)} rows, ours ${String(f.ourPages)} pages, stamped ${f.stamp}`)
  console.log(`  behind the wiki: ${String(f.stale.length)}   no recorded revision, older than the pack: ${String(f.unknown.length)}`)
  for (const s of f.stale.slice(0, SHOW)) console.log(`    ${s.title}: ours rev ${String(s.ours)} -> wiki rev ${String(s.wiki)}`)
  console.log(`  in the pack, never listed by our scrape: ${String(f.missingUnlisted.length)}   listed, not in our data: ${String(f.missingListed.length)}`)
  if (f.missingUnlisted.length > 0) console.log(`    e.g. ${f.missingUnlisted.slice(0, SHOW).join(' | ')}`)
  console.log(`  ours, not in the pack: ${String(f.extra.length)}   field disagreements at the same revision: ${String(f.fieldDiffs.length)}`)
  for (const d of f.fieldDiffs.slice(0, SHOW)) console.log(`    ${d.title} ${d.field}: ours "${d.ours}" pack "${d.pack}"`)
}

function printRelease(r: CompareReport, now: string): void {
  const d = releaseDecision(r.pack.generatedAt, now)
  const behind = r.items.stale.length + r.mobs.stale.length + r.items.unknown.length + r.mobs.unknown.length
  console.log(`\nRelease rule: the pack is ${String(d.ageHours)} h old.`)
  if (d.deltaNeeded) {
    console.log('  Run the delta: the pack is not within 5 hours.')
    return
  }
  console.log('  Delta not needed for release: the pack is within 5 hours. Nothing is imported or dropped.')
  console.log(`  ${String(behind)} pages wait for the next delta (record them in the release notes' known issues).`)
  console.log(`  The next delta resumes from items ${r.items.stamp}, mobs ${r.mobs.stamp}.`)
}

function seed(a: Args, pack: Pack, o: { items: OurFamily; mobs: OurFamily }): void {
  const fams: [string, OurFamily, { wikiTitle: string; revisionId: number }[]][] = [['items', o.items, pack.items], ['mobs', o.mobs, pack.npcs]]
  for (const [name, fam, rows] of fams) {
    const dir = join(a.root, 'scripts/sources/cache', name)
    if (!existsSync(dir)) {
      console.log(`  ${name}: no cache in this checkout, nothing seeded`)
      continue
    }
    const idx = readRevIndex(dir)
    const n = seedRevs(idx, packRevisions(rows, fam.pageids), fam.stamp, pack.meta.generatedAt)
    if (n > 0) writeRevIndex(dir, idx, new Date().toISOString())
    console.log(`  ${name}: ${String(n)} revisions seeded from the pack${n === 0 ? ' (our stamp is not after the pack, or every page has one)' : ''}`)
  }
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2))
  const { pack, manifest, downloaded } = await freshPack(a)
  console.log(`Pack ${manifest.version ?? '?'} built ${pack.meta.generatedAt}; ${String(downloaded)} bytes from GitHub this run (0 wiki requests).`)
  const o = ours(a.root)
  const report = comparePack(pack, o.items, o.mobs)
  printFamily(report.items)
  printFamily(report.mobs)
  console.log(`\nNot in the pack, not checked: ${report.unchecked.join(', ')}.`)
  if (a.release) printRelease(report, new Date().toISOString())
  if (a.seed) seed(a, pack, o)
  const out = join(a.cache, `report-${(manifest.version ?? 'pack').replace(/[^\w.-]/g, '_')}.json`)
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n')
  console.log(`\nFull report: ${out}`)
}

if ((process.argv[1] ?? '').endsWith('eoz-compare.mts')) {
  main().catch((e: unknown) => {
    console.error(e)
    process.exit(1)
  })
}
