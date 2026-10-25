// The +0 stats worked back from a +N window over the real item corpus (owner, 2026-10-25: "uses the
// same formulas in reverse to find the +0 stats, so that we can paste ANY item in (+5, +10, +4 with
// 16/32, etc) and it will figure out the +0 value for us"). Each item's wiki statsblock is scaled up
// by the app's own `scaleStatBlock`, written as the window reader writes it, and taken back by
// `delevel`: every number it states must be the item's own, and every number it cannot state is `?`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { delevel, tierBarFraction } from '../src/shared/itemDelevel.ts'
import { parseStatsBlock, type ItemStatBlock } from '../src/shared/itemStats.ts'
import { normalizeStatKey, scaleStatBlock, type ItemUpgradeState } from '../src/shared/itemUpgrade.ts'

interface Corpus { items: Record<string, { page: string; statsBlock?: string }> }
const ITEMS = Object.values((JSON.parse(readFileSync(join(import.meta.dirname, '..', 'src', 'main', 'data', 'items.json'), 'utf8')) as Corpus).items)
const CORPUS = ITEMS.filter((i) => i.statsBlock !== undefined).map((i) => ({ page: i.page, block: parseStatsBlock(i.statsBlock ?? '') }))

/** A block as the item window reader writes it (shared/itemWindow.ts `statsLines`): one fact a line. */
function windowText(b: ItemStatBlock): string {
  const pairs = (xs: readonly { key: string; value: string }[]): string => xs.map((x) => `${x.key}: ${x.value}`).join('  ')
  const out = [
    b.slot === undefined ? '' : `Slot: ${b.slot}`,
    b.atkDelay === undefined ? '' : `Skill: ${b.skill ?? '1H Slashing'}  Atk Delay: ${String(b.atkDelay)}`,
    b.dmg === undefined ? '' : `DMG: ${String(b.dmg)}`,
    b.backstab === undefined ? '' : `BACKSTAB: ${String(b.backstab)}`,
    b.ac === undefined ? '' : `AC: ${String(b.ac)}`,
    pairs(b.stats),
    pairs(b.saves),
    b.range === undefined ? '' : `Range: ${b.range}`,
    b.weight === undefined ? '' : `Size: ${b.size ?? 'SMALL'} WT: ${b.weight}`
  ]
  return `\n${out
    .filter((l) => l !== '')
    .map((l) => `${l}<br>`)
    .join('\n')}`
}

/** Every number a block states, by key, as the round trip compares them. */
function numbers(b: ItemStatBlock): Map<string, string> {
  const out = new Map<string, string>()
  for (const st of [...b.stats, ...b.saves]) out.set(normalizeStatKey(st.key), st.value)
  const struct: [string, string | number | undefined][] = [
    ['AC', b.ac],
    ['DMG', b.dmg],
    ['BACKSTAB', b.backstab],
    ['WEIGHT', b.weight],
    ['RANGE', b.range]
  ]
  for (const [k, v] of struct) if (v !== undefined) out.set(k, String(v))
  return out
}

const num = (v: string): number => Number(/-?\d+(?:\.\d+)?/.exec(v)?.[0] ?? NaN)
/** The same number (a value with none, `Instant`, is the same text). */
const same = (a: string, b: string): boolean => (Number.isNaN(num(a)) ? a.trim() === b.trim() : num(a) === num(b))

/** One item at one state: what came back, checked against the item itself. */
function roundTrip(block: ItemStatBlock, s: ItemUpgradeState, readFraction: boolean): { exact: boolean; butWeight: boolean; left: number; wrong: string[] } {
  const back = delevel(windowText(scaleStatBlock(block, s)), s.full, readFraction ? s.fraction : undefined)
  const got = numbers(parseStatsBlock(back.block ?? ''))
  const want = numbers(block)
  const wrong: string[] = []
  let left = 0
  for (const [k, v] of got) {
    if (v.trim().startsWith('?')) left++
    // A number written is the item's own, never a near one; `?` is the player's to fill.
    else if (want.has(k) && !same(v, want.get(k) ?? '')) wrong.push(`${k} ${v} for ${want.get(k) ?? ''}`)
  }
  return { exact: back.exact, butWeight: back.inexact.every((k) => k.startsWith('WT')), left, wrong }
}

const STATES: ItemUpgradeState[] = [
  { full: 1, fraction: 1 },
  { full: 4, fraction: 9 },
  { full: 5, fraction: 16 },
  { full: 10, fraction: 0 }
]

