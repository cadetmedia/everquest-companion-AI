// achievementCounters.test.mts — the kill counters as the Achievements list picks them: a finished
// line keeps the id it had while open, and the Checked filter finds what is checked.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EVERYTHING,
  bookIndex,
  counterIdOf,
  counterIds,
  finishedCounters,
  visibleSections,
  type BookFilters
} from '../src/shared/achievements/bookRows'
import type { BookComponent } from '../src/shared/outputs/achievementBook'

const line = (text: string, more: Partial<BookComponent> = {}): BookComponent => ({
  line: text,
  done: false,
  ...more
})
const SHOW_ALL: BookFilters = {
  scope: EVERYTHING,
  query: '',
  open: true,
  complete: true,
  sort: 'game',
  here: null
}

test('a finished kill line is still a counter, under the id it had while open', () => {
  const skill = { category: 'Slayer: Skill', family: 'Slayer', name: 'Skill', achievements: [] }
  const general = { category: 'Slayer: General', family: 'Slayer', name: 'General', achievements: [] }
  const open = { name: 'Amazing!', done: false, components: [line('Minotaurs and Tizmak.', { have: 2, need: 100 })] }
  const done = { name: 'Amazing!', done: true, components: [line('Minotaurs and Tizmak.', { done: true })] }
  assert.equal(counterIdOf(skill, done, done.components[0]), counterIdOf(skill, open, open.components[0]))
  const quoted = line('Complete the achievement "Amazing!"', { done: true })
  assert.equal(counterIdOf(general, done, quoted), null)
  assert.equal(counterIdOf(skill, done, quoted), null)
  const book = { groups: [{ ...skill, achievements: [open, done] }, { ...general, achievements: [{ ...done, components: [quoted] }] }] }
  assert.deepEqual(
    finishedCounters(book).map((c) => [c.achievement, c.label, c.need - c.have]),
    [['Amazing!', 'Minotaurs and Tizmak.', 0]]
  )
})

test('the Checked filter keeps only rows with a checked counter, open or complete', () => {
  const skill = { category: 'Slayer: Skill', family: 'Slayer', name: 'Skill', achievements: [] }
  const amazing = { name: 'Amazing!', done: true, components: [line('Minotaurs and Tizmak.', { done: true })] }
  const bats = { name: 'Bat Country!', done: false, components: [line('Bats.', { have: 4, need: 100 })] }
  const book = { groups: [{ ...skill, achievements: [amazing, bats] }] }
  const picked = new Set(counterIds(skill, amazing))
  const shown = (f: BookFilters): string[] =>
    visibleSections(book, bookIndex(book), f).flatMap((s) => s.achievements.map((a) => a.name))
  assert.deepEqual(shown({ ...SHOW_ALL, picked }), ['Amazing!'])
  assert.deepEqual(shown({ ...SHOW_ALL, complete: false, picked }), ['Amazing!'], 'checked wins over Show')
  assert.deepEqual(shown({ ...SHOW_ALL, picked: null }), ['Amazing!', 'Bat Country!'])
})
