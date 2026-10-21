// itemWindow.ts — the game's item window, as OCR read it, turned into the wiki's Item Page lines
// (owner ask, 2026-10-21: paste a screenshot of the item, get the page's statsblock).
//
// The window is not the wiki's layout (plans/2026-10-20-screenshot-to-wiki.md, "First real
// screenshot"): two or three columns, long names (`Charisma:`, `SV. Magic:`), the slot as a bare
// word, the flags as the tooltip prints them. The target is the page the owner wrote for Ruined
// Robe (2026-10-21): classic caps flags two spaces apart, `Slot: CHEST`, short stat names with a
// sign, every SV on one line, `WT:` before `Size:`, Class and Race last.
//
// Labels are found anywhere in a line, never by position: each UI skin lays the window out its own
// way, and OCR drops colons, joins columns and puts junk at line ends. A number is never guessed;
// the one repair is Weight's decimal, which the game always prints and OCR loses (3 windows of 3).

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

/** Tooltip flag words -> the classic caps the owner's page writes, in the window's order. */
const FLAGS: readonly (readonly [RegExp, string])[] = [
  [/\bmagic( item)?\b/i, 'MAGIC ITEM'],
  [/\blore( equipped| item)?\b/i, 'LORE ITEM'],
  [/\bno (trade|drop)\b/i, 'NO DROP'],
  [/\b(temporary|no rent)\b/i, 'TEMPORARY'],
  [/\bquest( item)?\b/i, 'QUEST ITEM'],
  [/\bno storage\b/i, 'NO STORAGE'],
  [/\battunable\b/i, 'ATTUNABLE'],
  [/\bexpendable\b/i, 'EXPENDABLE'],
  [/\bplaceable\b/i, 'PLACEABLE'],
  [/\bheirloom\b/i, 'HEIRLOOM'],
  [/\bartifact\b/i, 'ARTIFACT'],
  [/\baugmentation\b/i, 'AUGMENTATION']
]

const SLOT_WORDS = new Set([
  'charm', 'ear', 'ears', 'head', 'face', 'neck', 'shoulders', 'shoulder', 'arms', 'back', 'wrist', 'wrists', 'range',
  'hands', 'primary', 'secondary', 'finger', 'fingers', 'chest', 'legs', 'feet', 'waist', 'ammo', 'power', 'source'
])

