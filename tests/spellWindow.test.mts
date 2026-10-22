// The spell display window, as OCR would read it, into the Spell Page fields (src/shared/spellWindow.ts;
// owner, 2026-10-21: "if they have spells up lets do it"), and what the install's files add on their own
// (src/main/gapSpellFacts.ts: the icon, field 76, and the description, dbstr_us.txt type 6). The first
// tests are synthetic, in the client's own label strings (eqstr_us.txt) with OCR's slips put in by hand;
// the last ones are the owner's Burst of Flame window as OCR read it (2026-10-21), with and without a
// cast-speed invocation.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { descriptionsById, spellFactsFrom } from '../src/main/gapSpellFacts.ts'
import { baseValue, fileDescription, fillTemplate, isSpellWindow, readSpellWindow, spellPageValues, spellProblem } from '../src/shared/spellWindow.ts'
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

/** The owner's Burst of Flame window (tests/fixtures/shots/burst-of-flame-spell.png) as OCR read it, 2026-10-21. */
const BURST_OF_FLAME = [
  'CR — E— a = Se CL SERRSSELT ERR', '| @ Spell: Burst of Flame =', 'Spell: Burst of Flame t', 'SHM(1)', 'Duration: Instant E |', 'Level: 1',
  'Skill: Evocation !', 'Mana: 4', 'Cast 1.5 sec', 'Recovery: 1.5 sec', 'Reuse: 1 sec', 'Resist Fire', 'Target Single', 'Reflectable: Yes i',
  'Range: 200 %', 'Creates a ball of fire that bums your target, doing between 4 and 5', 'damage.',
  'On You: You feel your skin singe as the Burst of Flame hits you.', 'On Other: Soandso singes as the Burst of Flame hits them. |', '| (A', '['
]
const BURST_TEMPLATE = 'Creates a ball of fire that burns your target, doing between #1 and @1 damage.'

test("THE REAL WINDOW (BURST OF FLAME, THE OWNER'S): NAME, EVERY LABEL WITH OR WITHOUT ITS COLON, THE WRAPPED DESCRIPTION, BOTH MESSAGES", () => {
  const r = readSpellWindow(BURST_OF_FLAME, BURST_TEMPLATE)
  assert.equal(r.name, 'Burst of Flame')
  assert.equal(r.description, 'Creates a ball of fire that burns your target, doing between 4 and 5 damage.')
  assert.deepEqual(r.fields, {
    duration: 'Instant',
    skill: '[[Skill Evocation | Evocation]]',
    mana: '4',
    casting_time: '1.50',
    resist: 'Fire',
    target_type: 'Single',
    range: '200',
    msg_cast_on_you: 'You feel your skin singe as the Burst of Flame hits you.',
    msg_cast_on_other: 'Someone singes as the Burst of Flame hits them.'
  })
  // Reuse (whole seconds on the window), Recovery, Level and Reflectable have no page field.
  assert.deepEqual(r.checks, [])
  assert.ok(isSpellWindow(r))
})

test('A MODIFIED VALUE (A CAST-SPEED INVOCATION) IS NEVER WRITTEN: THE BASE BEFORE THE BRACKET IS, AND THE PLAYER IS TOLD', () => {
  // Owner, 2026-10-21, Inversion Invocation active: the bracket is cyan (better) or red (worse).
  assert.deepEqual(baseValue('1.5 sec (0.5)'), { base: '1.5 sec', modified: '0.5' })
  assert.deepEqual(baseValue('1.5 sec (2.5 sec)'), { base: '1.5 sec', modified: '2.5 sec' })
  assert.deepEqual(baseValue('18 secs (3 ticks)'), { base: '18 secs (3 ticks)' })
  assert.deepEqual(baseValue('1.5 sec (0.5'), { base: '1.5 sec', modified: '0.5' })
  const invoked = BURST_OF_FLAME.map((l) => (l === 'Cast 1.5 sec' ? 'Cast: 1.5 sec (0.5)' : l === 'Recovery: 1.5 sec' ? 'Recovery: 1.5 sec (2.5 sec)' : l))
  const withUpgrade = [...invoked.slice(0, -2), 'Upgrade Place Mote', 'Tier 0 0/1', 'This spell can be upgraded.']
  // With no file to follow, the upgrade block still stays out of the description.
  assert.equal(readSpellWindow(withUpgrade).description, 'Creates a ball of fire that bums your target, doing between 4 and 5 damage.')
  const r = readSpellWindow(withUpgrade, BURST_TEMPLATE)
  assert.equal(r.fields.casting_time, '1.50')
  assert.equal(r.description, 'Creates a ball of fire that burns your target, doing between 4 and 5 damage.')
  assert.deepEqual(r.checks, ['A modifier was active (Cast 0.5, Recovery 2.5 sec): the page keeps the base values.'])
})