test("every number taken back is the item's own, at +1, +4, +5 and +10 with the Tier bar read (the whole corpus)", () => {
  const tally: string[] = []
  for (const s of STATES) {
    let [exact, butWeight] = [0, 0]
    for (const { page, block } of CORPUS) {
      const r = roundTrip(block, s, true)
      if (r.wrong.length > 0) assert.fail(`${page} at +${String(s.full)} ${String(s.fraction)}/${String(2 ** s.full)}: ${r.wrong.join(', ')}`)
      if (r.exact) exact++
      if (r.butWeight) butWeight++
    }
    tally.push(`+${String(s.full)}: ${String(exact)} of ${String(CORPUS.length)} exact, ${String(butWeight)} but Weight`)
    // Measured 2026-10-25 (11,532 blocks): Weight's ceiling to a tenth maps several bases to one (1,888
    // items at +1, 6,985 at +4, 11,018 at +10), so it is mostly `?`; every other stat comes back on 99% of
    // items or more, the rest penalties that more than one base gives (Stonemelder's Band: -35 and -34 both read -17 at +5).
    assert.ok(butWeight > CORPUS.length * 0.97, tally.join('; '))
  }
  console.log(tally.join('; '))
})

test('with the Tier bar unread, the numbers narrow the merge state themselves; what stays open is `?`, never a guess', () => {
  const sample = CORPUS.filter((_, i) => i % 25 === 0)
  for (const s of STATES.slice(1, 3)) {
    for (const { page, block } of sample) assert.deepEqual(roundTrip(block, s, false).wrong, [], `${page} at +${String(s.full)}`)
  }
})

const byPage = (page: string): ItemStatBlock => {
  const hit = CORPUS.find((c) => c.page === page)
  assert.ok(hit !== undefined, page)
  return hit.block
}

test("penalties: Stonemelder's Band's DEX -35 and AGI -35 come back at +2; at +5 -35 and -34 both read -17, and at +10 every penalty reads 0, so they are left `?`", () => {
  const band = byPage("Stonemelder's Band")
  const at2 = delevel(windowText(scaleStatBlock(band, { full: 2, fraction: 0 })), 2, 0)
  assert.match(at2.block ?? '', /DEX: -35 {2}AGI: -35/)
  assert.equal(at2.exact, true, at2.notes.join(' | '))
  const at5 = delevel(windowText(scaleStatBlock(band, { full: 5, fraction: 0 })), 5, 0)
  assert.match(at5.block ?? '', /DEX: \? {2}AGI: \?/)
  assert.ok(at5.notes.includes('DEX -17 at +5: any of -35, -34 at +0 gives it, so it is left as ? for you to fill.'), at5.notes.join(' | '))
  const at10 = delevel(windowText(scaleStatBlock(band, { full: 10, fraction: 0 })), 10)
  assert.match(at10.block ?? '', /DEX: \?/)
  assert.equal(at10.exact, false)
  assert.ok(at10.notes.some((n) => n.startsWith('DEX 0 at +10: any of')), at10.notes.join(' | '))
})

test("the upgrade's own SV VOID is taken off, and an item's own SV VOID is taken back like any save", () => {
  const two: ItemStatBlock = { flags: [], stats: [{ key: 'STR', value: '+12' }, { key: 'DEX', value: '+4' }], saves: [], effects: [], exaltationSlots: [], extras: [], ac: 20 }
  const up = scaleStatBlock(two, { full: 4, fraction: 3 })
  assert.ok(up.saves.some((s) => s.key === 'SV VOID'))
  const back = delevel(windowText(up), 4, 3)
  assert.equal(back.exact, true, back.notes.join(' | '))
  assert.ok(!(back.block ?? '').includes('SV VOID'), back.block)
  const own = delevel(windowText(scaleStatBlock({ ...two, saves: [{ key: 'SV VOID', value: '+15' }] }, { full: 4, fraction: 3 })), 4, 3)
  assert.match(own.block ?? '', /SV VOID: \+15/)
})

test('the Tier bar: a bar that holds together gives the progress; one that does not is said and not used', () => {
  assert.deepEqual(tierBarFraction(['Merge Place Tier5 16/32'], 5), { fraction: 16 })
  assert.deepEqual(tierBarFraction(['Tier 4  9/16'], 4), { fraction: 9 })
  assert.equal(tierBarFraction(['Tier4 16/32'], 4).fraction, undefined)
  assert.match(tierBarFraction(['Tier4 16/32'], 4).note ?? '', /does not fit \+4/)
  // At the cap and at +0 there is no progress to read (`Tier: 10/10`, `Tier0 0/1`).
  assert.deepEqual(tierBarFraction(['Merge Place Tier: 10/10'], 10), {})
  // The progress decides a stat over ten: STR 30 at +4 reads 42 at 0/16 and 45 at 15/16.
  const str = (f: number): string => windowText(scaleStatBlock({ flags: [], stats: [{ key: 'STR', value: '+30' }], saves: [], effects: [], exaltationSlots: [], extras: [] }, { full: 4, fraction: f }))
  assert.match(str(0), /STR: \+42/)
  assert.match(str(15), /STR: \+45/)
  assert.equal(delevel(str(15), 4, 15).block, '\nSTR: +30<br>')
  assert.equal(delevel(str(0), 4, 0).block, '\nSTR: +30<br>')
})