/** Window label -> the wiki's key. `kind` decides the line it lands on. */
type Kind = 'attr' | 'save' | 'ac' | 'weapon' | 'wt' | 'size' | 'value' | 'effect' | 'effectInfo' | 'skip'
const LABELS: readonly (readonly [string, string, Kind])[] = [
  ['Strength', 'STR', 'attr'], ['Stamina', 'STA', 'attr'], ['Agility', 'AGI', 'attr'], ['Dexterity', 'DEX', 'attr'],
  ['Wisdom', 'WIS', 'attr'], ['Intelligence', 'INT', 'attr'], ['Charisma', 'CHA', 'attr'],
  ['HP Regen', 'HP Regen', 'attr'], ['Mana Regen', 'Mana Regen', 'attr'], ['Endurance Regen', 'End Regen', 'attr'],
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
  ['Skill', 'Skill', 'weapon'], ['Range', 'Range', 'weapon'], ['Ratio', 'Ratio', 'weapon'],
  ['Weight', 'WT', 'wt'], ['Size', 'Size', 'size'], ['Value', 'Value', 'value'], ['Charges', 'Charges', 'attr'],
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
const NOT_ITEM = /\b(Exaltation|O\w{0,2}amentation|Unmodified|Modified|Merge|Place\s*Item|Tier|upgraded|placeable in|Description)\b/i

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

function flagsOf(line: string): string[] {
  const hits = FLAGS.flatMap(([re, word]) => {
    const m = re.exec(line)
    return m === null ? [] : [{ at: m.index, word }]
  })
  return hits.sort((a, b) => a.at - b.at).map((h) => h.word)
}

/** `Class: NEC WIZ MAG ENC` -> the codes upper-cased; `None` and `ALL` as the game prints them. */
function codesOf(line: string, label: string): string | undefined {
  const m = new RegExp(`${label}\\s*[:;.]?\\s*(.+)$`, 'i').exec(line)
  if (m === null) return undefined
  const codes = m[1].split(/\s+/).filter((w) => /^[A-Za-z]{2,4}$/.test(w))
  return codes.length > 0 ? codes.join(' ').toUpperCase() : undefined
}

function slotOf(line: string): string | undefined {
  const words = line.toLowerCase().split(/\s+/)
  return words.length > 0 && words.every((w) => SLOT_WORDS.has(w)) ? line.toUpperCase() : undefined
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
  effects: string[]
  focus?: string
  unread: string[]
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

function placePair(g: Gathered, p: Pair, lastEffect: { kind: string; value: string; info: Map<string, string> } | null): void {
  if (p.kind === 'attr') g.attrs.push(`${p.key}: ${signed(p.value)}`)
  else if (p.kind === 'save') g.saves.push(`${p.key}: ${signed(p.value)}`)
  else if (p.kind === 'ac') g.ac = p.value
  else if (p.kind === 'weapon') g.weapon.set(p.key, p.value)
  else if (p.kind === 'wt') g.wt = weightValue(p.value)
  else if (p.kind === 'size') g.size = p.value.split(/\s+/)[0]?.toUpperCase()
  else if (p.kind === 'value') g.value = valueCopper(p.value)
  else if (p.kind === 'effectInfo' && lastEffect !== null) lastEffect.info.set(p.key, p.value.replace(/\s+seconds?$/i, ''))
}

interface Effect {
  kind: string
  value: string
  info: Map<string, string>
}

/** One line of the stats region into `g`: the bare slot word, or its pairs, or an unread line. */
function gatherLine(g: Gathered, effects: Effect[], line: string): void {
  if (NOT_ITEM.test(line)) return
  const slot = g.slot === undefined && g.attrs.length + g.saves.length === 0 ? slotOf(line) : undefined
  if (slot !== undefined) {
    g.slot = slot
    return
  }
  const pairs = pairsOf(line)
  if (pairs.length === 0 && /[A-Za-z]{3}/.test(line)) g.unread.push(line)
  for (const p of pairs) {
    if (p.kind === 'effect') effects.push({ kind: p.key, value: p.value, info: new Map() })
    else placePair(g, p, effects.at(-1) ?? null)
  }
}

/** The stats region, line by line: pairs placed, effects gathered with the info lines under them. */
function gather(lines: readonly string[]): Gathered {
  const g: Gathered = { attrs: [], saves: [], weapon: new Map(), effects: [], unread: [] }
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
  const rest = ['DMG', 'Bane DMG', 'BACKSTAB', 'Range'].filter((k) => w.has(k)).map((k) => `${k}: ${w.get(k) ?? ''}`)
  return [...(skill.length > 0 ? [skill.join('  ')] : []), ...rest]
}

function statsLines(flags: readonly string[], g: Gathered, cls?: string, race?: string): string[] {
  const out: string[] = []
  if (flags.length > 0) out.push(flags.join('  '))
  if (g.slot !== undefined) out.push(`Slot: ${g.slot}`)
  out.push(...weaponLines(g.weapon))
  if (g.ac !== undefined) out.push(`AC: ${g.ac}`)
  if (g.attrs.length > 0) out.push(byAttrOrder(g.attrs).join('  '))
  if (g.saves.length > 0) out.push(g.saves.join('  '))
  out.push(...g.effects)
  const wtSize = [g.wt === undefined ? '' : `WT: ${g.wt}`, g.size === undefined ? '' : `Size: ${g.size}`].filter(Boolean)
  if (wtSize.length > 0) out.push(wtSize.join('  '))
  if (cls !== undefined) out.push(`Class: ${cls}`)
  if (race !== undefined) out.push(`Race: ${race}`)
  return out
}

/** The Lore tab: no Class line; its text is the longest line that is not a tab or the title. */
function loreRead(lines: readonly string[]): ItemWindowRead {
  const text = lines.filter((l) => !/^(Description|Lore)$/i.test(l) && /[a-z]{3}/i.test(l)).sort((a, b) => b.length - a.length)[0]
  return { statsblock: '', unread: [], ...(text === undefined ? {} : { lore: text }) }
}

/** The name: the line above the flags line, else above Class; junk and a `+N` tier dropped. */
function nameAbove(lines: readonly string[], at: number): string | undefined {
  const line = lines.slice(0, at).reverse().find((l) => /[A-Za-z]{2}/.test(l) && !NOT_ITEM.test(l))
  return line?.replace(/\s*\+\d+$/, '').trim()
}

/** OCR lines of one item window (top to bottom) -> the page's fields. */
export function readItemWindow(raw: readonly string[]): ItemWindowRead {
  const lines = raw.map(cleanLine).filter((l) => l !== '')
  const clsAt = lines.findIndex((l) => /\bClass\s*[:;.]?\s/i.test(l))
  if (clsAt < 0) return loreRead(lines)
  const above = lines.slice(0, clsAt).map((l) => flagsOf(l).length > 0)
  const flagAt = above.lastIndexOf(true)
  const raceAt = lines.findIndex((l, i) => i > clsAt && /\bRace\s*[:;.]?\s/i.test(l))
  const g = gather(lines.slice((raceAt < 0 ? clsAt : raceAt) + 1))
  const ratio = checkRatio(g.weapon)
  const block = statsLines(flagAt < 0 ? [] : flagsOf(lines[flagAt]), g, codesOf(lines[clsAt], 'Class'), raceAt < 0 ? undefined : codesOf(lines[raceAt], 'Race'))
  const name = nameAbove(lines, flagAt < 0 ? clsAt : flagAt)
  return {
    statsblock: `\n${block.map((l) => `${l}<br>`).join('\n')}`,
    unread: g.unread,
    ...(ratio === undefined ? {} : { checks: [ratio] }),
    ...(name === undefined ? {} : { name }),
    ...(g.focus === undefined ? {} : { focusEffect: g.focus }),
    ...(g.value === undefined ? {} : { valueCopper: g.value })
  }
}
