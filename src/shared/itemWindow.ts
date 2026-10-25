// itemWindow.ts — the game's item window, as OCR read it, turned into the wiki's Item Page lines
// (owner ask, 2026-10-21: paste a screenshot of the item, get the page's statsblock).
//
// The window is not the wiki's layout (plans/2026-10-20-screenshot-to-wiki.md, "First real
// screenshot"): two or three columns, long names (`Charisma:`, `SV. Magic:`), the slot as a bare
// word, the flags as the tooltip prints them. The target is the wiki's recent norm (owner,
// 2026-10-21, D1; itemVocab.ts): the flag line as the window prints it (`Lore Equipped, No Trade`),
// `Slot: CHEST`, short stat names with a sign, every SV on one line, `Size:` before `WT:`, Class and
// Race last, values in caps.
//
// Labels are found anywhere in a line, never by position: each UI skin lays the window out its own
// way, and OCR drops colons, joins columns and puts junk at line ends. A number is never guessed;
// the one repair is Weight's decimal, which the game always prints and OCR loses (3 windows of 3).

import { delevel } from './itemDelevel'
import { effectText, petIllusionLine, petIllusionOf } from './itemEffects'
import { bestLoreLine, withSplitCapital } from './itemLore'
import { isTabRow, tabRowAt } from './itemTabRow'
import { CLASS_CODES, codeWords, deityText, FLAG_WORDS, isDeityLine, RACE_CODES, SIZES, slotOf, snap, snapLabelWords, type Snapped } from './itemVocab'
export { slotOf } from './itemVocab'
import { statValue, weaponValue, weightValue } from './itemWindowNumbers'
export { weightValue } from './itemWindowNumbers'

export interface ItemWindowRead {
  /** The coloured name line, a `+N` tier dropped. OCR may run words together; the caller's name wins. */
  name?: string
  /** `|statsblock` as the page holds it: a leading newline, one `<br>` line each. Empty for a Lore tab. */
  statsblock: string
  /** `|focus_effect`: the wiki keeps a focus outside the stats block. */
  focusEffect?: string
  /** The pet illusion the item grants (`Pet Illusion: Mummy`): its line ends the stats block, its category the page. */
  petIllusion?: string
  /** The window's Value line, in copper: the vendor's base value, `|merchant_value`. */
  valueCopper?: number
  /** The Lore tab's text, for `|notes = {{Item Lore|...}}`. */
  lore?: string
  /** The window shows a Lore tab: the item has lore (the game draws the tab only then). */
  loreTab?: boolean
  /** The `+N` the name carries: `statsblock` holds that tier's numbers, not the base item's. */
  tier?: number
  /** `statsblock` taken back to +0 by the upgrade rule, when it inverts exactly (itemDelevel.ts). */
  baseStatsblock?: string
  /** Lines with a label this reader does not place, to show the player. */
  unread: string[]
  /** What the reader corrected or doubts, in words, to show the player. */
  checks?: string[]
}

/** What main answers for one pasted item screenshot (src/main/ipc/shotIpc.ts). */
export interface ItemShotReply {
  read: ItemWindowRead
  /** The OCR lines as read. */
  lines: string[]
  /** Icon ids, best first, with their fit (lower is closer); empty when none could be looked for. */
  icons: { id: number; score: number }[]
  /** Why there are no icons, when there are none: no install, no icon sheets. */
  iconNote?: string
  /** The catalog's item names within OCR's slips of the name read: a slip is not taken for a row when one is as near (itemShotKeep.ts `sameItem`). */
  known?: string[]
  ms: number
  /** Set when the picture could not be read at all. */
  error?: string
}

// ---- vocabulary ---------------------------------------------------------------------------------

/**
 * The window's flag words, found anywhere in a line, longest first (`Lore Equipped` before `Lore`).
 * Written as the window prints them (owner, 2026-10-21, D1: `No Trade, Quest`, never `NO DROP`).
 */
const FLAG_RE = new RegExp(`\\b(${[...FLAG_WORDS].sort((a, b) => b.length - a.length).map((f) => f.replace(/ /g, '\\s+')).join('|')})\\b`, 'gi')

