// Collect every main-namespace redirect on eqlwiki and keep those that land on a mob page as that
// mob's `otherNames` in mobs.json (sources/mobRedirects.ts). One request per 500 redirects, at the
// shared 1 request per second. Run after a full `scrape:mobs`, which writes records without them.
//
//   npx tsx scripts/scrape-mob-redirects.ts

import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { isMain } from './sources/isMain'
import { applyOtherNames, type NamedMob, type Redirect } from './sources/mobRedirects'
import { wikiGet } from './sources/wikiApi'

const MOBS_PATH = resolve(fileURLToPath(import.meta.url), '../../src/renderer/src/data/eqlegends/mobs.json')

type Get = typeof wikiGet

/** Every row of one `list=` query, 500 a request, following its continue key. */
async function listAll<T>(get: Get, list: string, prefix: string, params: Record<string, string>): Promise<T[]> {
  const out: T[] = []
  let cont: string | undefined
  for (let page = 0; page < 200; page++) {
    const q: Record<string, string> = { action: 'query', list, [`${prefix}limit`]: '500', ...params }
    if (cont) q[`${prefix}continue`] = cont
    const j = await get<{ query?: Record<string, T[]>; continue?: Record<string, string> }>(q)
    out.push(...(j.query?.[list] ?? []))
    cont = j.continue?.[`${prefix}continue`]
    console.log(`  ${list} request ${String(page + 1)}: ${String(out.length)}`)
    if (!cont) break
  }
  return out
}

/**
 * Every ns0 redirect and its target: the redirect pages by id and title (`list=allpages`), joined
 * to each redirect's target by that id (`list=allredirects`). The API resolves no redirect while
 * it lists redirect pages, so it takes the two lists.
 */
export async function allRedirects(get: Get = wikiGet): Promise<Redirect[]> {
  const pages = await listAll<{ pageid: number; title: string }>(get, 'allpages', 'ap', { apnamespace: '0', apfilterredir: 'redirects' })
  const targets = await listAll<{ fromid: number; title: string }>(get, 'allredirects', 'ar', { arnamespace: '0', arprop: 'ids|title' })
  const titleOf = new Map(pages.map((p) => [p.pageid, p.title]))
  return targets.flatMap((t) => {
    const from = titleOf.get(t.fromid)
    return from === undefined ? [] : [{ from, to: t.title }]
  })
}

async function main(): Promise<void> {
  const data = JSON.parse(readFileSync(MOBS_PATH, 'utf8')) as { mobs: NamedMob[] }
  const redirects = await allRedirects()
  applyOtherNames(data.mobs, redirects)
  const named = data.mobs.filter((m) => m.otherNames).length
  const names = data.mobs.reduce((n, m) => n + (m.otherNames?.length ?? 0), 0)
  writeFileSync(MOBS_PATH, JSON.stringify(data, null, 2))
  console.log(`${String(redirects.length)} redirects; ${String(names)} land on ${String(named)} mob pages`)
}

if (isMain(import.meta.url)) void main()
