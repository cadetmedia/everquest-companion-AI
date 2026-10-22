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
import { CLASS_CODES, codeWords, deityText, FLAG_WORDS, isDeityLine, RACE_CODES, SIZES, slotWord, snap, type Snapped } from './itemVocab'

export interface ItemWindowRead {
  /** The coloured name line, a `+N` tier dropped. OCR may run words together; the caller's name wins. */
  name?: string
  /** `|statsblock` as the page holds it: a leading newline, one `<br>` line each. Empty for a Lore tab. */
  statsblock: string
  /** `|focus_effect`: the wiki keeps a focus outside the stats block. */
  focusEffect?: string
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

/** The window's slot words (eqstr_us.txt 559-576, Charm, Power Source), the plurals it prints included. */
const SLOT_WORDS = new Set([
  'charm', 'ear', 'ears', 'head', 'face', 'neck', 'shoulders', 'shoulder', 'arms', 'back', 'wrist', 'wrists', 'range',
  'hands', 'primary', 'secondary', 'finger', 'fingers', 'chest', 'legs', 'feet', 'waist', 'ammo', 'power', 'source'
])

/** Window label -> the wiki's key. `kind` decides the line it lands on. */
type Kind = 'attr' | 'save' | 'ac' | 'weapon' | 'wt' | 'size' | 'value' | 'line' | 'bag' | 'effect' | 'effectInfo' | 'skip'
// The window's own labels are the client's strings (eqstr_us.txt 12999-13045: `Weight:`, `End:`,
// `Dmg Bon:`, `Rec Level:`, `Req Level:` ...). `line` kinds are written as the wiki's pages write them.
const LABELS: readonly (readonly [string, string, Kind])[] = [
  ['Strength', 'STR', 'attr'], ['Stamina', 'STA', 'attr'], ['Agility', 'AGI', 'attr'], ['Dexterity', 'DEX', 'attr'],
  ['Wisdom', 'WIS', 'attr'], ['Intelligence', 'INT', 'attr'], ['Charisma', 'CHA', 'attr'],
  ['HP Regen', 'HP Regen', 'attr'], ['Mana Regen', 'Mana Regen', 'attr'], ['Endurance Regen', 'End Regen', 'attr'],
  ['End Regen', 'End Regen', 'attr'], ['End', 'END', 'attr'],
  ['HP', 'HP', 'attr'], ['Mana', 'MANA', 'attr'], ['Endurance', 'END', 'attr'],
  ['Haste', 'Haste', 'attr'], ['Attack', 'Attack', 'attr'], ['Accuracy', 'Accuracy', 'attr'], ['Avoidance', 'Avoidance', 'attr'],
  ['Damage Shield', 'Damage Shield', 'attr'], ['Spell Shield', 'Spell Shield', 'attr'], ['DoT Shielding', 'DoT Shielding', 'attr'],
  ['Shielding', 'Shielding', 'attr'], ['Stun Resist', 'Stun Resist', 'attr'], ['Strikethrough', 'Strikethrough', 'attr'],
  ['Combat Effects', 'Combat Effects', 'attr'], ['Heal Amount', 'Heal Amount', 'attr'], ['Spell Damage', 'Spell Damage', 'attr'],
  ['Clairvoyance', 'Clairvoyance', 'attr'],
  ['SV Magic', 'SV MAGIC', 'save'], ['SV Fire', 'SV FIRE', 'save'], ['SV Cold', 'SV COLD', 'save'], ['SV Disease', 'SV DISEASE', 'save'],
  ['SV Poison', 'SV POISON', 'save'], ['SV Corruption', 'SV CORRUPTION', 'save'], ['SV Void', 'SV VOID', 'save'],
  ['AC', 'AC', 'ac'],
  ['Base Dmg', 'DMG', 'weapon'], ['Bane Dmg', 'Bane DMG', 'weapon'], ['Backstab', 'BACKSTAB', 'weapon'], ['Delay', 'Atk Delay', 'weapon'],
  ['Skill', 'Skill', 'weapon'], ['Range', 'Range', 'weapon'], ['Ratio', 'Ratio', 'weapon'], ['Dmg Bon', 'Dmg Bon', 'weapon'],
  ['Weight', 'WT', 'wt'], ['Size', 'Size', 'size'], ['Value', 'Value', 'value'], ['Charges', 'Charges', 'line'],
  ['Rec Level', 'Recommended level', 'line'], ['Req Level', 'Required level', 'line'],
  // A container: the pages write `Weight Reduction: 0%` and `Capacity: 6 Size Capacity: SMALL` (205 pages).
  ['Capacity', 'Capacity', 'bag'], ['Size Cap', 'Size Capacity', 'bag'], ['Size Capacity', 'Size Capacity', 'bag'], ['Weight Reduction', 'Weight Reduction', 'bag'],
  ['Focus Effect', 'Focus', 'effect'], ['Click Effect', 'Click', 'effect'], ['Worn Effect', 'Worn', 'effect'],
  ['Proc Effect', 'Combat', 'effect'], ['Combat Effect', 'Combat', 'effect'],
  ['Cast Time', 'Casting Time', 'effectInfo'], ['Casting Time', 'Casting Time', 'effectInfo'],
  ['Required Level', 'Level', 'effectInfo'], ['Cooldown', 'Cooldown', 'skip'], ['Recast', 'Cooldown', 'skip']
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
const NOT_ITEM = /\b(Exaltation|O\w{0,2}amentation|Unmodified|Modified|Merge|Place\s*Item|Tier|upgraded|placeable in|Description|Container\W+(?:OPEN|CLOSED))\b/i

// ---- small readers ------------------------------------------------------------------------------

/** OCR junk off both ends: a misread icon edge (`8 Quest`, `++ Ruined Robe`, `| Class`), a stray `:`. */
export function cleanLine(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    // leading tokens with no two letters or digits in a row: `++`, `8`, `S—`, `|`
    .replace(/^(?:(?![^\s]*[A-Za-z0-9]{2})[^\s]+\s+)+/, '')
    // a trailing lone mark, a lone lower-case letter, or any lone character after a number
    .replace(/(?:\s+[^A-Za-z0-9%)]{1,3}|\s+[a-z]|(?<=\d%?)\s+\S)+$/, '')
    .trim()
}

const SIGNED = /^[+-]?\d+(?:\.\d+)?%?$/

/** `15` -> `+15`, `-20` stays; anything not a number is kept as read. */
function signed(v: string): string {
  return SIGNED.test(v) && !/^[+-]/.test(v) ? `+${v}` : v
}

/** OCR loses Weight's point (`2.0` -> `20`, `0.4` -> `04`); the game always prints one decimal. */
export function weightValue(v: string): string {
  const t = v.replace(',', '.').replace(/[^0-9.]/g, '')
  if (/^\d+\.\d$/.test(t)) return t
  return /^\d{2,}$/.test(t) ? `${String(Number(t.slice(0, -1)))}.${t.slice(-1)}` : t
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

/**
 * The slot line: bare slot words, every slot the item fits (`Chest`; `Primary, Secondary` or
 * `Primary Secondary`), as the wiki writes them (`PRIMARY SECONDARY`). The window is the only source
 * of Slot (owner, 2026-10-21: the inventory export names one worn slot of several).
 */
export function slotOf(line: string): string | undefined {
  const words = line.toLowerCase().split(/[\s,/]+/).filter(Boolean)
  if (words.length === 0 || !words.every((w) => SLOT_WORDS.has(w))) return undefined
  const slots = words.join(' ').replace(/\bpower source\b/g, 'power_source').split(' ')
  return [...new Set(slots.map((w) => slotWord(w.replace('_', ' ')).value))].join(' ')
}

// ---- label pairs --------------------------------------------------------------------------------

interface Pair {
  key: string
  kind: Kind
  value: string
}

/** Every `label value` on a line, a value running to the next label. */
export function pairsOf(line: string): Pair[] {
  LABEL_RE.lastIndex = 0
  const hits: { def: readonly [string, string, Kind]; from: number; to: number }[] = []
  for (const m of line.matchAll(LABEL_RE)) {
    const def = labelOf(m[1])
    const from = (m.index ?? 0) + m[0].indexOf(m[1])
    if (def !== undefined) hits.push({ def, from, to: (m.index ?? 0) + m[0].length })
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
}

/** A snapped value's note into the gathered notes; the value back. */
const noted = (g: Gathered, v: { value: string; note?: string }): string => {
  if (v.note !== undefined) g.notes.push(v.note)
  return v.value
}

/** `Firestrike (Must Equip)` + the info lines under it -> `[[Firestrike]] (Must Equip, Casting Time: Instant) at Level 40`. */
function effectLine(kind: string, value: string, info: ReadonlyMap<string, string>): string {
  const m = /^(.*?)\s*(?:\(([^)]*)\))?$/.exec(value) ?? ['', value]
  const name = rankFix((m[1] ?? value).trim())
  const notes = [kind === 'Click' ? m[2] : kind, info.has('Casting Time') ? `Casting Time: ${info.get('Casting Time') ?? ''}` : undefined].filter(
    (s): s is string => s !== undefined && s !== ''
  )
  const level = info.get('Level')
  return `Effect: [[${name}]]${notes.length > 0 ? ` (${notes.join(', ')})` : ''}${level === undefined ? '' : ` at Level ${level}`}`
}

interface Effect {
  kind: string
  value: string
  info: Map<string, string>
}

/** `Rec Level: 10` -> `Recommended level of 10.` (the pages' words); `Charges: 5` as it stands. */
const wikiLine = (p: Pair): string => (p.key.endsWith('level') ? `${p.key} of ${p.value.replace(/\.$/, '')}.` : `${p.key}: ${p.value}`)

/** Each kind's place in the gathered lines. */
const PLACE: Record<Kind, (g: Gathered, p: Pair, lastEffect: Effect | null) => void> = {
  attr: (g, p) => g.attrs.push(`${p.key}: ${signed(p.value)}`),
  save: (g, p) => g.saves.push(`${p.key}: ${signed(p.value)}`),
  ac: (g, p) => (g.ac = p.value),
  weapon: (g, p) => g.weapon.set(p.key, p.value),
  wt: (g, p) => (g.wt = weightValue(p.value)),
  size: (g, p) => (g.size = noted(g, snap(p.value.split(/\s+/)[0] ?? '', SIZES, 'Size'))),
  value: (g, p) => (g.value = valueCopper(p.value)),
  line: (g, p) => g.lines.push(wikiLine(p)),
  bag: (g, p) => g.bag.set(p.key, p.key === 'Size Capacity' ? noted(g, snap(p.value.split(/\s+/)[0] ?? '', SIZES, 'Size Capacity')) : p.value),
  effectInfo: (_g, p, lastEffect) => lastEffect?.info.set(p.key, p.value.replace(/\s+seconds?$/i, '')),
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

/** One line of the stats region into `g`: the bare slot word, or its pairs, or an unread line. */
function gatherLine(g: Gathered, effects: Effect[], line: string): void {
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
  const g: Gathered = { attrs: [], saves: [], weapon: new Map(), lines: [], bag: new Map(), effects: [], unread: [], notes: [] }
  const effects: Effect[] = []
  for (const line of lines) gatherLine(g, effects, line)
  for (const e of effects) {
    if (e.kind === 'Focus') g.focus = rankFix(e.value.replace(/\s*\(.*\)$/, ''))
    else g.effects.push(effectLine(e.kind, e.value, e.info))
  }
  return g
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

/** The tab row reads as junk around `Description` (`| /~ SPDesciption 3, © [[ 4" “Lore`). */
const TAB_ROW = /Des\w{0,4}ption/i

/**
 * The Lore tab: no Class line; its text is what follows the tab row, a wrapped lore joined back into
 * one line. With no tab row read, the longest line that is not a tab word.
 */
function loreRead(lines: readonly string[]): ItemWindowRead {
  const tabAt = lines.findIndex((l) => TAB_ROW.test(l))
  // Words, not OCR's junk off the frame: mostly letters and spaces.
  const prose = (l: string): boolean => !/^Lore$/i.test(l) && !TAB_ROW.test(l) && /[a-z]{3}/i.test(l) && (l.match(/[A-Za-z ]/g) ?? []).length >= 0.8 * l.length
  const text = tabAt >= 0 ? lines.slice(tabAt + 1).filter(prose).join(' ') : lines.filter(prose).sort((a, b) => b.length - a.length)[0]
  return { statsblock: '', unread: [], ...(text === undefined || text === '' ? {} : { lore: text }) }
}

/** The tab row above the name names a Lore tab: the item has lore (Ruined Robe; Windstriker and Black Lizard Scale show none). */
const hasLoreTab = (lines: readonly string[], before: number): boolean =>
  lines.slice(0, before).some((l) => TAB_ROW.test(l) && /\bLore\b(?!\s*(Equipped|Item))/i.test(l))

/** The name: the line above the flags line, else above Class; junk dropped, a `+N` tier apart. */
function nameAbove(lines: readonly string[], at: number): { name?: string; tier?: number } {
  const line = lines.slice(0, at).reverse().find((l) => /[A-Za-z]{2}/.test(l) && !NOT_ITEM.test(l))
  if (line === undefined) return {}
  const tier = /\s*\+(\d{1,2})$/.exec(line)
  return { name: line.replace(/\s*\+\d+$/, '').trim(), ...(tier === null || tier[1] === '0' ? {} : { tier: Number(tier[1]) }) }
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

/** The flag line (the last line above Class naming a flag, never the tab row), Class and Race, with their notes. */
function headOf(lines: readonly string[], clsAt: number, raceAt: number): Head & { flagAt: number; notes: string[] } {
  const flagAt = lines.slice(0, clsAt).map((l) => !TAB_ROW.test(l) && flagsOf(l).length > 0).lastIndexOf(true)
  const flags = flagAt < 0 ? [] : flagLine(lines[flagAt])
  const cls = codesOf(lines[clsAt], 'Class')
  const race = raceAt < 0 ? undefined : codesOf(lines[raceAt], 'Race')
  const notes = [...flags.flatMap((f) => (f.note === undefined ? [] : [f.note])), ...(cls?.notes ?? []), ...(race?.notes ?? [])]
  return { flagAt, flags: flags.map((f) => f.value), notes, ...(cls === undefined ? {} : { cls: cls.value }), ...(race === undefined ? {} : { race: race.value }) }
}

/** OCR lines of one item window (top to bottom) -> the page's fields. */
export function readItemWindow(raw: readonly string[]): ItemWindowRead {
  const lines = raw.map(cleanLine).filter((l) => l !== '')
  const clsAt = lines.findIndex((l) => /\bClass\s*[:;.]?\s/i.test(l))
  if (clsAt < 0) return loreRead(lines)
  const raceAt = lines.findIndex((l, i) => i > clsAt && /\bRace\s*[:;.]?\s/i.test(l))
  const head = headOf(lines, clsAt, raceAt)
  const g = gather(lines.slice((raceAt < 0 ? clsAt : raceAt) + 1))
  const ratio = checkRatio(g.weapon)
  const statsblock = `\n${statsLines(head, g).map((l) => `${l}<br>`).join('\n')}`
  const { name, tier } = nameAbove(lines, head.flagAt < 0 ? clsAt : head.flagAt)
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
    ...(g.value === undefined ? {} : { valueCopper: g.value })
  }
}
