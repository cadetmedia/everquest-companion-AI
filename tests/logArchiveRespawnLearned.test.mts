// logArchiveRespawnLearned.test.mts — the learned respawn evidence joins across archived logs (owner,
// 2026-10-25: the wiki respawn time from every kill, archived months included; Lasna Cheroon's gaps
// below are from the owner's Castle of Mistmoore 4 camps).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeRespawn } from '../src/shared/logArchive/mergeRespawn'

const MM = 'The Castle of Mistmoore 4 (Refined)'
const lasna = (zone: string, gaps: number[]) => ({ id: `${zone.toLowerCase()}::lasna cheroon`, key: 'lasna cheroon', display: 'Lasna Cheroon', zone, gapsMs: gaps })
const snap = (zone: string, learned?: unknown[]) => ({ v: 4, zone, rows: [], recent: [], ...(learned === undefined ? {} : { learned }) })
interface WithLearned {
  learned?: { id: string; zone: string; gapsMs: number[] }[]
}

test("ONE MOB'S GAPS FROM TWO LOGS ARE ONE LIST, NEWEST FIRST", () => {
  const older = snap(MM, [lasna(MM, [528_000, 529_000, 527_000])])
  const newer = snap(MM, [lasna(MM, [530_000, 531_000, 529_000])])
  const merged = mergeRespawn(older, newer) as WithLearned | null
  assert.deepEqual(merged?.learned?.map((l) => l.gapsMs), [[530_000, 531_000, 529_000, 528_000, 529_000, 527_000]])
})

test('THE ENGINE CAP OF 50 GAPS HOLDS ACROSS THE JOIN, KEEPING THE NEWEST', () => {
  const older = snap(MM, [lasna(MM, Array.from({ length: 50 }, () => 527_000))])
  const newer = snap(MM, [lasna(MM, [531_000, 531_000, 531_000])])
  const gaps = (mergeRespawn(older, newer) as WithLearned).learned?.[0].gapsMs ?? []
  assert.equal(gaps.length, 50)
  assert.deepEqual(gaps.slice(0, 4), [531_000, 531_000, 531_000, 527_000])
})

test('EVIDENCE FILED BEFORE THE FRESH LOG HAD A ZONE LINE JOINS THE ZONE THE ARCHIVE ENDED IN', () => {
  const older = snap(MM, [lasna(MM, [528_000, 528_000, 528_000])])
  const newer = snap('', [lasna('', [529_000, 529_000, 529_000])])
  const learned = (mergeRespawn(older, newer) as WithLearned).learned ?? []
  assert.equal(learned.length, 1)
  assert.equal(learned[0].zone, MM)
  assert.equal(learned[0].gapsMs.length, 6)
})

test('AN ARCHIVE OLDER THAN THE FIELD ADDS NOTHING AND BREAKS NOTHING', () => {
  const newer = snap(MM, [lasna(MM, [530_000, 530_000, 530_000])])
  assert.deepEqual((mergeRespawn(snap(MM), newer) as WithLearned).learned?.[0].gapsMs, [530_000, 530_000, 530_000])
  assert.equal(Object.hasOwn(mergeRespawn(snap(MM), snap(MM)) ?? {}, 'learned'), false)
})

test('A MALFORMED ENTRY IS DROPPED, AS THE GAPS TAB DROPS IT: NO ID, OR A GAP THAT IS NOT A FINITE NUMBER', () => {
  const good = lasna(MM, [530_000, 530_000, 530_000])
  const { id: _id, ...noId } = lasna('Elsewhere', [530_000])
  const bad = [noId, { ...lasna('Zone B', [530_000]), gapsMs: [Number.NaN] }, { ...lasna('Zone C', [530_000]), gapsMs: [Infinity] }, { ...lasna('Zone D', [530_000]), gapsMs: ['530000'] }, null]
  const learned = (mergeRespawn(snap(MM, bad), snap(MM, [good])) as WithLearned).learned ?? []
  assert.deepEqual(learned.map((l) => l.id), [good.id])
})

test('THE JOIN KEEPS THE ENGINE CAP OF 1,000 MOBS, NEWEST LEARNED FIRST, HOWEVER MANY ARCHIVES', () => {
  const mobs = (zone: string, n: number) => Array.from({ length: n }, (_, i) => ({ ...lasna(zone, [530_000]), key: `mob ${String(i)}`, id: `${zone.toLowerCase()}::mob ${String(i)}` }))
  const older = snap('Old Zone', mobs('Old Zone', 1_000))
  const newer = snap(MM, mobs(MM, 600))
  const learned = (mergeRespawn(older, newer) as WithLearned).learned ?? []
  assert.equal(learned.length, 1_000)
  assert.equal(learned[0].zone, MM, "the live log's mobs first")
  assert.equal(learned.filter((l) => l.zone === MM).length, 600)
  assert.equal(learned[999].id, 'old zone::mob 399', "the archive's newest 400 fill the rest")
})