/** Window label -> the wiki's key. `kind` decides the line it lands on. */
type Kind = 'attr' | 'save' | 'ac' | 'weapon' | 'wt' | 'size' | 'value' | 'line' | 'bag' | 'effect' | 'effectInfo' | 'skip'
// The window's own labels are the client's strings (eqstr_us.txt 12999-13045: `Weight:`, `End:`,
// `Dmg Bon:`, `Rec Level:`, `Req Level:` ...). `line` kinds are written as the wiki's pages write them.
const LABELS: readonly (readonly [string, string, Kind])[] = [
  ['Strength', 'STR', 'attr'], ['Stamina', 'STA', 'attr'], ['Agility', 'AGI', 'attr'], ['Dexterity', 'DEX', 'attr'],
  ['Wisdom', 'WIS', 'attr'], ['Intelligence', 'INT', 'attr'], ['Charisma', 'CHA', 'attr'],
  ['HP Regen', 'HP Regen', 'attr'], ['Mana Regen', 'Mana Regen', 'attr'], ['Endurance Regen', 'End Regen', 'attr'],
  ['End Regen', 'End Regen', 'attr'], ['End', 'END', 'attr'], ['En', 'END', 'attr'],
  ['HP', 'HP', 'attr'], ['Mana', 'MANA', 'attr'], ['Endurance', 'END', 'attr'],
  ['Haste', 'Haste', 'attr'], ['Attack', 'Attack', 'attr'], ['Accuracy', 'Accuracy', 'attr'], ['Avoidance', 'Avoidance', 'attr'],
  ['Damage Shield', 'Damage Shield', 'attr'], ['Spell Shield', 'Spell Shield', 'attr'], ['DoT Shielding', 'DoT Shielding', 'attr'],
  ['Shielding', 'Shielding', 'attr'], ['Stun Resist', 'Stun Resist', 'attr'], ['Strikethrough', 'Strikethrough', 'attr'],
  ['Combat Effects', 'Combat Effects', 'attr'], ['Heal Amount', 'Heal Amount', 'attr'], ['Spell Damage', 'Spell Damage', 'attr'],
  ['Clairvoyance', 'Clairvoyance', 'attr'],
  ['SV Magic', 'SV MAGIC', 'save'], ['SV Fire', 'SV FIRE', 'save'], ['SV Cold', 'SV COLD', 'save'], ['SV Disease', 'SV DISEASE', 'save'],
  ['SV Poison', 'SV POISON', 'save'], ['SV Corruption', 'SV CORRUPTION', 'save'], ['SV Void', 'SV VOID', 'save'],
  ['AC', 'AC', 'ac'],
  ['Base Dmg', 'DMG', 'weapon'], ['Bane Dmg', 'Bane DMG', 'weapon'], ['Backstab Dmg', 'BACKSTAB', 'weapon'], ['Backstab', 'BACKSTAB', 'weapon'], ['Delay', 'Atk Delay', 'weapon'],
  ['Skill', 'Skill', 'weapon'], ['Range', 'Range', 'weapon'], ['Ratio', 'Ratio', 'weapon'], ['Dmg Bon', 'Dmg Bon', 'weapon'],
  ['Weight', 'WT', 'wt'], ['Size', 'Size', 'size'], ['Value', 'Value', 'value'], ['Charges', 'Charges', 'line'],
  ['Rec Level', 'Recommended level', 'line'], ['Req Level', 'Required level', 'line'],
  // A container: the pages write `Weight Reduction: 0%` and `Capacity: 6 Size Capacity: SMALL` (205 pages).
  ['Capacity', 'Capacity', 'bag'], ['Size Cap', 'Size Capacity', 'bag'], ['Size Capacity', 'Size Capacity', 'bag'], ['Weight Reduction', 'Weight Reduction', 'bag'],
  ['Focus Effect', 'Focus', 'effect'], ['Click Effect', 'Click', 'effect'], ['Worn Effect', 'Worn', 'effect'],
  ['Proc Effect', 'Combat', 'effect'], ['Combat Effect', 'Combat', 'effect'],
  ['Cast Time', 'Casting Time', 'effectInfo'], ['Casting Time', 'Casting Time', 'effectInfo'],
  ['Required Level', 'Level', 'effectInfo'], ['Cooldown', 'Cooldown', 'effectInfo'], ['Recast', 'Cooldown', 'effectInfo']
]

/** `SV.` and `SV ` both, colon optional (OCR drops it or reads `;` or `.`). Longest label first. */
const labelPattern = (label: string): string => label.replace(/^SV /, 'SV[._\\s]*').replace(/ /g, '\\s*')
const LABEL_RE = new RegExp(
  `(?:^|[^A-Za-z])(${[...LABELS].sort((a, b) => b[0].length - a[0].length).map(([l]) => labelPattern(l)).join('|')})\\s*[:;.]?(?=\\s|$|[-+0-9])`,
  'gi'
)
const labelOf = (hit: string): readonly [string, string, Kind] | undefined => {
  const key = hit.replace(/[._\s]+/g, '').toLowerCase()
  return LABELS.find(([l]) => l.replace(/\s+/g, '').toLowerCase() === key)
}

/** A line about the window, not the item: tabs, upgrade widgets, exaltation slots, placement. */
const NOT_ITEM = /\b(Exaltation|O\w{0,2}amentation|Unmodified|Modified|Merge|Place\s*Item|Tier\s*\d+|Tier|upgraded|placeable in|Description|Container\W+(?:OPEN|CLOSED))\b/i

// ---- small readers ------------------------------------------------------------------------------

/**
 * OCR junk off both ends: a misread icon edge (`8 Quest`, `++ Ruined Robe`, `| Class`), a stray `:`.
 * `name`: the name line, where only marks are junk (`A Faded Salil's Writ Page`, `5 Dose Potion of Cold`).
 */
