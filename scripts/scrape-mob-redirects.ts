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

interface RedirectPage {
  query?: { redirects?: Redirect[] }
  continue?: { gapcontinue?: string }
}

/** Every ns0 redirect and its target: redirect pages as a generator, resolved by `redirects`. */
export async function allRedirects(get: typeof wikiGet = wikiGet): Promise<Redirect[]> {
  const out: Redirect[] = []
  let cont: string | undefined
  for (let page = 0; page < 200; page++) {
    const params: Record<string, string> = {
      action: 'query',
      generator: 'allpages',
      gapnamespace: '0',
      gapfilterredir: 'redirects',
      gaplimit: '500',
      redirects: '1'
    }
    if (cont) params.gapcontinue = cont
    const j = await get<RedirectPage>(params)
    out.push(...(j.query?.redirects ?? []).map((r) => ({ from: r.from, to: r.to })))
    cont = j.continue?.gapcontinue
    console.log(`  request ${String(page + 1)}: ${String(out.length)} redirects`)
    if (!cont) break
  }
  return out
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
