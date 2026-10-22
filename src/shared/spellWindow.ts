// spellWindow.ts — the game's spell display window, as OCR read it, into the wiki's Spell Page fields
// (owner, 2026-10-21: "if they have spells up lets do it, anything we can get from an image we should
// be trying to"; plans/2026-10-20-screenshot-to-wiki.md, phase 4).
//
// The window (EQUI_SpellDisplayWindow.xml) is one text box, `SDW_SpellDescription`, and the icon. The
// install's files already state the icon (spells_us.txt field 76), the classes, mana, range, times,
// resist and messages, and the description's own words (dbstr_us.txt type 6) with placeholders
// (`#1`, `@1`, `%z`) the client fills from the spell's numbers (src/main/gapSpellFacts.ts). What the
// window adds is those numbers. The file's words are kept and only the placeholders take the window's
// text, so OCR's slips in the words never reach the page; a window that does not match its file is
// kept as read and the player is told. Labelled lines fill only what the files leave blank.
//
// The labels are the window's own (owner's Burst of Flame window, 2026-10-21): `Spell:`, the class
// line `SHM(1)`, Duration, Level, Skill, Mana, Cast, Recovery, Reuse, Resist, Target, Reflectable,
// Range, the description, `On You:`, `On Other:`. OCR often drops a label's colon (`Cast 1.5 sec`).
// A value the player's modifiers change is drawn after the base in brackets (`Cast: 1.5 sec (0.5)`,
// cyan for better, red for worse; a cast-speed invocation): the page takes the base, never the
// bracket. Reuse is not written: the window shows it in whole seconds (Burst of Flame: `Reuse: 1 sec`
// for the file's and the wiki's 1.50), and Recovery, Level and Reflectable have no page field.

import type { ClientSpellFacts } from './gaps'

export interface SpellWindowRead {
  /** The window's title, when the snip has it: the spell's name. */
  name?: string
  description?: string
  /** Labelled lines the window printed, by the page's key (`duration`, `target_type`, `skill`, ...). */
  fields: Record<string, string>
  /** What the reader doubts, in words, to show the player. */
  checks: string[]
}

/** What main answers for a pasted picture read as text (src/main/ipc/shotIpc.ts). */
export interface ShotTextReply {
  /** The OCR lines, top to bottom. */
  lines: string[]
  ms: number
  /** Set when the picture could not be read at all. */
  error?: string
}

/** What a spell window paste keeps, by the row's name (spellShotsStore); Copy wiki page reads it. */
export interface SpellPageShot {
  description?: string
  fields?: Record<string, string>
}

/** A label the window prints that the page has no field for: read so it is not taken for the description. */
const UNUSED = '-'

/** Window label -> the page's key, longest first so `Casting Time` beats `Cast`. */
const LABELS: readonly (readonly [string, string])[] = [
  ['Recast Time', 'recast_time'], ['Refresh Time', 'recast_time'], ['Casting Time', 'casting_time'], ['Cast Time', 'casting_time'],
  ['Target Type', 'target_type'], ['Spell Type', 'spell_type'], ['Reflectable', UNUSED], ['Duration', 'duration'], ['Recovery', UNUSED],
  ['On Other', 'msg_cast_on_other'], ['On You', 'msg_cast_on_you'], ['Recast', 'recast_time'], ['Target', 'target_type'], ['Resist', 'resist'],
  ['Reuse', UNUSED], ['Range', 'range'], ['Skill', 'skill'], ['Level', UNUSED], ['Spell', UNUSED], ['Mana', 'mana'], ['Cast', 'casting_time']
]
const LABEL_ALT = LABELS.map(([l]) => l.replace(/ /g, '\\s*')).join('|')
const LABEL_RE = new RegExp(`(?:^|\\s)(${LABEL_ALT})\\s*[:;]`, 'gi')
/** A short line that starts with a label whose colon OCR dropped (`Cast 1.5 sec`, `Resist Fire`). */
const BARE_LABEL = new RegExp(`^(${LABEL_ALT})\\s+(\\S.*)$`, 'i')
const keyOf = (hit: string): string | undefined => LABELS.find(([l]) => l.replace(/\s/g, '').toLowerCase() === hit.replace(/\s/g, '').toLowerCase())?.[1]

