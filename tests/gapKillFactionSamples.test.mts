// The kill-faction proof lines, served apart from the Gaps snapshot (perf review 2026-10-20): put
// back for what is kept on disk, left out of what is served, joined across the archive when asked.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  factionPairOf,
  factionRowKeys,
  gapsWithSamples,
  joinedKillFactionSamples,
  killFactionKey,
  rowSamples,
  withKillFactionSamples,
  withRowSamples,
  withoutKillFactionSamples
} from '../src/shared/gapKillFactionSamples'
import { factionGaps } from '../src/shared/gapFactions'
import { mergeGaps } from '../src/shared/logArchive/mergeGaps'
import type { GapRow } from '../src/shared/gaps'

const kill = (n: number): string[] => [`[Mon Oct 19 23:5${n}:00 2026] Your faction standing with Grobb Merchants has been adjusted by -1.`, `[Mon Oct 19 23:5${n}:00 2026] You have slain a troll slayer!`]
const pair = { mob: 'a troll slayer', faction: 'Grobb Merchants', n: 1, zone: 'Grobb', adjust: -1, raised: false }
const slim = { rows: [], totals: {}, seen: {}, killFactions: [pair] }

test('a kept state gets its lines back; a pair that carries lines keeps them; no module, no change', async () => {
  const proofs = [{ mob: 'A Troll Slayer', faction: 'grobb merchants', samples: kill(1) }]
  assert.deepEqual(withKillFactionSamples(slim, proofs), { ...slim, killFactions: [{ ...pair, samples: kill(1) }] })
  const carried = { ...slim, killFactions: [{ ...pair, samples: kill(2) }] }
  assert.deepEqual(withKillFactionSamples(carried, proofs), carried)
  assert.equal(withKillFactionSamples(slim, []), slim)
  assert.equal(withKillFactionSamples(null, proofs), null)
  assert.equal(await gapsWithSamples(slim, () => Promise.reject(new Error('notFound'))), slim, 'an engine without the module')
})

test('the served state drops the lines an archive brought back, and is the same object when there are none', () => {
  assert.equal(withoutKillFactionSamples(slim), slim)
  const merged = mergeGaps({ ...slim, killFactions: [{ ...pair, samples: kill(1) }] }, slim) as typeof slim
  assert.deepEqual(withoutKillFactionSamples(merged), { ...merged, killFactions: [{ ...pair, n: 2 }] })
  // The history merge serves one object per seq: it is stripped once, not copied on every serve.
  assert.equal(withoutKillFactionSamples(merged), withoutKillFactionSamples(merged))
  assert.equal(withoutKillFactionSamples(null), null)
})

test('asked lines: the archive oldest first, then the live module, the last three kills, only the pairs asked', () => {
  const key = killFactionKey('a troll slayer', 'Grobb Merchants')
  const archived = [
    { ...slim, killFactions: [{ ...pair, samples: [...kill(1), ...kill(2)] }, { ...pair, faction: 'Other', samples: kill(3) }] },
    { ...slim, killFactions: [{ ...pair, samples: kill(4) }] }
  ]
  const live = [{ mob: 'a troll slayer', faction: 'Grobb Merchants', samples: kill(5) }]
  assert.deepEqual(joinedKillFactionSamples(archived, live, new Set([key])), { [key]: [...kill(2), ...kill(4), ...kill(5)] })
  assert.deepEqual(joinedKillFactionSamples([], null, new Set([key])), {})
})

test('a faction row names its pair; its lines are the asked ones, then the ones it carries, each once', () => {
  const [row] = factionGaps([{ ...pair, mob: 'a (very) odd mob', samples: kill(9) }], [])
  assert.deepEqual(factionPairOf(row), { mob: 'a (very) odd mob', faction: 'Grobb Merchants' })
  const key = killFactionKey('a (very) odd mob', 'Grobb Merchants')
  assert.deepEqual(factionRowKeys([row]), [key])
  assert.deepEqual(rowSamples(row, { [key]: kill(8) }), [...kill(8), ...kill(9)].slice(-6))
  assert.deepEqual(rowSamples(row, { [key]: kill(9) }), kill(9), 'never twice')
  assert.equal(rowSamples(row, undefined), row.details.samples)
  const item: GapRow = { domain: 'item', name: 'Bread', kinds: [], count: 1, first: '', last: '', details: { samples: ['x'] } }
  assert.equal(factionPairOf(item), null)
  const [same, filled] = withRowSamples([item, { ...row, details: { ...row.details, samples: [] } }], { [key]: kill(7) })
  assert.equal(same, item)
  assert.deepEqual(filled.details.samples, kill(7))
})
