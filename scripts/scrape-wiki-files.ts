// scrape-wiki-files.ts — the wiki's file list, cached like every other wiki text (owner, 2026-10-18),
// so the Gaps tab can name mobs whose page has no image: Marda's page named npc_marda.png and no
// such file existed. The list is fetched once (`list=allimages`, 500 a request) into
// cache/files/files.json; after that `--fresh <titles.json>` asks only about the File: pages the
// delta saw change (50 a request), and a run with neither sends nothing. Each mobs.json record is
// then marked `noImage` when its page names no image or one the list lacks.
//
//   npx tsx scripts/scrape-wiki-files.ts                     the whole list (first run)
//   npx tsx scripts/scrape-wiki-files.ts --fresh <file>      only the File: titles in <file>
//   npx tsx scripts/scrape-wiki-files.ts --offline           re-mark mobs.json, zero requests

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { isMain } from './sources/isMain'
import { wikiGet } from './sources/wikiApi'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = resolve(ROOT, 'scripts/sources/cache/files/files.json')
const MOBS = resolve(ROOT, 'src/renderer/src/data/eqlegends/mobs.json')

/** A file name as the wiki keys it: no `File:`, underscores for spaces, the first letter capital. */
export function fileKey(name: string): string {
  const bare = name.trim().replace(/^File:/i, '').replace(/ /g, '_')
  return bare.charAt(0).toUpperCase() + bare.slice(1)
}

/** Each record marked `noImage` when its page names no image, or one `files` lacks. */
export function markNoImage(mobs: { image?: string; noImage?: true }[], files: ReadonlySet<string>): number {
  let n = 0
  for (const m of mobs) {
    delete m.noImage
    if (m.image === undefined || !files.has(fileKey(m.image))) {
      m.noImage = true
      n++
    }
  }
  return n
}

/** Every file on the wiki, 500 a request. */
async function allFiles(): Promise<string[]> {
  const out: string[] = []
  let cont: string | undefined
  for (let page = 0; page < 1000; page++) {
    const q: Record<string, string> = { action: 'query', list: 'allimages', ailimit: '500', aiprop: '' }
    if (cont) q.aicontinue = cont
    const j = await wikiGet<{ query?: { allimages?: { name: string }[] }; continue?: { aicontinue?: string } }>(q)
    out.push(...(j.query?.allimages ?? []).map((f) => fileKey(f.name)))
    cont = j.continue?.aicontinue
    if (page % 10 === 9) console.log(`  ${String(out.length)} files…`)
    if (!cont) break
  }
  return out
}

/** Whether each of `titles` (File: pages) exists now, 50 a request. */
async function existing(titles: readonly string[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>()
  for (let i = 0; i < titles.length; i += 50) {
    const slice = titles.slice(i, i + 50).map((t) => `File:${fileKey(t)}`)
    const j = await wikiGet<{ query?: { pages?: { title: string; missing?: boolean }[] } }>({ action: 'query', titles: slice.join('|') })
    for (const p of j.query?.pages ?? []) out.set(fileKey(p.title), p.missing !== true)
  }
  return out
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const freshAt = args.indexOf('--fresh')
  const fresh = freshAt < 0 ? [] : (JSON.parse(readFileSync(args[freshAt + 1], 'utf8')) as string[]).filter((t) => /^File:/i.test(t))
  let files = new Set(existsSync(CACHE) ? (JSON.parse(readFileSync(CACHE, 'utf8')) as string[]) : [])
  const whole = !args.includes('--offline') && (files.size === 0 || args.includes('--refresh'))
  if (whole) files = new Set(await allFiles())
  else if (fresh.length > 0 && !args.includes('--offline')) {
    for (const [name, here] of await existing(fresh)) {
      if (here) files.add(name)
      else files.delete(name)
    }
  }
  if (whole || fresh.length > 0) {
    mkdirSync(dirname(CACHE), { recursive: true })
    writeFileSync(CACHE, JSON.stringify([...files].sort(), null, 0) + '\n')
  }
  const data = JSON.parse(readFileSync(MOBS, 'utf8')) as { mobs: { image?: string; noImage?: true }[] }
  const without = markNoImage(data.mobs, files)
  writeFileSync(MOBS, JSON.stringify(data, null, 2))
  console.log(`${String(files.size)} files on the wiki; ${String(without)} of ${String(data.mobs.length)} mob pages have no image`)
}

if (isMain(import.meta.url)) void main()