/** One label's value: its key, the label as printed, the value. */
type Pair = [key: string, label: string, value: string]

/** Every `Label: value` on a line, a value running to the next label. */
function pairsOf(line: string): Pair[] {
  const hits = [...line.matchAll(LABEL_RE)].map((m) => ({ label: m[1], key: keyOf(m[1]), from: (m.index ?? 0) + m[0].indexOf(m[1]), to: (m.index ?? 0) + m[0].length }))
  const pairs = hits.flatMap((h, i) => {
    const value = line.slice(h.to, i + 1 < hits.length ? hits[i + 1].from : line.length).trim()
    return h.key === undefined || value === '' ? [] : [[h.key, h.label, value] as Pair]
  })
  if (pairs.length > 0 || line.split(/\s+/).length > 5) return pairs
  const bare = BARE_LABEL.exec(line)
  const key = bare === null ? undefined : keyOf(bare[1])
  return bare === null || key === undefined ? [] : [[key, bare[1], bare[2].trim()]]
}

/** OCR's junk at a value's end (the scroll bar, the frame): lone marks and single letters (`Instant E |`). */
const unjunk = (v: string): string => v.replace(/(?:\s+(?:[^A-Za-z0-9\s]+|[A-Za-z]))+$/, '').trim()

/**
 * A value and the modified one the window draws after it in brackets (`1.5 sec (0.5)`): the base is
 * the page's. Ticks in brackets are the duration's own words, not a modifier.
 */
export function baseValue(v: string): { base: string; modified?: string } {
  const m = /^(.*?\d.*?)\s*\(([^()]*)\)?$/.exec(v.trim())
  if (m === null || /tick/i.test(m[2]) || m[2].trim() === '') return { base: v.trim() }
  return { base: m[1].trim(), modified: m[2].trim() }
}

/** The window's value as the page writes it: `[[Skill Alteration | Alteration]]`, `1.50` seconds. */
function pageValue(key: string, v: string): string {
  // The wiki writes the other person's message from "Someone"; the window from "Soandso".
  if (key === 'msg_cast_on_other') return v.replace(/^Soandso\b/i, 'Someone')
  if (key === 'skill' && /^[A-Za-z ]+$/.test(v)) return `[[Skill ${v} | ${v}]]`
  const secs = /^(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds)?$/i.exec(v)
  if ((key === 'casting_time' || key === 'recast_time') && secs !== null) return Number(secs[1]).toFixed(2)
  return v.replace(/\s*(?:ft|feet)$/i, '')
}

// ---- the description ----------------------------------------------------------------------------

