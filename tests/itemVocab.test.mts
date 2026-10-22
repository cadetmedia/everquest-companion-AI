// The statsblock's vocabulary (src/shared/itemVocab.ts; owner rulings 2026-10-21): values spelled as
// the wiki writes them, OCR's slips snapped only within reach of exactly one known value, and a value
// outside the lists kept as read and flagged ("the known-values list is a GUIDE, not a law").

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CLASS_CODES, codeWords, deityText, FLAG_WORDS, SIZES, slotWord, snap } from '../src/shared/itemVocab.ts'
import { readItemWindow } from '../src/shared/itemWindow.ts'

test('A KNOWN VALUE IS SPELLED THE WIKI WAY; A SLIP WITHIN REACH OF ONE VALUE SNAPS, NOTED; ANYTHING ELSE IS KEPT AND FLAGGED', () => {
  assert.deepEqual(snap('medium', SIZES, 'Size'), { value: 'MEDIUM' })
  const slip = snap('MEDlUM', SIZES, 'Size')
  assert.equal(slip.value, 'MEDIUM')
  assert.match(slip.note ?? '', /taken as MEDIUM/)
  assert.deepEqual(snap('No Trde', FLAG_WORDS, 'Flag').value, 'No Trade')
  // 8+ letters: two slips are within reach
  assert.equal(snap('Attunabel', FLAG_WORDS, 'Flag').value, 'Attunable')
  // a new value is kept as read, never forced, and flagged
  const fresh = snap('Soulbound', FLAG_WORDS, 'Flag')
  assert.equal(fresh.value, 'Soulbound')
  assert.match(fresh.note ?? '', /kept as read/)
})

test('SLOTS: EAR, WRIST, FINGER, SHOULDERS FROM THE WINDOW\'S WORDS', () => {
  assert.equal(slotWord('Ears').value, 'EAR')
  assert.equal(slotWord('Wrists').value, 'WRIST')
  assert.equal(slotWord('Fingers').value, 'FINGER')
  assert.equal(slotWord('Shoulder').value, 'SHOULDERS')
  assert.equal(slotWord('Power Source').value, 'POWER SOURCE')
})

test('CLASS AND RACE: CODES AND ALL/NONE IN CAPS, except IN LOWER CASE; A NEW CODE IS KEPT AND FLAGGED', () => {
  assert.deepEqual(codeWords(['ALL', 'EXCEPT', 'nec', 'WIZ'], CLASS_CODES, 'Class'), { value: 'ALL except NEC WIZ', notes: [] })
  assert.deepEqual(codeWords(['None'], CLASS_CODES, 'Class'), { value: 'NONE', notes: [] })
  const dhe = codeWords(['DHE'], ['HUM'], 'Race')
  assert.equal(dhe.value, 'DHE')
  assert.equal(dhe.notes.length, 1)
})

test('DEITY: FULL NAMES IN THE PAGES\' SPELLING; AN UNKNOWN GOD IS FLAGGED', () => {
  assert.deepEqual(deityText('Cazic Thule'), { value: 'Cazic-Thule' })
  assert.deepEqual(deityText('the tribunal / Rallos Zek'), { value: 'The Tribunal / Rallos Zek' })
  assert.ok(deityText('Saryrn').note !== undefined)
})

test('THE WINDOW UNDER D1: TITLE CASE FLAGS, SIZE BEFORE WT, EXPENDABLE ON THE CHARGES LINE, NOTES FOR THE PLAYER', () => {
  const r = readItemWindow(['Potion of Testing', 'Expendable, No Trade', 'Class: ALL except NEC', 'Race: ALL', 'Size: SMALl', 'Weight: 0.5', 'Charges: 3'])
  assert.deepEqual(r.statsblock.split('\n').filter(Boolean), ['No Trade<br>', 'EXPENDABLE Charges: 3<br>', 'Size: SMALL WT: 0.5<br>', 'Class: ALL except NEC<br>', 'Race: ALL<br>'])
  assert.ok(r.checks === undefined || r.checks.every((c) => !/Size/.test(c)), 'SMALl folds without a note (case only)')
  const odd = readItemWindow(['Odd Thing', 'Soulbound, No Trade', 'Class: ALL', 'Race: ALL', 'Size: HUGE', 'Weight: 1.0'])
  assert.ok(odd.statsblock.includes('Soulbound, No Trade<br>') || odd.statsblock.includes('No Trade<br>'), odd.statsblock)
  assert.ok((odd.checks ?? []).some((c) => /Size "HUGE"/.test(c)), JSON.stringify(odd.checks))
})
