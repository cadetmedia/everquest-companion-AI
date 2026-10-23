// The Quest Journal read on the owner's own windows (tests/fixtures/shots/quest-journal-*.png, 2026-10-22),
// the turn-in an objective names, the quest items the owner kept pictures of (Solusek Petition, Plea
// to Freeport), and a held item that stays a row after it leaves the export (owner: "so it destroyed
// it from my need to update the wiki just because i turned it in?"). The text is read with the real
// OCR (tesseract.js, local).

import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { readJournalLines } from '../src/main/shot/journalLines.ts'
import { stopOcr } from '../src/main/shot/ocr.ts'
import { readItemShot, type ShotReaders } from '../src/main/shot/readItemShot.ts'
import { journalFacts, journalFactsByQuest, journalMissText, journalPlaces, journalStatus, journalTurnIn, readQuestJournal, snapPlace, splitLevels } from '../src/shared/questJournal.ts'
import { heldSightings, rememberedExtras, withHeldSeen, askedNames } from '../src/shared/gapHeldSeen.ts'
import { extraItemRows, guessedFacts, heldExtras } from '../src/shared/gapExtraItems.ts'
import type { GapHeld, HeldIndex } from '../src/shared/gapHeld.ts'
import type { QuestLog } from '../src/shared/gapQuests.ts'
import { readPng } from './shotPng.mts'

const SHOTS = join(import.meta.dirname, 'fixtures', 'shots')
const PLACES = journalPlaces(['Lake Nerius'])
const textOnly: ShotReaders = { index: () => Promise.resolve(null), cell: () => null, textures: () => [] }
const journal = async (file: string): Promise<ReturnType<typeof readQuestJournal>> => {
  const r = await readJournalLines(readPng(join(SHOTS, file)))
  return readQuestJournal(r.lines, r.shades, PLACES)
}

after(() => stopOcr())

test('SOMETHING FISHY: BOTH TASK ROWS, THE SELECTED ONE BY ITS GREY BAR, ITS OBJECTIVE AND DESCRIPTION', async () => {
  const j = await journal('quest-journal-something-fishy.png')
  assert.deepEqual(
    j.tasks.map((t) => [t.title.toLowerCase(), t.zone, t.minLevel, t.maxLevel, t.selected]),
    [
      ['alchemical solution', 'Lake Nerius', 1, 50, false],
      ['something fishy', 'Lake Nerius', 1, 50, true]
    ]
  )
  const fishy = journalFacts(j, 'Something Fishy')
  assert.equal(fishy?.objectives?.length, 1)
  assert.match(fishy?.objectives?.[0].text ?? '', /^Fish up \d Fresh Fish$/)
  assert.equal(fishy?.objectives?.[0].status, '0/3')
  assert.equal(fishy?.objectives?.[0].zone, 'Lake Nerius')
  assert.match(fishy?.description ?? '', /a fisherman in Lake .erius appears to have fallen on hard times/)
  // The other row gives its zone and levels, never the selected task's objectives.
  assert.deepEqual(journalFacts(j, 'Alchemical Solution'), { zone: 'Lake Nerius', minLevel: 1, maxLevel: 50 })
  assert.deepEqual(Object.keys(journalFactsByQuest(j)), ['alchemical solution', 'something fishy'])
})

test("WHAT`S GOING ON HERE?: SIX OBJECTIVES, ONE DONE, THEN THREE DONE IN THE LATER WINDOW", async () => {
  for (const [file, done] of [
    ['quest-journal-whats-going-on-here.png', 1],
    ['quest-journal-whats-going-on-here-three-done.png', 3]
  ] as const) {
    const f = journalFacts(await journal(file), 'What`s going on here?') ?? {}
    const objectives = f.objectives ?? []
    assert.deepEqual([f.zone, f.minLevel, f.maxLevel], ['Lake Nerius', 1, 50], file)
    assert.equal(objectives.length, 6, file)
    assert.equal(objectives.filter((o) => o.status === 'Done').length, done, file)
    assert.ok(objectives.some((o) => o.text.includes('The Great Zultor')), file)
    assert.match(f.description ?? '', /^Something feels off here in Lake/, file)
  }
})

test('THE JOURNAL FONT SLIPS: A ZONE SNAPS TO ITS PLACE, A STATUS TO n/m OR Done', () => {
  assert.equal(snapPlace('Lake Merius', PLACES), 'Lake Nerius')
  assert.equal(snapPlace('Banana', PLACES), undefined)
  assert.deepEqual(['01', '011', 'O11', 'oi', '0i3', '03', 'Done', 'Cone', 'a', '|'].map(journalStatus), ['0/1', '0/1', '0/1', '0/1', '0/3', '0/3', 'Done', 'Done', undefined, undefined])
})

