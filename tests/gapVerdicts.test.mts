// The Gaps tab's cache verdicts: pure over a parsed cache file (src/main/gapVerdictsRead.ts), and
// the version constants the handler duplicates from the two lookups, audited against their source.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { verdictsFrom } from '../src/main/gapVerdictsRead'
import { itemTierKey } from '../src/shared/itemStats'

const FIXTURE = {
  version: 4,
  entries: {
    'wooden heart': { at: 1, data: { notFound: true } },
    'copper ring': { at: 1, data: { name: 'Copper Ring', cached: true } }
  }
}

test('verdictsFrom reads noPage, hasPage and unchecked off the entries, keyed by the fold it is handed', () => {
  assert.deepEqual(verdictsFrom(FIXTURE, 4, ['Wooden Heart +2', 'Copper Ring', 'Shrubbery'], itemTierKey), {
    'Wooden Heart +2': 'noPage',
    'Copper Ring': 'hasPage',
    Shrubbery: 'unchecked'
  })
})

test('an absent file or another cache version answers unchecked for everything', () => {
  assert.deepEqual(verdictsFrom(null, 4, ['Wooden Heart'], itemTierKey), { 'Wooden Heart': 'unchecked' })
  assert.deepEqual(verdictsFrom(FIXTURE, 3, ['Wooden Heart'], itemTierKey), { 'Wooden Heart': 'unchecked' })
  assert.deepEqual(verdictsFrom({ version: 4 }, 4, ['Wooden Heart'], itemTierKey), { 'Wooden Heart': 'unchecked' })
})

test('the handler versions match what the two lookups write', () => {
  const ipc = readFileSync('src/main/ipc/gapVerdicts.ts', 'utf8')
  const item = /const CACHE_VERSION = (\d+)/.exec(readFileSync('src/main/itemLookup.ts', 'utf8'))?.[1]
  const mob = /const CACHE_VERSION = (\d+)/.exec(readFileSync('src/main/mobLookup.ts', 'utf8'))?.[1]
  assert.equal(/ITEM_CACHE_VERSION = (\d+)/.exec(ipc)?.[1], item)
  assert.equal(/MOB_CACHE_VERSION = (\d+)/.exec(ipc)?.[1], mob)
})