test('A SPELL PASTE THAT KEEPS NOTHING SAYS WHY', () => {
  assert.match(spellProblem({ lines: [], ms: 0, error: 'Not a picture.' }), /^Not a picture\. Paste a screenshot/)
  assert.match(spellProblem({ lines: ['|', '['], ms: 0 }), /^No text was found/)
  assert.match(spellProblem({ lines: ['meow', 'a cat on a mat'], ms: 0 }), /^Text was read \("a cat on a mat"\), but not a spell display window/)
})

// The owner's Burst of Flame upgraded once with a Mote of Infinitesimal Potential (tier 1), as OCR read
// it (2026-10-21, tests/fixtures/shots/burst-of-flame-i-tier1.png): the rank's `I` read as a bar, the
// rank's cast time and timers in brackets, its resist adjustment after the type, the upgrade block junk-led.
const BURST_I = [
  '| © Spell: Burst of Flame | = N',
  'Spell: Burst of Flame | t',
  'SHM(1)',
  'Duration: Instant',
  'Level: 1',
  'Skill: Evocation',
  'Mana: 4 ¥',
  'Cast 1.5 sec (1.47)',
  'Recovery: 1.5 sec (1.5 sec)',
  'Reuse: 1 sec (11sec) ¢',
  'Resist Fire -15 J',
  'Target Single',
  'Reflectable: Yes',
  'Range: 200',
  'Creates a ball of fire that bums your target, doing between 4 and 5 damage. ©',
  'On You: You feel your skin singe as the Burst of Flame hits you.',
  'On Other: Soandso singes as the Burst of Flame hits them.',
  'ET',
  'ots This spell can be upgraded.'
]

test('AN UPGRADED RANK (BURST OF FLAME I, TIER 1): THE BASE SPELL\'S PAGE, THE ROW MATCHED, THE RESIST TYPE ALONE, THE PLAYER TOLD', () => {
  const r = readSpellWindow(BURST_I, BURST_TEMPLATE, 'Burst of Flame')
  assert.equal(r.name, 'Burst of Flame')
  assert.equal(r.rank, 'I')
  assert.equal(r.fields.casting_time, '1.50')
  assert.equal(r.fields.resist, 'Fire')
  assert.equal(r.description, 'Creates a ball of fire that burns your target, doing between 4 and 5 damage.')
  assert.deepEqual(r.checks, [
    "An upgraded rank was read (Burst of Flame I): the page is the base spell, Burst of Flame. The rank's own values are not written.",
    "Resist Fire -15: -15 is a resist adjustment (the rank's), not part of the type; the page writes Fire.",
    'The rank or a modifier changed values (Cast 1.47, Recovery 1.5 sec, Reuse 11sec): the page keeps the base values.'
  ])
  // Read cleanly, the numeral itself; any rank up to X.
  assert.equal(readSpellWindow(['Spell: Burst of Flame III', 'Mana: 4', 'Cast: 1.5 sec'], undefined, 'Burst of Flame').rank, 'III')
  // A spell whose own name ends in a numeral is never cut, and an unranked window has no rank (`t` is frame junk).
  assert.equal(readSpellWindow(['Spell: Cannibalize II', 'Mana: 0', 'Cast: 1.0 sec'], undefined, 'Cannibalize II').rank, undefined)
  assert.equal(readSpellWindow(['Spell: Burst of Flame t', 'Mana: 4', 'Cast: 1.5 sec'], undefined, 'Burst of Flame').rank, undefined)
  // Nothing from the upgrade block reaches the page, even with no file to follow.
  assert.doesNotMatch(readSpellWindow(BURST_I, undefined, 'Burst of Flame').description ?? '', /upgraded|Tier|Mote/)
  assert.equal(readSpellWindow(['Spell: Burst of Flame', 'Mana: 4', 'Uporade. Place Tier0 0/1', 'Mots This spell can be upgraded.']).description, undefined)
})