export function cleanLine(raw: string, name = false): string {
  return raw
    .replace(/\s+/g, ' ')
    // leading tokens with no two letters or digits in a row: `++`, `8`, `S—`, `|`; on the name line, no letter or digit
    .replace(name ? /^(?:[^\sA-Za-z0-9]+\s+)+/ : /^(?:(?![^\s]*[A-Za-z0-9]{2})[^\s]+\s+)+/, '')
    // a trailing lone mark, a lone lower-case letter, or any lone character after a number
    .replace(/(?:\s+[^A-Za-z0-9%)]{1,3}|\s+[a-z]|(?<=\d%?)\s+\S)+$/, '')
    .trim()
}


const COIN: Record<string, number> = { platinum: 1000, gold: 100, silver: 10, copper: 1 }

/** `4 platinum`, `3 silver 8 copper` -> copper; undefined when no coin word is read. */
export function valueCopper(v: string): number | undefined {
  let total = 0
  let seen = false
  for (const m of v.matchAll(/(\d+)\s*(platinum|gold|silver|copper)/gi)) {
    total += Number(m[1]) * COIN[m[2].toLowerCase()]
    seen = true
  }
  return seen ? total : undefined
}

/** `Improved Healing lll` -> `Improved Healing III`: a rank numeral OCR read as l/1/I. */
function rankFix(name: string): string {
  return name.replace(/\s([lI1|]{2,3}|[lI|]l+)$/, (_m, r: string) => ` ${'I'.repeat(r.length)}`)
}

/** The flag words a line holds, in its order, in the window's spelling. */
function flagsOf(line: string): string[] {
  return [...line.matchAll(FLAG_RE)].map((m) => FLAG_WORDS.find((f) => f.toLowerCase() === m[1].replace(/\s+/g, ' ').toLowerCase()) ?? m[1])
}

/**
 * A flag line OCR slipped in every word (owner's capture, 2026-10-23: `Altunable`, so the name came
 * out "Altunable"): each comma piece within reach of a flag word, and 6+ letters, so a short name such
 * as `Lord` is never the flag `Lore`.
 */
function slippedFlags(line: string): boolean {
  const pieces = line.split(/\s*,\s*/).filter(Boolean)
  return pieces.length > 0 && pieces.every((p) => p.replace(/[^A-Za-z]/g, '').length >= 6 && FLAG_WORDS.includes(snap(p, FLAG_WORDS, 'Flag').value))
}

/**
 * The flag line holds flag words, never a word of a name: `Lore of Malignancy` is the name line, not a
 * `Lore` flag (review, 2026-10-21). Besides the known words: a flag within OCR's reach of one, or a
 * flag the list does not know yet beside known ones, comma-separated (`Soulbound, No Trade`).
 */
function isFlagLine(line: string): boolean {
  if (flagsOf(line).length === 0) return slippedFlags(line)
  if (!/[A-Za-z]{3}/.test(line.replace(FLAG_RE, ' '))) return true
  const pieces = line.split(/\s*,\s*/).filter(Boolean)
  const known = pieces.filter((p) => FLAG_WORDS.includes(snap(p, FLAG_WORDS, 'Flag').value)).length
  return pieces.length > 1 ? known > 0 : known === 1
}

/**
 * The flag line as the window prints it, `, ` between: each comma piece snapped to a flag word
 * (an OCR slip within reach is noted); with its commas lost, the flag words found in it.
 */
function flagLine(line: string): Snapped[] {
  const pieces = line.split(/\s*,\s*/).filter(Boolean).map((p) => snap(p, FLAG_WORDS, 'Flag'))
  return pieces.every((p) => FLAG_WORDS.includes(p.value)) ? pieces : flagsOf(line).map((value) => ({ value }))
}

/** `Class: NEC WIZ MAG ENC`, `ALL except NEC`, `None` -> the page's words (itemVocab.ts `codeWords`). */
function codesOf(line: string, label: 'Class' | 'Race'): { value: string; notes: string[] } | undefined {
  const m = new RegExp(`${label}\\s*[:;.]?\\s*(.+)$`, 'i').exec(line)
  if (m === null) return undefined
  const words = m[1].split(/\s+/).map((w) => w.replace(/[^A-Za-z]/g, '')).filter((w) => /^[A-Za-z]{2,6}$/.test(w))
  return words.length > 0 ? codeWords(words, label === 'Class' ? CLASS_CODES : RACE_CODES, label) : undefined
}


// ---- label pairs --------------------------------------------------------------------------------

interface Pair {
  key: string
  kind: Kind
  value: string
}

/** The one-word labels long enough to snap a slip to (`Altack` -> `Attack`). */
const LABEL_WORDS = LABELS.map(([l]) => l).filter((l) => /^[A-Za-z]{5,}$/.test(l))

