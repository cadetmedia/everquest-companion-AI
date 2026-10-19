// slayerFactions.test.mts — the Achievements tab's "No faction hits" switch: the wiki's
// `|factions` field read off a mob page, and the switch leaving those mobs out of the zone list
// and the map shading alike.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { factionHits, factionNames } from '../scripts/sources/mobFaction'
import type { MobEntry } from '../src/shared/mobTypes'
import { countersIn, planZones, slayerMobs, slayerTarget } from '../src/shared/slayer/slayerPlan'
import { slayerAreas } from '../src/renderer/src/features/slayer/slayerAreas'

const counter = (achievement: string, label: string): Parameters<typeof slayerTarget>[0] => ({
  group: 'Skill',
  achievement,
  label,
  have: 0,
  need: 100
})
const BATS = slayerTarget(counter('Bat Country!', 'Bats and Werebats.'))
const CROWS = slayerTarget(counter("You're Not Scaring Anyone", 'Scarecrows and Totems.'))

const at = (name: string, zone: string, locs: [number, number][]): MobEntry => ({
  page: name,
  name,
  zones: [zone],
  loc: locs.map(([ns, ew]) => ({ ns, ew }))
})

test("a mob page's faction hits are the factions it links, less any the kill raises", () => {
  const page = (field: string): string =>
    `{{Namedmobpage\n| race = Dwarf\n| factions = \n\n${field}\n\n| opposing_factions = \n\n* Unknown\n}}`
  assert.deepEqual(
    factionHits(page("* [[Merchants of Kaladim]] <span class='profac'>(-30)</span>\n* [[DeepPockets]]")),
    ['Merchants of Kaladim', 'DeepPockets']
  )
  assert.deepEqual(factionHits(page('* None')), [])
  assert.deepEqual(factionHits(page('* Unknown')), [])
  assert.deepEqual(factionHits(page('')), [])
  assert.deepEqual(factionHits(page("* [[Guards of Qeynos]] <span class='oppfac'>(5)</span>")), [])
  assert.deepEqual(factionHits(page('* [[Ebon Mask|the Ebon Mask]] (-?)')), ['the Ebon Mask'])
})

test('every faction a page names, lowered or raised, for the Gaps tab', () => {
  const page = `{{Namedmobpage\n| factions =\n* [[Undead Frogloks of Guk]] (-20)\n* None\n| opposing_factions =\n* [[Frogloks of Guk]] (+5)\n* [[Undead Frogloks of Guk]]\n}}`
  assert.deepEqual(factionNames(page), ['Undead Frogloks of Guk', 'Frogloks of Guk'])
  assert.deepEqual(factionNames('{{Namedmobpage\n| factions =\n* Unknown\n}}'), [])
})

test('a faction bullet is a hit by the sign of its number, and an unlinked bullet names its faction', () => {
  const page = (field: string): string => `{{Namedmobpage\n| factions = \n\n${field}\n}}`
  assert.deepEqual(factionHits(page("* [[Heretics]] <span class='oppfac'>(-10)</span>")), ['Heretics'])
  assert.deepEqual(factionHits(page("* [[The Dead]]    <span class='oppfac'>(-30)</span>")), ['The Dead'])
  assert.deepEqual(factionHits(page("* [[Heretics]] <span class='oppfac'>(-0)</span>")), ['Heretics'])
  assert.deepEqual(factionHits(page("* [[Heretics]] <span class='oppfac'>(?)</span>")), [])
  assert.deepEqual(
    factionHits(page("* Guards of Qeynos <span class='profac'>(-10)</span>\n* Najena (-5)\n* GemChoppers")),
    ['Guards of Qeynos', 'Najena', 'GemChoppers']
  )
  assert.deepEqual(factionHits(page('* KaranaResidents +\n* Aviak (+2)')), [])
  for (const junk of ['* None?', '* Unknown', "* ''Need Info''", '* ?', '*', '* for Kaesora', '* KOS Animal']) {
    assert.deepEqual(factionHits(page(junk)), [], junk)
  }
})

test('the faction switch leaves out a mob the wiki says costs faction, from the list and the map', () => {
  const crow = at('a scarecrow', 'Western Plains of Karana', [[100, 100]])
  const bat = at('a giant bat', 'Western Plains of Karana', [[150, 150]])
  const field = slayerMobs(
    [crow, bat],
    (page) => (page.includes('bat') ? 'Giant Bat' : 'Scarecrow'),
    (page) => page === 'a scarecrow'
  )
  const off = { maxLevel: null, outOfEra: false, noFactionHits: false }
  const on = { ...off, noFactionHits: true }
  const names = (opts: typeof off): string[] =>
    planZones(field, [BATS, CROWS], opts).flatMap((z) => z.mobs.map((m) => m.name))
  assert.deepEqual(names(off).sort(), ['a giant bat', 'a scarecrow'])
  assert.deepEqual(names(on), ['a giant bat'])
  assert.deepEqual(slayerAreas('qey2hh1', field, [BATS, CROWS], on).flatMap((a) => a.mobs), ['a giant bat'])
  const zones = planZones(field, [BATS, CROWS], on)
  assert.deepEqual([...countersIn(zones, 'qey2hh1')], [BATS.id], 'the scarecrow counter has nothing here now')
})
