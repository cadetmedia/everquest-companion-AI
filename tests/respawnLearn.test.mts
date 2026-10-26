// respawnLearn.test.mts — the wiki respawn time from the player's own kills (owner, 2026-10-25), and the
// Respawns rows and Copy text built on it. The gaps are the owner's own, from the Castle of Mistmoore 4
// camps in the 2026-08-12..10-06 archive, as the engine learned them (seconds here, ms in the data).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { constantRespawn, learnedOf, wikiRespawnText, type LearnedEvidence } from '../src/shared/respawnLearn'
import { respawnGaps, withLearnedRespawn, withRespawnField } from '../src/shared/gapRespawns'
import { wikiPageText } from '../src/shared/wikiPage'
import { parseWikiRespawn } from '../src/shared/respawnWiki'
import type { GapRow } from '../src/shared/gaps'

const s = (secs: number[]): number[] => secs.map((x) => x * 1000)
const MM = 'The Castle of Mistmoore 4 (Refined)'
const LASNA = s([527, 528, 528, 526, 528, 527, 530, 530, 529, 530, 530, 531, 530, 530, 528, 530, 528, 527, 528, 528, 527, 529, 528, 527, 527, 530, 530, 529, 529, 529, 530, 528, 531, 531, 531, 531, 531, 531, 531, 530, 530, 530, 531, 531, 531, 532, 532, 1047, 529, 531])
const XICOTL = s([293, 293, 436, 426, 463, 293, 370, 295, 327, 294, 409, 296, 293, 295, 294, 293, 295, 295, 515, 513, 294, 496, 293, 511, 293, 295, 295, 509, 471, 295, 293, 482, 467, 295, 515, 478, 464, 604, 296, 528, 544, 567, 296, 529, 295, 296, 295, 300, 296, 496])
const ENYNTI = s([558, 956, 1010, 656, 676, 550, 554, 669, 532, 533, 530, 618, 531, 544, 599, 543, 559, 608, 929, 881, 530, 2035, 529, 2272, 1921, 542, 530, 1350, 1037, 1353, 2764])
const USHER = s([83, 78, 229, 62, 60, 87, 60, 60, 104, 170, 61, 171, 96, 218, 77, 202, 60, 135, 60, 131, 67, 103, 98, 66, 63, 60, 99, 69, 95, 66, 95, 88, 88, 76, 97, 60, 94, 73, 76, 66, 63, 168, 60, 77, 78, 60, 167, 99, 72, 98])

const evidence = (display: string, gapsMs: number[], wiki?: { text: string; ms?: number }): LearnedEvidence => ({
  id: `${MM.toLowerCase()}::${display.toLowerCase()}`,
  key: display.toLowerCase(),
  display,
  zone: MM,
  gapsMs,
  ...(wiki === undefined ? {} : { wikiText: wiki.text, ...(wiki.ms === undefined ? {} : { wikiMs: wiki.ms }), wikiPage: display })
})

test('THE CONSTANT THE GAPS AGREE ON: LASNA CHEROON IS THE WIKI\'S 8:50, XICOTL 4:55 WHATEVER THE LATE RE-KILLS', () => {
  const lasna = constantRespawn(LASNA, 'Lasna Cheroon')
  assert.equal(lasna?.ms, 530_000)
  assert.equal(lasna?.agree, 49, 'the 1047 s straggler is the one gap out')
  assert.equal(lasna?.rule, 'within25')
  const xicotl = constantRespawn(XICOTL, 'Xicotl')
  assert.equal(wikiRespawnText(xicotl?.ms ?? 0), '4:55', 'a plain mean would say 6:18')
  // Enynti's page says 22 minutes; its spawn-point cycle is the same 8:50, the long gaps are cycles it did not take.
  assert.equal(wikiRespawnText(constantRespawn(ENYNTI, 'Enynti')?.ms ?? 0), '8:50')
})

test("THE OWNER'S RULES: 3 WITHIN 25 S, 5 WITHIN 20 S, ELSE 10 IN ALL; FEWER SAYS NOTHING", () => {
  assert.equal(constantRespawn(s([600, 610, 640]), 'Mob')?.rule, 'within25')
  assert.equal(constantRespawn(s([600, 700]), 'Mob'), null, 'two gaps')
  assert.equal(constantRespawn(s([600, 660, 720, 780, 840]), 'Mob'), null, 'five that do not agree')
  const ten = constantRespawn(s([600, 660, 720, 780, 840, 900, 960, 1020, 1080, 5000]), 'Mob')
  assert.equal(ten?.rule, 'ten')
  assert.equal(ten?.agree, 9, 'the 5000 s outlier is out')
  assert.equal(ten?.ms, 840_000, 'the median of the nine left, not the lowest gap')
  // An even count left: the middle two averaged, to the second.
  assert.equal(constantRespawn(s([600, 660, 720, 780, 840, 900, 960, 1020, 1080, 1140, 6000]), 'Mob')?.ms, 870_000)
})

