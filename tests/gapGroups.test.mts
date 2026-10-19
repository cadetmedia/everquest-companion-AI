// The Gaps list grouped as a hunting plan (owner ask, 2026-10-18): zone, then mob, then what is missing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupGaps, rowEntries, ZONE_NOT_SEEN, type GapEntry } from '../src/shared/gapGroups'
import type { GapRow } from '../src/shared/gaps'
import type { LootEvent } from '../src/shared/types'

const row = (domain: GapRow['domain'], name: string, zones: string[] = []): GapRow => ({
  domain,
  name,
  kinds: [],
  count: 1,
  first: '',
  last: '',
  details: { samples: [], ...(zones.length ? { zones: { entries: zones.map((z) => ({ name: z, n: 1 })), distinct: zones.length } } : {}) }
})

const shape = (entries: GapEntry[]): string[] =>
  entries.map((e) => (e.kind === 'zone' ? `# ${e.zone} (${String(e.n)})` : e.kind === 'mob' ? `  ${e.mob} (${String(e.n)})` : `    ${e.row.name}`))

test('items sit under each zone and mob that dropped them; zones and mobs A to Z, the zone-less last', () => {
  const loot: LootEvent[] = [
    { ts: 1, item: 'Black Lizard Talon', source: 'a lizardman forager', zone: 'The Feerrott' },
    { ts: 2, item: 'Black Lizard Talon', source: 'a lizardman forager', zone: 'The Feerrott' },
    { ts: 3, item: 'Black Lizard Talon', source: 'a hatchling', zone: 'The Feerrott' },
    { ts: 4, item: 'Bone Chips', source: 'a skeleton', zone: 'Befallen' }
  ]
  const rows = [row('item', 'Black Lizard Talon'), row('item', 'Bone Chips'), row('item', 'Bought Thing', ['Freeport']), row('item', 'Nowhere')]
  assert.deepEqual(shape(groupGaps(rows, loot)), [
    '# Befallen (1)',
    '  a skeleton (1)',
    '    Bone Chips',
    '# Freeport (1)',
    '    Bought Thing',
    '# The Feerrott (1)',
    '  a hatchling (1)',
    '    Black Lizard Talon',
    '  a lizardman forager (1)',
    '    Black Lizard Talon',
    `# ${ZONE_NOT_SEEN} (1)`,
    '    Nowhere'
  ])
})

test('mobs sit under the zones they were seen in; ungrouped is the rows as they are', () => {
  const rows = [row('mob', 'Hoptor', ['Lower Guk']), row('mob', 'a gnoll', ['Blackburrow', 'Qeynos Hills'])]
  assert.deepEqual(shape(groupGaps(rows, [])), ['# Blackburrow (1)', '    a gnoll', '# Lower Guk (1)', '    Hoptor', '# Qeynos Hills (1)', '    a gnoll'])
  assert.deepEqual(rowEntries(rows).map((e) => e.key), ['Hoptor', 'a gnoll'])
  const keys = groupGaps(rows, []).map((e) => e.key)
  assert.equal(new Set(keys).size, keys.length, 'every entry has its own key')
})