/** Every `label value` on a line, a value running to the next label. */
export function pairsOf(raw: string): Pair[] {
  const line = snapLabelWords(raw, LABEL_WORDS)
  LABEL_RE.lastIndex = 0
  const hits: { def: readonly [string, string, Kind]; from: number; to: number }[] = []
  for (const m of line.matchAll(LABEL_RE)) {
    const def = labelOf(m[1])
    const from = (m.index ?? 0) + m[0].indexOf(m[1])
    // An effect's name runs to the line's end, its cast time and cooldown aside: `Focus Effect Mana
    // Preservation lll` (the colon unread) is no MANA stat (owner, 2026-10-24: Signet Ring of Lord Everling).
    const inEffect = hits.some((h) => h.def[2] === 'effect')
    if (def !== undefined && (!inEffect || def[2] === 'effectInfo')) hits.push({ def, from, to: (m.index ?? 0) + m[0].length })
  }
  return hits.map((h, i) => ({
    key: h.def[1],
    kind: h.def[2],
    value: line.slice(h.to, i + 1 < hits.length ? hits[i + 1].from : line.length).trim()
  }))
}

// ---- the page's lines ---------------------------------------------------------------------------

interface Gathered {
  slot?: string
  ac?: string
  attrs: string[]
  saves: string[]
  weapon: Map<string, string>
  wt?: string
  size?: string
  value?: number
  /** Whole lines in the wiki's words: `Charges: 5`, `Recommended level of 10.` */
  lines: string[]
  /** A container's Capacity, Size Capacity, Weight Reduction. */
  bag: Map<string, string>
  deity?: string
  effects: string[]
  focus?: string
  unread: string[]
  /** Values kept as read or snapped to a known one (itemVocab.ts), for the player. */
  notes: string[]
  /** Filled exaltation slots: the effect kind each grants -> what fills it. */
  exalts: Map<string, string>
}

/** A snapped value's note into the gathered notes; the value back. */
const noted = (g: Gathered, v: { value: string; note?: string }): string => {
  if (v.note !== undefined) g.notes.push(v.note)
  return v.value
}

/** `Firestrike (Must Equip)` + the info lines under it -> `[[Firestrike]] (Must Equip, Casting Time: Instant) at Level 40`. */
function effectLine(kind: string, value: string, info: ReadonlyMap<string, string>): string {
  const m = /^(.*?)\s*(?:\(([^)]*)\))?$/.exec(value) ?? ['', value]
  // The blueprint's form: a styled link, the kind and timing in one bracket (itemEffects.ts).
  return effectText(kind, rankFix((m[1] ?? value).trim()), m[2], info)
}

interface Effect {
  kind: string
  value: string
  info: Map<string, string>
}

/**
 * An info line onto its effect. Legends prints a click's casting time inside the effect's own brackets,
 * `Summon Familiar: Werewolf (Casting Time: 5.0)(Can Equip)` (owner's Petamorph Wand, 2026-10-22), so
 * the label splits the line: the name keeps a dangling `(` and the time keeps `)(Can Equip)`. The time
 * is the number; the brackets after it go back to the effect, as `(Must Equip)` sits on other windows.
 */
function effectInfo(effect: Effect | null | undefined, key: string, value: string): void {
  if (effect === null || effect === undefined) return
  const m = key === 'Casting Time' ? /^(Instant|[\d.]+)\s*\)?\s*(.*)$/i.exec(value) : null
  if (m === null) {
    effect.info.set(key, value)
    return
  }
  effect.info.set(key, m[1])
  const notes = [...m[2].matchAll(/\(([^)]*)\)/g)].map((n) => n[1].trim()).filter((n) => n !== '')
  effect.value = effect.value.replace(/\s*\($/, '')
  if (notes.length > 0 && !effect.value.includes('(')) effect.value = `${effect.value} (${notes.join(', ')})`
}

/** `Rec Level: 10` -> `Recommended level of 10.` (the pages' words); `Charges: 5` as it stands. */
const wikiLine = (p: Pair): string => (p.key.endsWith('level') ? `${p.key} of ${p.value.replace(/\.$/, '')}.` : `${p.key}: ${p.value}`)

/** Each kind's place in the gathered lines. */
const PLACE: Record<Kind, (g: Gathered, p: Pair, lastEffect: Effect | null) => void> = {
  attr: (g, p) => g.attrs.push(`${p.key}: ${noted(g, statValue(p.key, p.value))}`),
  save: (g, p) => g.saves.push(`${p.key}: ${noted(g, statValue(p.key, p.value))}`),
  ac: (g, p) => (g.ac = p.value),
  weapon: (g, p) => g.weapon.set(p.key, noted(g, weaponValue(p.key, p.value))),
  // Letters in it are a misread or an unknown label run on (owner, 2026-10-24: `Weight ah BackstabDmg: 15`
  // made WT 1.5): only what comes before them is the weight, and the player is told.
  // The window always prints a weight as `N.N`; anything else (`228".`, Layered Guards' 2.5) is told too.
  wt: (g, p) => {
    const letters = p.value.search(/[A-Za-z]/)
    g.wt = weightValue(letters >= 0 ? p.value.slice(0, letters) : p.value)
    // Digits alone are the lost decimal weightValue puts back (`04` -> 0.4); any other mark is a misread.
    if (letters >= 0 || !/^\d{1,3}(?:\.\d)?$/.test(p.value.trim())) g.notes.push(`Weight read "${p.value}": check WT against the window before saving.`)
  },
  size: (g, p) => (g.size = noted(g, snap(p.value.split(/\s+/)[0] ?? '', SIZES, 'Size'))),
  value: (g, p) => (g.value = valueCopper(p.value)),
  line: (g, p) => g.lines.push(wikiLine(p)),
  bag: (g, p) => g.bag.set(p.key, p.key === 'Size Capacity' ? noted(g, snap(p.value.split(/\s+/)[0] ?? '', SIZES, 'Size Capacity')) : p.value),
  effectInfo: (_g, p, lastEffect) => effectInfo(lastEffect, p.key, p.value.replace(/\s+seconds?$/i, '')),
  effect: () => undefined,
  skip: () => undefined
}

