// Mobs met whose wiki page has no image (owner ask, 2026-10-18: Marda's page named npc_marda.png
// and no such file existed). Fixtures only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { imageGaps } from '../src/shared/gapImages'
import { dropGaps } from '../src/shared/gapDrops'
import { factionGaps } from '../src/shared/gapFactions'
import { gapActions } from '../src/shared/gaps'
import { groupGaps, rowEntries } from '../src/shared/gapGroups'
import { wikiPageText } from '../src/shared/wikiPage'
import type { KillMap } from '../src/shared/kills'

const catalog = [
  { page: 'Marda', name: 'Marda', image: 'npc_marda.png', noImage: true as const },
  { page: 'Drizda Tunesinger', name: 'Drizda Tunesinger', image: 'npc_drizda_tunesinger.png' },
  { page: 'A goblin (Feerrott)', name: 'a goblin', noImage: true as const },
  { page: 'A goblin', name: 'a goblin', image: 'npc_a_goblin.png' },
  { page: 'Clurg', name: 'Clurg', noImage: true as const }
]
const kill = (display: string, count: number): KillMap[string] => ({ display, count, bestTier: -1, firstTs: 0, lastTs: 0, credited: count, tiers: {} })

test('a met mob whose every page lacks an image is a row named by its page; pictured, unmet and unknown mobs are not', () => {
  const kills: KillMap = { marda: kill('Marda', 3), 'a goblin': kill('a goblin', 9), drizda: kill('Drizda Tunesinger', 1), nobody: kill('a mob the wiki lacks', 4) }
  const loot = [{ item: 'Rusty Axe', source: 'Clurg', zone: 'Oggok', ts: 0 }]
  const rows = imageGaps(kills, loot as never, catalog)
  assert.deepEqual(rows.map((r) => [r.name, r.image, r.count, r.kinds[0]]), [
    ['Marda', 'npc_marda.png', 3, 'killed'],
    ['Clurg', 'npc_clurg.png', 1, 'looted']
  ])
  const clurg = rows[1]
  assert.equal(wikiPageText(clurg, [], {}), '| imagefilename     = npc_clurg.png\n')
  const [action] = gapActions(clurg, 'unchecked')
  assert.equal(action.label, 'Upload image')
  assert.equal(action.href, 'https://eqlwiki.com/index.php?title=Special:Upload&wpDestFile=npc_clurg.png')
  const shape = groupGaps([clurg], []).map((e) => (e.kind === 'zone' ? e.zone : e.kind === 'mob' ? `  ${e.mob}` : `    ${e.row.name}`))
  // The row is the mob: it sits under its zone with no mob heading.
  assert.deepEqual(shape, ['Oggok', '    Clurg'])
})

test('two spellings met that lead to one page are one row, and the table keys never repeat', () => {
  // `Marda` and `marda the bold` (a redirect spelling) both reach the page Marda.
  const cat = [{ page: 'Marda', name: 'Marda', otherNames: ['Marda the Bold'], image: 'npc_marda.png', noImage: true as const }]
  const kills: KillMap = { marda: kill('Marda', 3), 'marda the bold': kill('Marda the Bold', 9) }
  const rows = imageGaps(kills, [], cat)
  assert.deepEqual(rows.map((r) => [r.name, r.count]), [['Marda', 9]])
  const twice = [...rows, ...rows]
  assert.deepEqual(rowEntries(twice).map((e) => e.key), ['image|Marda', 'image|Marda#2'])
  const grouped = groupGaps(twice, []).map((e) => e.key)
  assert.equal(new Set(grouped).size, grouped.length)
})

test('rows the tab builds carry First and Last, in the log stamp shape, from the ledgers', () => {
  const t1 = new Date(2026, 9, 6, 23, 9, 1).getTime()
  const t2 = new Date(2026, 9, 19, 18, 34, 20).getTime()
  const kills: KillMap = { marda: { ...kill('Marda', 2), firstTs: t1, lastTs: t2 } }
  const [img] = imageGaps(kills, [], catalog)
  assert.deepEqual([img?.first, img?.last], ['2026-10-06 23:09:01', '2026-10-19 18:34:20'])
  const [drop] = dropGaps([{ item: 'Rusty Axe', source: 'Clurg', zone: 'Oggok', ts: t2 }, { item: 'Rusty Axe', source: 'Clurg', zone: 'Oggok', ts: t1 }] as never, [{ page: 'Clurg', name: 'Clurg', drops: [] }], {})
  assert.deepEqual([drop?.first, drop?.last], ['2026-10-06 23:09:01', '2026-10-19 18:34:20'])
  const [fac] = factionGaps([{ mob: 'Marda', faction: 'Clan Kolbok', n: 2, zone: 'Oggok' }], [{ page: 'Marda', name: 'Marda', factions: [] }], kills)
  assert.deepEqual([fac?.first, fac?.last], ['2026-10-06 23:09:01', '2026-10-19 18:34:20'])
  // No time known: blank, as before.
  assert.equal(imageGaps({ marda: kill('Marda', 1) }, [], catalog)[0]?.first, '')
})