test('A COMMON NAME CLUSTERED AT THE ONE-MINUTE FLOOR IS TWO SPAWNS SHARING IT, NOT A RESPAWN', () => {
  assert.equal(constantRespawn(USHER, 'A deathly usher'), null)
  // The same gaps on a proper name would be read: the guard is for names with an article.
  assert.notEqual(constantRespawn(USHER, 'Usher Prime'), null)
})

test("THE WIKI'S OWN SHAPES, WHICH THE FLOOR READER READS BACK", () => {
  assert.equal(wikiRespawnText(530_000), '8:50')
  assert.equal(wikiRespawnText(3_900_000), '1 hour 5 minutes')
  assert.equal(wikiRespawnText(7_200_000), '2 hours')
  for (const ms of [530_000, 295_000, 3_900_000, 7_230_000]) assert.equal(parseWikiRespawn(wikiRespawnText(ms)), ms / 1000)
})

const CATALOG = [
  { name: 'Lasna Cheroon', page: 'Lasna Cheroon' },
  { name: 'Enynti', page: 'Enynti' },
  { name: 'Xicotl', page: 'Xicotl' }
]

test('A RESPAWNS ROW FOR A PAGE THAT STATES NONE OR DISAGREES; NONE FOR ONE THAT AGREES OR HAS NO PAGE', () => {
  const learned = [
    evidence('Lasna Cheroon', LASNA, { text: '8:50', ms: 530_000 }),
    evidence('Enynti', ENYNTI, { text: '22 minutes', ms: 1_320_000 }),
    evidence('Xicotl', XICOTL),
    evidence('Princess Cherista', LASNA)
  ]
  const rows = respawnGaps(learned, CATALOG)
  assert.deepEqual(rows.map((r) => [r.name, r.respawn?.text, r.respawn?.pageSays ?? null]), [
    ['Xicotl', '4:55', null],
    ['Enynti', '8:50', '22 minutes']
  ])
  assert.ok(rows.every((r) => r.domain === 'respawn' && r.page !== undefined))
  assert.match(rows[1].details.samples[0] ?? '', /^Your kills: 8:50 \(\d+ of 31 gaps within 25 seconds of each other\); the page says 22 minutes\.$/)
  // Copy gives the field line the page takes.
  assert.equal(wikiPageText(rows[0], [], {}), '| respawn_time      = 4:55\n')
})

test('A PAGE WHOSE RESPAWN IS NOT A DURATION IS ITS OWN STATEMENT: NO ROW; A PLACEHOLDER STATES NOTHING: A ROW', () => {
  const said = (text: string): string[] => respawnGaps([evidence('Xicotl', XICOTL, { text })], CATALOG).map((r) => r.respawn?.pageSays ?? '')
  // respawns.json rows with no seconds, verbatim.
  for (const text of ['Kaesora: 18:00, Temple of Droga: 20:30', 'Triggered', '[[Triggered]]', '6-8 hours', 'Never respawns, only appears in raid instances']) {
    assert.deepEqual(said(text), [], text)
  }
  for (const text of ['?', '??', 'Unknown', '']) assert.deepEqual(said(text), [text], `"${text}"`)
})

test("A NEW MOB PAGE TAKES THE RESPAWN ITS KILLS AGREE ON IN ITS BLANK FIELD", () => {
  const row: GapRow = { domain: 'mob', name: 'Princess Cherista', kinds: ['killed'], count: 50, first: '', last: '', details: { samples: [] } }
  const withIt = withLearnedRespawn(row, [evidence('Princess Cherista', LASNA)])
  assert.equal(withIt.respawn?.text, '8:50')
  const page = '{{Namedmobpage\n| respawn_time      = \n}}\n'
  assert.equal(withRespawnField(page, withIt), '{{Namedmobpage\n| respawn_time      = 8:50\n}}\n')
  assert.equal(withRespawnField(page, row), page, 'no evidence, the field stays blank')
})

test('THE EVIDENCE IS READ BY SHAPE: A SNAPSHOT WITHOUT IT, OR A MALFORMED ENTRY, GIVES NOTHING', () => {
  assert.deepEqual(learnedOf({ v: 4, rows: [] }), [])
  assert.deepEqual(learnedOf(null), [])
  assert.equal(learnedOf({ learned: [{ key: 'x', display: 'X', zone: 'Z', gapsMs: ['no'] }, evidence('Xicotl', XICOTL)] }).length, 1)
})
