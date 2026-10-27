// THE APP SENDS THE WIKI NOTHING ON ITS OWN (owner, 2026-10-26: "the app should not be hitting the
// WIKI ever except (delta refresh before build, user clicks COPY on an item and it does the
// lookup)").
//
// Driven, not argued: the real item and mob lookups and the real `eqimg://` handler, with
// `globalThis.fetch` replaced by a counter, so nothing here reaches a network either. The lookups
// import `electron` (knowledgeCache.ts, errorLog.ts), so a resolve hook hands them a stub whose
// `app.getPath` is a throwaway directory; the modules are imported after it is registered.
// The source pins at the bottom name the only files that may open a wiki client or call a Copy door.

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'eqc-wikitraffic-'))
const STUB = 'eqc-stub:electron'
registerHooks({
  resolve: (spec, ctx, next) => (spec === 'electron' ? { url: STUB, format: 'commonjs', shortCircuit: true } : next(spec, ctx)),
  load: (url, ctx, next) =>
    url === STUB
      ? {
          format: 'commonjs',
          shortCircuit: true,
          source: `module.exports = { app: { getPath: () => ${JSON.stringify(userData)}, isPackaged: false, getVersion: () => '0.0.0' }, ipcMain: { handle() {} } }`
        }
      : next(url, ctx)
})

/** Every URL the app asked `fetch` for. A zero-hit search answers anything that does ask. */
const asked: string[] = []
const realFetch = globalThis.fetch
globalThis.fetch = ((input: string | URL | Request) => {
  asked.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  return Promise.resolve(Response.json({ query: { search: [] } }))
}) as typeof fetch

const { lookupItem, knownItem, lookupItemOnCopy } = await import('../src/main/itemLookup')
const { lookupMob, knownMob } = await import('../src/main/mobLookup')
const { copyLookup } = await import('../src/main/gapCopyLookup')
const { installImageCacheProtocol } = await import('../src/main/imageCache')

after(async () => {
  globalThis.fetch = realFetch
  // The knowledge cache saves 1.5 s after a write; let it land before the directory goes.
  await new Promise((r) => setTimeout(r, 1800))
  rmSync(userData, { recursive: true, force: true })
})

const NO_ITEM = 'Zzyzx Shard of Nowhere'
const NO_MOB = 'a zzyzx nowhere beast'

test('THE AUTOMATIC LOOKUPS MAKE ZERO REQUESTS for names no local data holds', async () => {
  asked.length = 0
  const item = await lookupItem(NO_ITEM)
  const mob = await lookupMob(NO_MOB)
  assert.deepEqual(asked, [], 'hover cards, the toast and the con card never reach the network')
  // Not asked is not "no page" and not "offline": the record says neither.
  assert.equal(item.notFound, undefined)
  assert.equal(item.offline, undefined)
  assert.equal(item.cached, false)
  assert.equal(mob.notFound, undefined)
  assert.equal(mob.offline, undefined)
  assert.equal(knownItem(NO_ITEM), null, "the engine's miss gets no answer")
  assert.equal(knownMob(NO_MOB), null)
  assert.deepEqual(asked, [])
})

test('A COPY CLICK IS THE ONE DOOR: it asks the wiki once, and every automatic lookup after reads its answer', async () => {
  asked.length = 0
  const name = 'Zzyzx Copied Trinket'
  assert.equal(await copyLookup('item', name), 'noPage', 'the zero-hit search is a real negative, and the row says so')
  assert.equal(asked.length, 1)
  assert.match(asked[0], /^https:\/\/eqlwiki\.com\/api\.php\?.*list=search/)
  const after = await lookupItem(name)
  assert.equal(after.notFound, true, 'the Copy answer is cached for the hover card')
  assert.equal(knownItem(name)?.notFound, true)
  assert.equal((await lookupItemOnCopy(name)).notFound, true)
  assert.equal(asked.length, 1, 'a cached answer is never asked again')
})

