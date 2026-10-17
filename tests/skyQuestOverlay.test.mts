// The Sky quest overlay's payload (shared/skyQuestOverlay.ts): the order its rows are drawn in, and
// what the overlay makes of whatever it finds under the storage key.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_SKY_OVERLAY,
  orderSkyOverlayRows,
  parseSkyOverlay,
  type SkyOverlayRow
} from '../src/shared/skyQuestOverlay'
import { applySkyQuestsKnob } from '../src/main/storeSkyQuestsKnob'

function row(className: string, name: string, ready: boolean): SkyOverlayRow {
  return { key: `${className}::${name}`, className, name, items: [{ name: 'Item', have: ready ? 1 : 0, need: 1 }], ready }
}

test('ready quests come first, then by class and quest name', () => {
  const rows = [
    row('Wizard', 'Wizard Test of Mind', false),
    row('Bard', 'Bard Test of Tone', false),
    row('Wizard', 'Wizard Test of Air', true),
    row('Bard', 'Bard Test of Song', true),
    row('Bard', 'Bard Test of Pitch', false)
  ]
  assert.deepEqual(
    orderSkyOverlayRows(rows).map((r) => r.name),
    ['Bard Test of Song', 'Wizard Test of Air', 'Bard Test of Pitch', 'Bard Test of Tone', 'Wizard Test of Mind']
  )
})

test('a written payload reads back as it was written', () => {
  const payload = {
    loaded: true,
    rows: [
      {
        key: 'Bard::Bard Test of Tone',
        className: 'Bard',
        name: 'Bard Test of Tone',
        reward: 'Mask of Song',
        giver: 'Cilin Spellsinger',
        items: [
          { name: 'Light Woolen Mask', have: 1, need: 1, iconId: 1234 },
          { name: 'Sky Pearl', have: 1, need: 3 }
        ],
        ready: false
      }
    ]
  }
  assert.deepEqual(parseSkyOverlay(JSON.stringify(payload)), payload)
})

test('nothing stored, or nothing readable, is the empty payload', () => {
  for (const raw of [null, '', 'not json', '42', 'null', '[]']) {
    assert.deepEqual(parseSkyOverlay(raw), EMPTY_SKY_OVERLAY, String(raw))
  }
})

test('a row missing its key, class or name is dropped, and an item needs a name', () => {
  const raw = JSON.stringify({
    loaded: true,
    rows: [
      { className: 'Bard', name: 'No key', items: [] },
      { key: 'Bard::x', name: 'No class', items: [] },
      {
        key: 'Cleric::Cleric Test of Faith',
        className: 'Cleric',
        name: 'Cleric Test of Faith',
        reward: 42,
        items: [{ have: 1, need: 1 }, { name: 'Sky Pearl', have: -2, need: 0, iconId: '../x' }, 'junk'],
        ready: 'yes'
      }
    ]
  })
  const p = parseSkyOverlay(raw)
  assert.equal(p.rows.length, 1)
  const [r] = p.rows
  assert.equal(r.reward, undefined)
  assert.equal(r.ready, false, 'only a real true is ready')
  assert.deepEqual(r.items, [{ name: 'Sky Pearl', have: 0, need: 1 }], 'an icon id that is not a positive integer is dropped')
})

test('the icons switch is kept only on the Sky quest overlay, and only as a real boolean', () => {
  const base = { open: true, locked: false, bgAlpha: 0.72, drill: null }
  const off = { ...base, skyIcons: false }
  applySkyQuestsKnob('skyQuests', off)
  assert.equal(off.skyIcons, false)
  const junk = { ...base, skyIcons: 'no' as unknown as boolean }
  applySkyQuestsKnob('skyQuests', junk)
  assert.equal('skyIcons' in junk, false, 'a non-boolean is dropped, so the overlay reads it as on')
  const stray = { ...base, skyIcons: false }
  applySkyQuestsKnob('xp', stray)
  assert.equal('skyIcons' in stray, false, 'another window does not keep it')
})
