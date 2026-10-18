// The expansion-banner rule (owner ruling, 2026-10-17): a banner that names a later EXPANSION gives
// way when the item page's own drop list puts a catalog mob that is in era in a zone that is in era
// (`shared/planner/era.ts bannerGivesWay`). A banner naming no expansion (a revamp, a chain, Unknown)
// still overrules. Hand-written fixtures, so the rule is pinned apart from any data build.
//
// Run: `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bannerGivesWay, CURRENT_ERA, eraBadgeOverrides, layeredVerdict, type DropEvidence } from '../src/shared/planner/era'
import { setMet } from '../src/shared/metInLog'
import { mobKey } from '../src/shared/mobKey'
import { donorEra } from '../src/renderer/src/features/planner/plannerData'
import { dropEraSubject } from '../src/renderer/src/features/mobs/dropEra'
import {
  buildCatalogDroppers,
  buildCatalogZones,
  catalogRowsByName,
  deriveEra,
  type EraDeriveCatalogs
} from '../src/main/planner/eraDerive'
import { itemKey, type ItemDbEntry } from '../src/main/itemsDb'
import type { PageEraFile } from '../src/main/pageEraDb'
import type { MobData } from '../src/shared/types'

/** A tiny mob catalog: name → rows, the shape the rule joins through. */
const CATALOG: Record<string, { name: string; outOfEra?: true }[]> = {
  'a giant wasp drone': [{ name: 'a giant wasp drone' }],
  'a hatebone drake': [{ name: 'a hatebone drake', outOfEra: true }],
  'a knight of innoruuk': [{ name: 'A Knight of Innoruuk' }]
}

function drops(sources: { mob: string; zone?: string }[]): DropEvidence {
  return { sources, catalogRows: (mob) => CATALOG[mobKey(mob)] ?? [] }
}

const WASPS = drops([{ mob: 'a giant wasp drone', zone: 'Greater Faydark' }])

test('a Luclin-bannered item an in-era catalog mob drops in a classic zone is in era', () => {
  assert.equal(bannerGivesWay('Luclin', WASPS, CURRENT_ERA), true)
  assert.equal(eraBadgeOverrides('Luclin', CURRENT_ERA, WASPS), false)
  assert.equal(layeredVerdict(['Greater Faydark'], 'Luclin', WASPS), 'in-era')
  assert.equal(layeredVerdict(['Greater Faydark'], 'Velious', WASPS), 'in-era', 'any later expansion')
  assert.equal(layeredVerdict(['Greater Faydark'], 'Luclin'), 'out-of-era', 'without the evidence, the banner wins')
})

test('the same item dropped only by a FLAGGED mob stays out', () => {
  const drake = drops([{ mob: 'a hatebone drake', zone: 'Plane of Hate' }])
  assert.equal(layeredVerdict(['Plane of Hate'], 'Velious', drake), 'out-of-era')
})

test('the flagged mob the player met counts: the log outranks its flag', () => {
  const drake = drops([{ mob: 'a hatebone drake', zone: 'Plane of Hate' }])
  try {
    setMet('mobs', ['a hatebone drake'])
    assert.equal(layeredVerdict(['Plane of Hate'], 'Velious', drake), 'in-era')
  } finally {
    setMet('mobs', [])
  }
})

test('a banner naming no expansion still overrules an in-era dropper: revamps, chains, Unknown', () => {
  const knight = drops([{ mob: 'A Knight of Innoruuk', zone: 'Plane of Hate' }])
  for (const tag of ['FearHateRevamp', 'Epics', 'EpicQuests', 'Unknown', 'HoleVP', 'Chardok']) {
    assert.equal(bannerGivesWay(tag, knight, CURRENT_ERA), false, tag)
    assert.equal(layeredVerdict(['Plane of Hate'], tag, knight), 'out-of-era', tag)
  }
})