test('THE IMAGE HANDLER AS THE APP INSTALLS IT FETCHES NOTHING: a missing icon or portrait is a 404', async () => {
  asked.length = 0
  const bundledDir = join(userData, 'wiki-images')
  mkdirSync(bundledDir, { recursive: true })
  let handler: ((r: GlobalRequest) => GlobalResponse | Promise<GlobalResponse>) | null = null
  const packAsks: string[] = []
  // The composition root's options (src/main/index.ts): no `fetchImpl`.
  installImageCacheProtocol(
    { registerSchemesAsPrivileged: () => undefined, handle: (_s, h) => (handler = h) },
    {
      userData,
      bundledDir,
      itemIconPack: (id) => {
        packAsks.push(id)
        return Promise.resolve(null)
      },
      log: () => undefined,
      onError: () => undefined,
      warn: () => undefined
    }
  )
  const ask = handler as unknown as (r: GlobalRequest) => Promise<GlobalResponse>
  assert.equal((await ask(new Request('eqimg://item/987654'))).status, 404)
  const portrait = encodeURIComponent('https://wiki.project1999.com/images/Npc_nobody.png')
  assert.equal((await ask(new Request(`eqimg://url/${portrait}`))).status, 404)
  assert.deepEqual(packAsks, ['987654'], 'the GitHub pack is still asked for an item icon')
  assert.deepEqual(asked, [], 'and no wiki is')
})

// ---- the source pins ----------------------------------------------------------------------------

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p))
    else if (/\.tsx?$/.test(entry)) out.push(p.replace(/\\/g, '/'))
  }
  return out
}
const SRC = sourceFiles('src')
/** A file's code, comment lines dropped: a header may name a door without opening it. */
const code = (f: string): string => readFileSync(f, 'utf8').replace(/^\s*(\/\/|\/?\*).*$/gm, '')
const filesMatching = (re: RegExp): string[] => SRC.filter((f) => re.test(code(f))).sort()

test('ONLY THE THREE COPY-CLICK SERVICES OPEN A WIKI CLIENT, and only the Copy IPC calls their doors', () => {
  assert.deepEqual(filesMatching(/\bcreateWikiClient\(/), [
    'src/main/gapQuestLive.ts',
    'src/main/itemLookup.ts',
    'src/main/mobLookup.ts',
    'src/main/wikiClient.ts'
  ])
  assert.deepEqual(filesMatching(/\blookup(Item|Mob)OnCopy\b/), ['src/main/gapCopyLookup.ts', 'src/main/itemLookup.ts', 'src/main/mobLookup.ts'])
  assert.deepEqual(filesMatching(/eqlwiki\.com\/api\.php/), ['src/main/wikiClient.ts'])
  // Inside the services, the client is read by the Copy door alone (and by `resolvePage`, which only
  // the door calls).
  for (const [file, door] of [
    ['src/main/itemLookup.ts', 'export async function lookupItemOnCopy('],
    ['src/main/mobLookup.ts', 'export async function lookupMobOnCopy(']
  ] as const) {
    const src = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(/^\s*(\/\/|\*).*$/gm, '')
    const at = src.indexOf(door)
    assert.ok(at > 0, `${file} has its Copy door`)
    const resolver = /async function resolvePage\([\s\S]*?\n\}\n/.exec(src)?.[0] ?? ''
    assert.ok(resolver !== '', `${file} has its resolvePage`)
    const before = src.slice(0, at).replace(resolver, '')
    assert.doesNotMatch(before, /\bwiki\.(enqueue|fetch|search)|\bresolvePage\(/, `${file}: no wiki read outside the Copy door`)
    assert.equal(src.slice(at).match(/\bresolvePage\(/g)?.length, 1, `${file}: resolvePage is called by the door alone`)
  }
})

test('THE APP INSTALLS THE IMAGE HANDLER WITHOUT A FETCHER', () => {
  const index = readFileSync('src/main/index.ts', 'utf8')
  const call = index.slice(index.indexOf('installImageCacheProtocol(protocol'), index.indexOf('installSpeechCacheProtocol('))
  assert.ok(call.length > 0)
  assert.doesNotMatch(call, /fetchImpl/)
})