/** The owner's Call for Aid journal (2026-10-22), as the coordinator read it out. */
const callForAid = [
  { text: 'Ask Dorian [who] he really is', status: 'Done', zone: 'Lake Nerius' },
  { text: 'Carry Dorian`s Plea to Sir Mollin in in North Freeport', status: '0/1', zone: 'North Freeport' },
  { text: 'Find Pishtian F`Lok in Neriak Commons and ensure he gets Dorian`s Appeal', status: '0/1', zone: 'Neriak - Commons' },
  { text: 'Travel though Lavastorm to the Temple of Solusek Ro. There, petition Lord Lyfyx on Dorian`s behalf', status: '0/1', zone: 'The Temple of Solusek Ro' }
]

test('AN OBJECTIVE THAT NAMES AN ITEM NAMES WHO IT GOES TO (A GUESS)', () => {
  assert.equal(journalTurnIn(callForAid, 'Solusek Petition'), 'Lord Lyfyx')
  assert.equal(journalTurnIn(callForAid, 'Plea to Freeport'), 'Sir Mollin')
  assert.equal(journalTurnIn(callForAid, 'Appeal of Neriak'), 'Pishtian F`Lok')
  assert.equal(journalTurnIn(callForAid, 'Rusty Dagger'), undefined)
})

test('SOLUSEK PETITION AND PLEA TO FREEPORT: THE WINDOW AND ITS LORE TAB, AS THE OWNER KEPT THEM', async () => {
  const read = async (file: string): Promise<Awaited<ReturnType<typeof readItemShot>>['read']> => (await readItemShot(readPng(join(SHOTS, file)), textOnly)).read
  const petition = await read('solusek-petition.png')
  assert.equal(petition.name, 'Solusek Petition')
  assert.equal(petition.statsblock, '\nNo Trade, Quest<br>\nSize: SMALL WT: 0.3<br>\nClass: NONE<br>\nRace: NONE<br>')
  assert.equal(petition.loreTab, true)
  assert.equal((await read('solusek-petition-lore.png')).lore, 'Request for assistance from the Temple of Solusek Ro')
  const plea = await read('plea-to-freeport.png')
  assert.equal(plea.name, 'Plea to Freeport')
  assert.equal(plea.statsblock, '\nNo Trade, Quest<br>\nSize: TINY WT: 0.1<br>\nClass: NONE<br>\nRace: NONE<br>')
  // Its Lore tab's word reads `“pore`: the window alone does not say it has one; the tab itself does.
  assert.equal(plea.loreTab, undefined)
  assert.equal((await read('plea-to-freeport-lore.png')).lore, 'Request for assistance from Freeport')
})

const holder = (name: string, at: string, slots: string[]): GapHeld => ({ total: 1, parts: [], exportedAt: at, exported: { name, slots } })
const index = (...h: GapHeld[]): HeldIndex => new Map(h.map((x) => [x.exported?.name.toLowerCase() ?? '', [x]]))

test('A HELD ITEM STAYS A ROW AFTER IT LEAVES THE EXPORT, UNTIL THE WIKI DATA KNOWS IT', () => {
  const unknown = new Set(['Plea to Freeport', 'Solusek Petition'])
  const exportA = index(holder('Plea to Freeport', '2026-10-23T07:20:00.000Z', ['General 6-Slot2']), holder('Solusek Petition', '2026-10-23T07:20:00.000Z', ['General 6-Slot3']))
  const seenA = withHeldSeen([], heldSightings(exportA, unknown, 'Drywrought'))
  assert.equal(seenA.length, 2)
  // Export B: the Plea was turned in to Sir Mollin.
  const exportB = index(holder('Solusek Petition', '2026-10-23T07:29:31.000Z', ['General 6-Slot3']))
  const seenB = withHeldSeen(seenA, heldSightings(exportB, unknown, 'Drywrought'))
  assert.equal(seenB.find((s) => s.name === 'Solusek Petition')?.first, '2026-10-23T07:20:00.000Z', 'the first export is kept')
  assert.equal(seenB.find((s) => s.name === 'Solusek Petition')?.last, '2026-10-23T07:29:31.000Z')
  assert.match(askedNames(exportB, [], seenB, { me: 'Drywrought', all: false }), /Plea to Freeport/, 'still asked about')
  const gone = rememberedExtras(seenB, exportB, unknown, 'Drywrought')
  assert.deepEqual(gone.map((e) => e.name), ['Plea to Freeport'])
  assert.match(gone[0].samples[0], /^Drywrought: last held \d{4}-\d\d-\d\d \d\d:\d\d:\d\d in General 6-Slot2; not in the latest inventory export/)
  const rows = extraItemRows([...heldExtras(exportB, unknown), ...gone], [])
  assert.deepEqual(rows.map((r) => [r.name, r.kinds]), [['Solusek Petition', ['held']], ['Plea to Freeport', ['held']]])
  // Another character's item is not this one's row; with All characters it is.
  assert.deepEqual(rememberedExtras(seenB, exportB, unknown, 'Malkil'), [])
  // After a data refresh the wiki has a page: not unknown, no row.
  assert.deepEqual(rememberedExtras(seenB, exportB, new Set(['Solusek Petition']), 'Drywrought'), [])
})