/** The client's placeholders: `#1` base, `@1` max, `$1`, `%z` duration, `%T` targets, ... */
const PLACEHOLDER = /[#@$]\d+|%[A-Za-z]/g

/** The file's description when it has no placeholder: then it is the text the window shows, word for word. */
export function fileDescription(d: string | undefined): string | undefined {
  return d === undefined || d === '' || new RegExp(PLACEHOLDER.source).test(d) ? undefined : d
}

/** One literal character, loosely: OCR's usual slips (rn for m, l/I/1, O/0) and dropped punctuation. */
function loose(ch: string, strict: boolean): string {
  if (/\s/.test(ch)) return '\\s*'
  if (/[mM]/.test(ch)) return '(?:m|rn)'
  if (/[lIi1]/.test(ch)) return '[lIi1|!]'
  if (/[oO0]/.test(ch)) return '[oO0]'
  if (/[A-Za-z0-9]/.test(ch)) return ch
  return strict ? '[^A-Za-z0-9\\s]' : '[^A-Za-z0-9\\s]?'
}

/** `strict`: punctuation must be there (the sentence's last mark is what ends the last hole). */
const literal = (s: string, strict = false): string =>
  // `rn` read as `m` too (Burst of Flame's `burns` came back `bums`).
  s.replace(/<br>/gi, ' ').replace(/\s+/g, ' ').replace(/rn|[\s\S]/g, (ch) => (ch === 'rn' ? '(?:rn|m)' : loose(ch, strict)))

/**
 * The file's words with the window's numbers: each placeholder takes the text the window shows in
 * its place. Undefined when the window's text does not follow the file's (another rank, a misread).
 */
export function fillTemplate(template: string, text: string): string | undefined {
  const parts = template.split(PLACEHOLDER)
  if (parts.length < 2) return undefined
  // Each hole is short (a number, `54 min`, `18 secs (3 ticks)`); the last one runs to the line's end.
  const holes = parts.map((p, i) => (i < parts.length - 1 ? `${literal(p)}\\s*(.{1,40}?)\\s*` : literal(p, true)))
  // The end is a word's end: else a lazy last hole stops after one character (`for %z.` read `for 5`).
  const m = new RegExp(`${holes.join('')}(?=\\s|$)`, 'i').exec(text.replace(/\s+/g, ' '))
  if (m === null) return undefined
  let at = 0
  return template.replace(PLACEHOLDER, () => (m[++at] ?? '').trim())
}

// ---- the window ---------------------------------------------------------------------------------

/** Words, not OCR's junk off the frame: three words or more, mostly letters. */
const prose = (l: string): boolean => l.split(/\s+/).length >= 3 && (l.match(/[A-Za-z ]/g) ?? []).length >= 0.7 * l.length

/** A spell's effect slot line (`1: Increase Hitpoints by 20`): not the description. */
const SLOT_LINE = /^(?:Slot\s*)?\d{1,2}\s*[:.]/i

/** The title line: short, no label, not a sentence. */
const titleOf = (l: string | undefined): string | undefined =>
  l !== undefined && l.split(/\s+/).length <= 6 && pairsOf(l).length === 0 && !/[.!?]$/.test(l) && /[A-Za-z]{3}/.test(l) ? l.replace(/^[^A-Za-z]+|[^A-Za-z)]+$/g, '') : undefined

/** Lines of the window that are not the spell's: the upgrade block a Legends spell shows. */
const NOT_SPELL = /^This spell can be upgraded|^Tier\s*\d|^Upgrade\b|^Place Mote\b/i

const SPELL_LINE = /\bSpell\s*[:;]\s*(.+)$/i

/** The name from the title bar or the box's first line, `Spell: Burst of Flame` (junk at either end dropped). */
function spellLabelName(lines: readonly string[]): string | undefined {
  const at = lines.map((l) => SPELL_LINE.exec(l)?.[1]).find((n) => n !== undefined)
  const name = at === undefined ? '' : unjunk(at.replace(/^[^A-Za-z]+|[^A-Za-z)]+$/g, ''))
  return name === '' ? undefined : name
}

/** OCR lines of one spell display window (top to bottom) -> the page's fields. `template`: the file's description. */
export function readSpellWindow(raw: readonly string[], template?: string): SpellWindowRead {
  const all = raw.map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l !== '')
  // What is above the first `Spell:` line is the title bar and the frame's junk.
  const lines = all.slice(Math.max(0, all.findIndex((l) => SPELL_LINE.test(l))))
  const titled = titleOf(lines[0])
  const name = spellLabelName(lines) ?? titled
  const fields: Record<string, string> = {}
  const modified: string[] = []
  const text: string[] = []
  let wrapping = false
  for (const line of lines.slice(titled === undefined ? 0 : 1)) {
    const pairs = pairsOf(line)
    takePairs(pairs, fields, modified)
    // A short line right after the description is its wrapped end (`damage.`).
    wrapping = pairs.length === 0 && descriptionLine(line, name) && (prose(line) || (wrapping && /[a-z]{3}/i.test(line)))
    if (wrapping) text.push(line)
  }
  const told = describe(text.join(' '), template)
  const checks = modified.length === 0 ? told.checks : [...told.checks, `A modifier was active (${modified.join(', ')}): the page keeps the base values.`]
  return { fields, ...(name === undefined ? {} : { name }), ...told, checks }
}