/** The slot line, or its wrapped second half (a long list of slots), before any stat. */
function slotLine(g: Gathered, line: string): boolean {
  if (g.attrs.length + g.saves.length > 0 || g.ac !== undefined) return false
  const slot = slotOf(line)
  if (slot === undefined) return false
  g.slot = [...new Set(`${g.slot ?? ''} ${slot}`.trim().split(' '))].join(' ')
  return true
}

/** A filled exaltation slot (`Click Exaltation: Golem Metal Wand (Exaltation)`; OCR reads Worn as `Wom`). */
const EXALT_SLOT = /\b(Focus|Click|Proc|W\w{1,2}n|Wom)\s+Exaltation\s*[:;.]?\s*([A-Za-z].*)$/i
/** The effect kind each exaltation slot grants, as the effect labels name it. */
const EXALT_KIND = (slot: string): string => ({ focus: 'Focus', click: 'Click', proc: 'Combat' })[slot.toLowerCase()] ?? 'Worn'

/** A filled exaltation slot line into `g.exalts`; an `empty` one (OCR: `emply`) or one with no value read is nothing. */
function noteExalt(g: Gathered, line: string): void {
  const exalt = EXALT_SLOT.exec(line)
  if (exalt !== null && !/^emp\w*$/i.test(exalt[2].trim())) g.exalts.set(EXALT_KIND(exalt[1]), exalt[2].trim())
}

/** One line of the stats region into `g`: the bare slot word, or its pairs, or an unread line. */
function gatherLine(g: Gathered, effects: Effect[], line: string): void {
  noteExalt(g, line)
  if (NOT_ITEM.test(line) || slotLine(g, line)) return
  // `Deity: Karana`, or the god's name alone on its line (Malkil's Surefall Fletching Kit, 2026-10-21).
  const deity = /^Deity\s*[:;.]?\s+(.+)$/i.exec(line)
  if (deity !== null || isDeityLine(line)) {
    g.deity = noted(g, deityText(deity?.[1] ?? line))
    return
  }
  const pairs = pairsOf(line)
  if (pairs.length === 0 && /[A-Za-z]{3}/.test(line)) g.unread.push(line)
  for (const p of pairs) {
    if (p.kind === 'effect') effects.push({ kind: p.key, value: p.value, info: new Map() })
    else PLACE[p.kind](g, p, effects.at(-1) ?? null)
  }
}

/** The stats region, line by line: pairs placed, effects gathered with the info lines under them. */
function gather(lines: readonly string[]): Gathered {
  const g: Gathered = { attrs: [], saves: [], weapon: new Map(), lines: [], bag: new Map(), effects: [], unread: [], notes: [], exalts: new Map() }
  const effects: Effect[] = []
  for (const line of lines) gatherLine(g, effects, line)
  for (const e of effects) {
    const exalt = g.exalts.get(e.kind)
    if (exalt !== undefined) g.notes.push(exaltNote(e, exalt))
    else if (e.kind === 'Focus') g.focus = rankFix(e.value.replace(/\s*\(.*\)$/, ''))
    else g.effects.push(effectLine(e.kind, e.value, e.info))
  }
  return g
}

/**
 * An effect of the kind a filled exaltation slot grants is not written (owner, 2026-10-21: Wu's Fist of
 * Mastery's Click and Proc slots hold Golem Metal Wand and Cherista's Fangs, whose effects the window
 * lists as Pillage Enchantment and Lifebite): the window cannot tell it from the item's own.
 */
