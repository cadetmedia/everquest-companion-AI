// The spell display window, as OCR would read it, into the Spell Page fields (src/shared/spellWindow.ts;
// owner, 2026-10-21: "if they have spells up lets do it"), and what the install's files add on their own
// (src/main/gapSpellFacts.ts: the icon, field 76, and the description, dbstr_us.txt type 6). No real
// spell-window screenshot was on hand: the window text below is synthetic, in the client's own label
// strings (eqstr_us.txt), with OCR's usual slips put in by hand.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { descriptionsById, spellFactsFrom } from '../src/main/gapSpellFacts.ts'
import { fileDescription, fillTemplate, isSpellWindow, readSpellWindow, spellPageValues } from '../src/shared/spellWindow.ts'
import { spellPage, stillNeeded } from '../src/shared/wikiPage.ts'
import type { GapRow } from '../src/shared/gaps.ts'

test("THE WINDOW'S NUMBERS GO INTO THE FILE'S OWN WORDS; OCR'S SLIPS IN THE WORDS NEVER REACH THE PAGE", () => {
  assert.equal(fillTemplate('Mends minor wounds, healing #1 hit points.', 'Mends rninor wounds healing 20 hit points.'), 'Mends minor wounds, healing 20 hit points.')
  assert.equal(
    fillTemplate('Causes the earth to tremble around you, causing between #1 and @1 damage to up to %T nearby enemies.', 'Causes the earth to tremble around you, causing between 106 and 122 damage to up to 24 nearby enemies.'),
    'Causes the earth to tremble around you, causing between 106 and 122 damage to up to 24 nearby enemies.'
  )
  // a placeholder at the sentence's end takes the whole value, not its first character
  assert.equal(fillTemplate('Hardens your skin for %z.', 'Hardens your skin for 54 min.'), 'Hardens your skin for 54 min.')
  // another spell's text does not fit
  assert.equal(fillTemplate('Mends minor wounds, healing #1 hit points.', 'Fills your target with energy.'), undefined)
  assert.equal(fileDescription('Animates a weapon to attack your enemies.'), 'Animates a weapon to attack your enemies.')
  assert.equal(fileDescription('Heals #1 hit points.'), undefined)
})

test('THE WINDOW: TITLE, LABELLED LINES BY THE PAGE KEY, THE DESCRIPTION WRAPPED OVER LINES JOINED', () => {
  const lines = ['Minor Healing', 'Mana: 10  Range: 100', 'Casting Time: 1.5', 'Duration: Instant', 'Target: Single', 'Skill: Alteration', 'Mends minor wounds, healing', '20 hit points.', '1: Increase Current HP by 20']
  const r = readSpellWindow(lines, 'Mends minor wounds, healing #1 hit points.')
  assert.equal(r.name, 'Minor Healing')
  assert.equal(r.description, 'Mends minor wounds, healing 20 hit points.')
  assert.deepEqual(r.fields, { mana: '10', range: '100', casting_time: '1.50', duration: 'Instant', target_type: 'Single', skill: '[[Skill Alteration | Alteration]]' })
  assert.deepEqual(r.checks, [])
  assert.ok(isSpellWindow(r))
})

test('A DESCRIPTION THAT DOES NOT FOLLOW THE FILE IS KEPT AS READ, AND THE PLAYER IS TOLD; A CAT IS NOT A SPELL WINDOW', () => {
  const r = readSpellWindow(['Odd Spell', 'Something the file does not say at all here.'], 'Heals #1 hit points.')
  assert.equal(r.description, 'Something the file does not say at all here.')
  assert.equal(r.checks.length, 1)
  assert.ok(!isSpellWindow(readSpellWindow(['meow', 'cat'])))
})

test('THE PAGE: THE FILES WIN WHERE THEY SPEAK; THE WINDOW FILLS THE REST; A PLACEHOLDER-FREE FILE TEXT IS THE DESCRIPTION', () => {
  const client = { classes: [{ cls: 'Cleric', level: 1 }], mana: 10, icon: 99, description: 'Mends minor wounds, healing #1 hit points.' }
  const shot = { description: 'Mends minor wounds, healing 20 hit points.', fields: { mana: '11', duration: 'Instant', target_type: 'Single' } }
  const v = spellPageValues(client, shot)
  assert.equal(v.mana, '10')
  assert.equal(v.duration, 'Instant')
  assert.equal(v.spellicon, '99')
  assert.equal(v.description, 'Mends minor wounds, healing 20 hit points.')
  assert.equal(spellPageValues({ classes: [], description: 'Animates a weapon.' }, { description: 'Anirnates a weapon.' }).description, 'Animates a weapon.')
  const page = spellPage({ name: 'Minor Healing', npcOnly: false, client, shot })
  const order = ['| spellname = Minor Healing', '| spellicon = 99', '| description = Mends minor wounds, healing 20 hit points.', '| classes =', '| mana = 10', '| duration = Instant', '| target_type = Single']
  const at = order.map((l) => page.indexOf(l))
  assert.ok(at.every((i, k) => i >= 0 && (k === 0 || i > at[k - 1])), page)
})

test('STILL NEEDED: A SPELL ASKS FOR ITS WINDOW ONLY WHILE THE DESCRIPTION IS MISSING', () => {
  const row = { domain: 'spell', name: 'Minor Healing' } as unknown as GapRow
  assert.deepEqual(stillNeeded(row, [], {}, {}), ['description (paste the spell display window below)'])
  assert.deepEqual(stillNeeded(row, [], {}, { spellFacts: { 'Minor Healing': { classes: [], description: 'Mends wounds.' } } }), [])
  assert.deepEqual(stillNeeded(row, [], {}, { spellShots: { 'Minor Healing': { description: 'Mends wounds, healing 20.' } } }), [])
})

test("THE INSTALL'S FILES: FIELD 76 IS THE ICON, FIELD 86 THE DESCRIPTION'S ID; COLOUR TAGS DROPPED, <BR> AS <br>", () => {
  const row = Array.from({ length: 90 }, () => '0')
  row[0] = '200'
  row[1] = 'Minor Healing'
  row[76] = '99'
  row[86] = '200'
  const db = ['200^6^Mends <c "#00CCFF">minor</c> wounds,<BR>healing #1 hit points.^0^', '200^5^not a description^0^'].join('\n')
  assert.deepEqual(descriptionsById(db, new Set(['200'])).get('200'), 'Mends minor wounds,<br>healing #1 hit points.')
  const facts = spellFactsFrom(row.join('^'), '', ['Minor Healing'], db)['Minor Healing']
  assert.equal(facts.icon, 99)
  assert.equal(facts.description, 'Mends minor wounds,<br>healing #1 hit points.')
})