/** A line's labelled values into the page's fields (the base value); the modified values it showed into `modified`. */
function takePairs(pairs: readonly Pair[], fields: Record<string, string>, modified: string[]): void {
  for (const [k, label, v] of pairs) {
    const { base, modified: mod } = baseValue(unjunk(v))
    if (mod !== undefined) modified.push(`${label} ${mod}`)
    if (k !== UNUSED) fields[k] ??= pageValue(k, base)
  }
}

const squash = (l: string): string => l.toLowerCase().replace(/[^a-z]/g, '')

/** Not an effect slot, the upgrade block, or the name again inside the box (a heading). */
const descriptionLine = (line: string, name: string | undefined): boolean =>
  !SLOT_LINE.test(line) && !NOT_SPELL.test(line) && squash(line) !== squash(name ?? '')

/**
 * Why a spell window paste kept nothing, in plain words, with what to do (owner, 2026-10-21: "just
 * says error without a reason").
 */
export function spellProblem(reply: ShotTextReply): string {
  if (reply.error !== undefined) return `${reply.error} Paste a screenshot (PNG or JPEG) of the spell display window.`
  const words = reply.lines.map((l) => l.trim()).find((l) => /[A-Za-z]{3}.*[A-Za-z]{3}/.test(l))
  if (words === undefined) return 'No text was found in this picture. Snip the spell display window (Win+Shift+S) and paste it again.'
  return `Text was read ("${words.length > 40 ? `${words.slice(0, 40)}…` : words}"), but not a spell display window (no description and fewer than two lines such as Mana: or Cast:). Snip the whole window.`
}

/** The description: the file's words with the window's numbers, else as read with a word to the player. */
function describe(asRead: string, template: string | undefined): { description?: string; checks: string[] } {
  if (asRead === '') return { checks: [] }
  const filled = template === undefined ? undefined : fillTemplate(template, asRead)
  if (filled !== undefined) return { description: filled, checks: [] }
  // A file with no placeholder is the page's description already (spellPageValues); the read is not used.
  const doubt = fileDescription(template) === undefined ? ["The description is as read (it did not follow the game's own words): check it."] : []
  return { description: asRead, checks: doubt }
}

/** A spell window paste counts when it gave a description or two labelled lines; a stray picture gives neither. */
export function isSpellWindow(r: SpellWindowRead): boolean {
  return (r.description !== undefined && r.description.split(/\s+/).length >= 4) || Object.keys(r.fields).length >= 2
}

// ---- the page -----------------------------------------------------------------------------------

/**
 * The page's values, by key: what the files state, then the window's lines where the files say
 * nothing. The description is the file's own words when they hold no placeholder, else the window's.
 */
export function spellPageValues(c: ClientSpellFacts | undefined, shot: SpellPageShot | undefined): Record<string, string> {
  const out: Record<string, string> = { ...shot?.fields }
  const description = fileDescription(c?.description) ?? shot?.description
  if (description !== undefined) out.description = description
  if (c === undefined) return out
  const files: Record<string, string | number | undefined> = {
    spellicon: c.icon,
    mana: c.mana,
    range: c.range,
    casting_time: c.castTime,
    recast_time: c.recastTime,
    resist: c.resist,
    msg_cast_on_you: c.msgOnYou,
    msg_cast_on_other: c.msgOnOther,
    msg_wears_off: c.msgWearsOff
  }
  for (const [k, v] of Object.entries(files)) if (v !== undefined && v !== '') out[k] = String(v)
  return out
}

/** The Spell Page Blueprint's order around `classes`. */
export const SPELL_HEAD = ['spellicon', 'description'] as const
export const SPELL_TAIL = ['skill', 'mana', 'range', 'casting_time', 'recast_time', 'duration', 'target_type', 'spell_type', 'resist', 'msg_cast_on_you', 'msg_cast_on_other', 'msg_wears_off'] as const