function exaltNote(e: Effect, exalt: string): string {
  const name = rankFix(e.value.replace(/\s*\(.*$/, '').trim())
  return `${e.kind} effect ${name} not written: the item's ${e.kind === 'Combat' ? 'Proc' : e.kind} Exaltation slot holds ${exalt}, and the window cannot tell its effect from the item's own. Check the item's page.`
}

/** The wiki's order (Windstriker: `STR: +5 AGI: +5 DEX: +5 HP: +50`): attributes, then pools, then the rest as read. */
const ATTR_ORDER = ['STR', 'STA', 'AGI', 'DEX', 'WIS', 'INT', 'CHA', 'HP', 'MANA', 'END']
function byAttrOrder(attrs: readonly string[]): string[] {
  const rank = (a: string): number => {
    const i = ATTR_ORDER.indexOf(a.slice(0, a.indexOf(':')))
    return i < 0 ? ATTR_ORDER.length : i
  }
  return attrs.map((a, i) => ({ a, i })).sort((x, y) => rank(x.a) - rank(y.a) || x.i - y.i).map((x) => x.a)
}

/**
 * The window's own cross-check: Ratio is DMG over Delay (Windstriker 90 / 60 = 1.5). OCR once read
 * `90` as `920` (Malkil's window, one scale of two). When the three disagree and dropping one digit
 * from DMG makes them agree, that DMG is the window's, and the player is told; otherwise they are
 * only told. Ratio's own decimal is lost like Weight's (`1.5` read `15`).
 */
export function checkRatio(w: Map<string, string>): string | undefined {
  const dmg = w.get('DMG')
  const delay = Number(w.get('Atk Delay'))
  const ratioText = w.get('Ratio')
  if (dmg === undefined || ratioText === undefined || !(delay > 0)) return undefined
  const ratio = Number(weightValue(ratioText))
  const fits = (d: string): boolean => /^\d+$/.test(d) && Math.abs(Number(d) / delay - ratio) < 0.051
  if (fits(dmg)) return undefined
  const fixed = Array.from({ length: dmg.length }, (_, i) => dmg.slice(0, i) + dmg.slice(i + 1)).find(fits)
  if (fixed === undefined) return `DMG ${dmg} and Delay ${String(delay)} do not give the window's Ratio ${String(ratio)}: check DMG.`
  w.set('DMG', fixed)
  return `DMG read as ${dmg}; the window's Ratio (${String(ratio)}) and Delay (${String(delay)}) say ${fixed}.`
}

function weaponLines(w: ReadonlyMap<string, string>): string[] {
  const skill = [w.has('Skill') ? `Skill: ${w.get('Skill') ?? ''}` : '', w.has('Atk Delay') ? `Atk Delay: ${w.get('Atk Delay') ?? ''}` : ''].filter(Boolean)
  const rest = ['DMG', 'Dmg Bon', 'Bane DMG', 'BACKSTAB', 'Range'].filter((k) => w.has(k)).map((k) => `${k}: ${w.get(k) ?? ''}`)
  return [...(skill.length > 0 ? [skill.join('  ')] : []), ...rest]
}

/** A container's lines as the pages write them, under Size and WT. */
function bagLines(bag: ReadonlyMap<string, string>): string[] {
  const cap = ['Capacity', 'Size Capacity'].filter((k) => bag.has(k)).map((k) => `${k}: ${bag.get(k) ?? ''}`)
  return [...(bag.has('Weight Reduction') ? [`Weight Reduction: ${bag.get('Weight Reduction') ?? ''}`] : []), ...(cap.length > 0 ? [cap.join(' ')] : [])]
}

/** The lines above the stats: the flags, the Class and Race words. */
interface Head {
  flags: string[]
  cls?: string
  race?: string
}

/** `EXPENDABLE` rides on the Charges line, as the pages write it (`EXPENDABLE Charges: 10`, owner D1). */
function expendable(h: Head, g: Gathered): string[] {
  const at = g.lines.findIndex((l) => l.startsWith('Charges: '))
  if (!h.flags.includes('Expendable') || at < 0) return h.flags
  g.lines[at] = `EXPENDABLE ${g.lines[at]}`
  return h.flags.filter((f) => f !== 'Expendable')
}

function statsLines(h: Head, g: Gathered): string[] {
  const out: string[] = []
  const flags = expendable(h, g)
  if (flags.length > 0) out.push(flags.join(', '))
  if (g.slot !== undefined) out.push(`Slot: ${g.slot}`)
  out.push(...weaponLines(g.weapon))
  if (g.ac !== undefined) out.push(`AC: ${g.ac}`)
  if (g.attrs.length > 0) out.push(byAttrOrder(g.attrs).join('  '))
  if (g.saves.length > 0) out.push(g.saves.join('  '))
  out.push(...g.effects, ...g.lines)
  // Size before WT, one space, as recent pages write it (owner D1: 752 pages; 642 converted to it, none back).
  const sizeWt = [g.size === undefined ? '' : `Size: ${g.size}`, g.wt === undefined ? '' : `WT: ${g.wt}`].filter(Boolean)
  if (sizeWt.length > 0) out.push(sizeWt.join(' '))
  out.push(...bagLines(g.bag))
  if (h.cls !== undefined) out.push(`Class: ${h.cls}`)
  if (h.race !== undefined) out.push(`Race: ${h.race}`)
  // The pages put Deity after Race (Deity: Cazic-Thule, 453 cached pages).
  if (g.deity !== undefined) out.push(`Deity: ${g.deity}`)
  return out
}

/**
 * A lore line less what the frame leaves after its last sentence: the scrollbar read as `1`, `|`, `}`,
 * or its up arrow as a lone `t` (owner's Earring of Experimentation, 2026-10-23: `Attempt # 326 t`).
 */
const loreLine = (l: string): string => l.replace(/([.!?'"])\s+[^\sA-Za-z]{1,2}$/, '$1').replace(/\s+[t|}\]]$/, '')

/**
 * The Lore tab: no Class line; its text is what follows the tab row, a wrapped lore joined back into
 * one line. With no tab row read, the longest line that is not a tab word.
 */
function loreRead(lines: readonly string[], raw: readonly string[]): ItemWindowRead {
  const tabAt = tabRowAt(lines)
  // Words, not OCR's junk off the frame: mostly letters, numbers and spaces (`Attempt # 326`).
  const prose = (l: string): boolean => !/^Lore$/i.test(l) && !isTabRow(l) && /[a-z]{3}/i.test(l) && (l.match(/[A-Za-z0-9 #]/g) ?? []).length >= 0.8 * l.length
  const kept = lines.map((l, i) => loreLine(withSplitCapital(raw[i] ?? '', l)))
  const text = tabAt >= 0 ? kept.slice(tabAt + 1).filter(prose).join(' ') : bestLoreLine(kept.filter(prose))
  // The title bar above the tab row names the item: a captured Lore tab finds its row by it.
  const titleAt = tabAt > 0 ? lines.slice(0, tabAt).map((l) => /[A-Za-z]{3}/.test(l)).lastIndexOf(true) : -1
  const title = titleAt < 0 ? undefined : withoutTier(bareTitle(cleanLine(raw[titleAt], true)) ?? '')
  return { statsblock: '', unread: [], ...(text === undefined || text === '' ? {} : { lore: text }), ...(title === undefined ? {} : { name: title }) }
}

/**
 * A title as the item's name, the window's marks dropped: the title bar's buttons OCR reads as junk
 * (`Sickly Maiden's Hair [1 [=E`), the `*` (Mud Stained Skin Tunic*) and `(Augmented)` (Wu's Fist of
 * Mastery +10 (Augmented), owner's screenshots 2026-10-21).
 */
const bareTitle = (l: string | undefined): string | undefined =>
  l?.replace(/^[_|~\s]+/, '').replace(/(?<=\S)\s+[[\]{}=|<>].*$/, '').replace(/\s*\*+$/, '').replace(/\s*\(Augmented\)$/i, '').trim()

/** The tab row above the name names a Lore tab: the item has lore (Ruined Robe; Windstriker and Black Lizard Scale show none). */
const hasLoreTab = (lines: readonly string[], before: number): boolean =>
  lines.slice(0, before).some((l) => isTabRow(l) &&/\bLore\b(?!\s*(Equipped|Item))/i.test(l))

/** A `+N` tier after a name, as OCR reads it (`+10`, `+ 10`, `+9.`, `+10 (Augmented`), and anything after it. */
const TIER = /\s*\+\s*(\d{1,2})\b.*$/

/** A name with its `+N` tier dropped. */
export const withoutTier = (name: string): string => name.replace(TIER, '').trim()

/**
 * The name line's first token dropped when it is the icon read as a character: the title bar above
 * names the item without it (owner's screenshots, 2026-10-22: `S Halfling Blood`, `1 Robe of the
 * Betrayed`). A name that starts so itself (`5 Dose Potion of Cold`) keeps it: its title has it too.
 */
function iconJunkDropped(name: string, above: readonly string[]): string {
  const rest = name.replace(/^\S{1,2}\s+/, '')
  if (rest === name) return name
  const norm = (s: string): string => withoutTier(s).toLowerCase().replace(/[^a-z0-9]/g, '')
  // The title bar's buttons are read onto its end (owner, 2026-10-24: `Jenni's Robe ZI]E<]` over the
  // robe's icon read `1`), so the title only has to start with the name; one that starts with the
  // token too names the item with it.
  const [whole, bare] = [norm(name), norm(rest)]
  // Its minimize button can be read onto its front too (`B Crysta's Robe +4 ZI]`).
  const titles = above.flatMap((l) => {
    const t = bareTitle(cleanLine(l, true)) ?? ''
    return [norm(t), norm(t.replace(/^\S{1,2}\s+/, ''))]
  })
  return titles.some((t) => t.startsWith(bare)) && !titles.some((t) => t.startsWith(whole)) ? rest : name
}

/** The name: the line above the flags line, else above Class; junk dropped, a `+N` tier apart. `raw`: the lines before cleaning. */
function nameAbove(lines: readonly string[], raw: readonly string[], at: number): { name?: string; tier?: number } {
  const i = lines.slice(0, at).map((l) => /[A-Za-z]{2}/.test(l) && !NOT_ITEM.test(l)).lastIndexOf(true)
  if (i < 0) return {}
  const bare = iconJunkDropped(bareTitle(cleanLine(raw[i], true)) ?? '', raw.slice(0, i))
  const tier = TIER.exec(bare)
  return { name: withoutTier(bare), ...(tier === null || Number(tier[1]) === 0 ? {} : { tier: Number(tier[1]) }) }
}

/**
 * A `+N` window shows the upgraded numbers; the page is the base item (owner, 2026-10-21, D3). The
 * planner's upgrade rule taken back where it inverts exactly (itemDelevel.ts), offered as a guess.
 */
function tierParts(tier: number | undefined, statsblock: string): Partial<ItemWindowRead> {
  if (tier === undefined) return {}
  const back = delevel(statsblock, tier)
  const why = back.block === undefined ? ` These do not take back to one +0 value: ${back.inexact.join(', ')}.` : ' "Estimate +0 stats" takes them back by the upgrade rule, a guess for you to check.'
  return { tier, ...(back.block === undefined ? {} : { baseStatsblock: back.block }), checks: [`This window is +${String(tier)}: its numbers are the upgraded item's, not the page's.${why}`] }
}

/** The flag line (the last line of flag words above Class, never the tab row), Class and Race, with their notes. */
function headOf(lines: readonly string[], clsAt: number, clsLine: string, raceLine: string | undefined): Head & { flagAt: number; notes: string[] } {
  const flagAt = lines.slice(0, clsAt).map((l) => !isTabRow(l) && isFlagLine(l)).lastIndexOf(true)
  const flags = flagAt < 0 ? [] : flagLine(lines[flagAt])
  const cls = codesOf(clsLine, 'Class')
  const race = raceLine === undefined ? undefined : codesOf(raceLine, 'Race')
  const notes = [...flags.flatMap((f) => (f.note === undefined ? [] : [f.note])), ...(cls?.notes ?? []), ...(race?.notes ?? [])]
  return { flagAt, flags: flags.map((f) => f.value), notes, ...(cls === undefined ? {} : { cls: cls.value }), ...(race === undefined ? {} : { race: race.value }) }
}

/**
 * The Class line: at the line's start (a short OCR mark before it allowed: `By Class: ALL`), with a
 * colon or a class code after the word. A Lore tab's prose (`... - Class 1`, `the highest class of
 * steel`) is not one (review, 2026-10-21).
 */
const CLASS_LINE = new RegExp(`^(?:\\S{1,2}\\s+)?Class\\s*(?:[:;.]|\\s(?:${[...CLASS_CODES, 'ALL', 'NONE'].join('|')})\\b)`, 'i')

/** A line of class or race codes only: a long list the window wrapped onto the next line. */
const onlyCodes = (line: string, codes: readonly string[]): boolean =>
  line.split(/\s+/).every((w) => codes.includes(w.replace(/[^A-Za-z]/g, '').toUpperCase()))

/** The Class or Race line at `at` with the code lines wrapped under it joined on, and the last line it took. */
function listAt(lines: readonly string[], at: number, codes: readonly string[]): { line: string; end: number } {
  let end = at
  while (end + 1 < lines.length && onlyCodes(lines[end + 1], codes)) end++
  return { line: lines.slice(at, end + 1).join(' '), end }
}

/** The Race line under the Class list, with its wrapped codes; none when the window shows none. */
function raceAfter(lines: readonly string[], after: number): { line: string; end: number } | undefined {
  const at = lines.findIndex((l, i) => i > after && /\bRace\s*[:;.]?\s/i.test(l))
  return at < 0 ? undefined : listAt(lines, at, RACE_CODES)
}

export { isTabRow, tabRowAt }

/**
 * A pet illusion under Race: its own line on the page after a blank line (the Werewolf page), never a
 * stat or an unread line. The lines left for the stats, the page's tail, and the read's field.
 */
function petBelow(below: readonly string[]): { rest: string[]; tail: string; read: { petIllusion?: string } } {
  const pet = petIllusionOf(below)
  const rest = below.filter((_, i) => !pet.taken.has(i))
  if (pet.name === undefined) return { rest, tail: '', read: {} }
  return { rest, tail: `\n\n${petIllusionLine(pet.name)}`, read: { petIllusion: pet.name } }
}

/** OCR lines of one item window (top to bottom) -> the page's fields. */
export function readItemWindow(raw: readonly string[]): ItemWindowRead {
  const kept = raw.filter((l) => cleanLine(l) !== '')
  const lines = kept.map((l) => cleanLine(l))
  const clsAt = lines.findIndex((l) => CLASS_LINE.test(l))
  if (clsAt < 0) return loreRead(lines, kept)
  const cls = listAt(lines, clsAt, CLASS_CODES)
  const race = raceAfter(lines, cls.end)
  const head = headOf(lines, clsAt, cls.line, race?.line)
  const below = lines.slice((race ?? cls).end + 1)
  const pet = petBelow(below)
  const g = gather(pet.rest)
  const ratio = checkRatio(g.weapon)
  const statsblock = `\n${statsLines(head, g).map((l) => `${l}<br>`).join('\n')}${pet.tail}`
  const { name, tier } = nameAbove(lines, kept, head.flagAt < 0 ? clsAt : head.flagAt)
  const up = tierParts(tier, statsblock)
  const checks = [...(up.checks ?? []), ...(ratio === undefined ? [] : [ratio]), ...head.notes, ...g.notes]
  return {
    statsblock,
    unread: g.unread,
    ...up,
    ...(checks.length === 0 ? {} : { checks }),
    ...(name === undefined ? {} : { name }),
    ...(hasLoreTab(lines, clsAt) ? { loreTab: true } : {}),
    ...(g.focus === undefined ? {} : { focusEffect: g.focus }),
    ...pet.read,
    ...(g.value === undefined ? {} : { valueCopper: g.value })
  }
}