test('no catalog row, no zone, or an out-of-era zone: the dropper counts for nothing', () => {
  assert.equal(layeredVerdict(['Greater Faydark'], 'Luclin', drops([{ mob: 'a mob nobody catalogued', zone: 'Greater Faydark' }])), 'out-of-era')
  assert.equal(layeredVerdict([], 'Luclin', drops([{ mob: 'a giant wasp drone' }])), 'out-of-era')
  assert.equal(layeredVerdict(['Kael Drakkel'], 'Luclin', drops([{ mob: 'a giant wasp drone', zone: 'Kael Drakkel' }])), 'out-of-era')
})

test('a banner for an era already open is not this rule at all', () => {
  assert.equal(bannerGivesWay('Classic', WASPS, CURRENT_ERA), false)
  assert.equal(bannerGivesWay('Luclin', WASPS, 'luclin'), false)
})

test('THE RENDERER PATH: Wasp Wing (Luclin banner, classic wasps) is in era; its mob-drop row carries the rows', () => {
  const wikiSources = [{ mob: 'a giant wasp drone', zone: 'Greater Faydark' }]
  assert.equal(donorEra({ key: 'wasp wing', eraTag: 'Luclin', wikiSources }).verdict, 'in-era')
  assert.equal(donorEra({ key: 'wasp wing', eraTag: 'Luclin' }).verdict, 'out-of-era', 'no drop rows, the banner wins')
  const subject = dropEraSubject({ item: 'Wasp Wing', eraTag: 'Luclin', eraZones: ['Greater Faydark'], eraSources: wikiSources })
  assert.deepEqual(subject.wikiSources, wikiSources)
  assert.equal(donorEra(subject).verdict, 'in-era')
  const revamp = { key: 'a test revamp choker', eraTag: 'FearHateRevamp', wikiSources: [{ mob: 'a giant wasp drone', zone: 'Greater Faydark' }] }
  assert.equal(donorEra(revamp).verdict, 'out-of-era', 'a revamp banner still overrules')
})

test('MAIN, edge targets: a component whose expansion banner gives way no longer walls the recipe', () => {
  const mobs: MobData = {
    scrapedAt: '2026-01-01T00:00:00.000Z',
    source: 'test',
    mobs: [{ page: 'a giant wasp drone', name: 'a giant wasp drone', zones: ['Greater Faydark'], drops: ['Wasp Wing'] }]
  }
  const noPages: PageEraFile = { scrapedAt: '', source: 'test', count: 0, pages: {}, refs: {}, mobs: {} }
  const base: EraDeriveCatalogs = {
    questByName: new Map(),
    catalogZones: buildCatalogZones(mobs),
    catalogDroppers: buildCatalogDroppers(mobs),
    pageEra: noPages
  }
  const wing: ItemDbEntry = { page: 'Wasp Wing', eraTag: 'Luclin', dropsFrom: [{ mob: 'a giant wasp drone', zone: 'Greater Faydark' }] }
  const rolls: ItemDbEntry = {
    page: 'Gator Rolls',
    craftedBy: [{ tradeskill: 'Baking', ingredients: [{ name: 'Wasp Wing', qty: 1, sources: ['Dropped'] }] }]
  }
  const corpus = new Map([
    [itemKey(wing.page), wing],
    [itemKey(rolls.page), rolls]
  ])
  assert.equal(deriveEra(rolls, corpus, base)?.basis, 'component', 'without the catalog join, the pill walls it')
  assert.equal(deriveEra(rolls, corpus, { ...base, catalogRows: catalogRowsByName(mobs) }), null)
  const revamp: ItemDbEntry = { ...wing, eraTag: 'FearHateRevamp' }
  const revampCorpus = new Map([
    [itemKey(wing.page), revamp],
    [itemKey(rolls.page), rolls]
  ])
  assert.equal(deriveEra(rolls, revampCorpus, { ...base, catalogRows: catalogRowsByName(mobs) })?.basis, 'component')
})