/** Call for Aid as the engine serves it: Dorian G`Wyn's step at 23:17:17 ("...petition for aid..."). */
const callLog: QuestLog = {
  giver: 'Nikko Canti',
  zone: 'Lake Nerius',
  npcs: ['Nikko Canti', 'Dorian G`Wyn'],
  reruns: 0,
  steps: [
    { at: '2026-10-22 23:16:54', kind: 'assigned', npc: 'Nikko Canti', zone: 'Lake Nerius' },
    { at: '2026-10-22 23:17:17', kind: 'updated', npc: 'Dorian G`Wyn', zone: 'Lake Nerius', talk: [{ who: 'Dorian G`Wyn', text: "And so I've been quietly searching for the right contacts to petition for aid." }] }
  ]
}

test('A HELD QUEST ITEM CARRIES ITS GUESSED GIVER AND TURN-IN, MARKED AS GUESSES', () => {
  // The export's own instant, local time: 23:29:31 on the owner's clock is after the 23:17:17 step.
  const first = new Date(2026, 9, 22, 23, 29, 31).toISOString()
  const g = { quests: [{ name: 'Call for Aid', log: callLog }], journals: [{ objectives: callForAid }] }
  assert.deepEqual(guessedFacts('Solusek Petition', first, g), {
    givenBy: { npc: 'Dorian G`Wyn', zone: 'Lake Nerius', guess: true, quest: 'Call for Aid' },
    turnInGuess: { npc: 'Lord Lyfyx', quest: 'Call for Aid' }
  })
  assert.equal(guessedFacts('Rusty Dagger', first, g), undefined)
  const unknown = new Set(['Solusek Petition'])
  const rows = extraItemRows(heldExtras(index(holder('Solusek Petition', first, ['General 6-Slot3'])), unknown), [], g)
  assert.equal((rows[0] as unknown as { questFacts: { givenBy: { guess: boolean } } }).questFacts.givenBy.guess, true)
})

/**
 * The owner's window that errored (2026-10-23): one task, zone ALL, one objective done anywhere, six
 * `? ? ?` rows, no description. Lines shaped as the real OCR reads the other three windows (the same
 * heading slips; the grey bar's shade 128, the rock's 13), with the two misreads that refused it:
 * the `Q` run into the title, and the zone run into the levels.
 */
const tragic = (row: string): { lines: string[]; shades: number[] } => {
  const lines = [
    'Cuest Journal ¥1 3A',
    'Current Tasks Shared Task Quest History',
    'Tasks 1/29 Request Timer: 00:11',
    'Task Tile Time Left Zone Min Max',
    row,
    'Task Progression Preview Reward Monster Select REMOVE',
    'Objective Instructions Status Zone',
    "Make contact with Ollix's mother. 01 ALL",
    ...Array.from({ length: 6 }, () => '? ? ? ? ? ?')
  ]
  return { lines, shades: lines.map((l) => (l === row ? 128 : 13)) }
}

test('THE TRAGIC TALE OF HOUSE EVERLING: ZONE ALL, SIX HIDDEN STEPS, AND THE ROW OCR RUNS TOGETHER', () => {
  for (const row of [
    '[4 Q The Tragic Tale of House Everling Unlimited ALL 1 50',
    '[4 QThe Tragic Tale of House Everling Unlimited ALL 1 50',
    '[4 Q The Tragic Tale of House Everling Unlimited ALL150',
    '[4 QThe Tragic Tale of House Everling Unlimited ALL150 t',
    // The time left misread too: the grey bar's line is the task.
    '[4 QThe Tragic Tale of House Everling Unlirnited ALL150'
  ]) {
    const w = tragic(row)
    const j = readQuestJournal(w.lines, w.shades, PLACES)
    assert.deepEqual(j.tasks, [{ title: 'The Tragic Tale of House Everling', minLevel: 1, maxLevel: 50, selected: true }], row)
    assert.deepEqual(journalFacts(j, 'The Tragic Tale of House Everling'), {
      minLevel: 1,
      maxLevel: 50,
      objectives: [{ text: "Make contact with Ollix's mother.", status: '0/1' }],
      hiddenSteps: 6
    }, row)
  }
})

test('A ZONE AND ITS LEVELS READ AS ONE SPLIT ONLY WHEN ONE SPLIT FITS', () => {
  assert.deepEqual(splitLevels('150'), { min: 1, max: 50 })
  assert.deepEqual(splitLevels('1050'), { min: 10, max: 50 })
  assert.equal(splitLevels('1125'), undefined) // 1-125 or 11-25
  assert.equal(splitLevels('900'), undefined)
})

test('A READ WITH NO TASK ROW SAYS WHAT IT READ, SHORT', () => {
  const w = tragic('[4 Q')
  assert.equal(readQuestJournal(w.lines, w.lines.map(() => 13), PLACES).tasks.length, 0)
  assert.equal(journalMissText(w.lines), 'No task row found. Read: "Task Progression Preview Reward Monster Select REM…", "Objective Instructions Status Zone"')
  assert.equal(journalMissText(['Inventory', 'Bags']), 'No task list found. Read: "Inventory", "Bags"')
  assert.equal(journalMissText([]), 'No task list found: paste the whole Quest Journal window.')
})
