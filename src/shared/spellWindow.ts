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
// No spell-window screenshot was on hand when this was written: the labels are the client's own
// strings (eqstr_us.txt: `Mana: %1`, `Duration: %1`, `Range: %1`, `Resist: `, `Target: `, `Skill: %1`).

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

/** Window label -> the page's key, longest first so `Casting Time` beats `Cast`. */
const LABELS: readonly (readonly [string, string])[] = [
  ['Recast Time', 'recast_time'], ['Refresh Time', 'recast_time'], ['Casting Time', 'casting_time'], ['Cast Time', 'casting_time'],
  ['Target Type', 'target_type'], ['Spell Type', 'spell_type'], ['Duration', 'duration'], ['Recast', 'recast_time'],
  ['Target', 'target_type'], ['Resist', 'resist'], ['Range', 'range'], ['Skill', 'skill'], ['Mana', 'mana'], ['Cast', 'casting_time']
]
const LABEL_RE = new RegExp(`(?:^|\\s)(${LABELS.map(([l]) => l.replace(/ /g, '\\s*')).join('|')})\\s*[:;]`, 'gi')
const keyOf = (hit: string): string | undefined => LABELS.find(([l]) => l.replace(/\s/g, '').toLowerCase() === hit.replace(/\s/g, '').toLowerCase())?.[1]

/** Every `Label: value` on a line, a value running to the next label. */
function pairsOf(line: string): [string, string][] {
  const hits = [...line.matchAll(LABEL_RE)].map((m) => ({ key: keyOf(m[1]), from: (m.index ?? 0) + m[0].indexOf(m[1]), to: (m.index ?? 0) + m[0].length }))
  return hits.flatMap((h, i) => {
    const value = line.slice(h.to, i + 1 < hits.length ? hits[i + 1].from : line.length).trim()
    return h.key === undefined || value === '' ? [] : [[h.key, value] as [string, string]]
  })
}

/** The window's value as the page writes it: `[[Skill Alteration | Alteration]]`, `1.50` seconds. */
function pageValue(key: string, v: string): string {
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
const literal = (s: string, strict = false): string => s.replace(/<br>/gi, ' ').replace(/\s+/g, ' ').replace(/[\s\S]/g, (ch) => loose(ch, strict))

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

/** OCR lines of one spell display window (top to bottom) -> the page's fields. `template`: the file's description. */
export function readSpellWindow(raw: readonly string[], template?: string): SpellWindowRead {
  const lines = raw.map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l !== '')
  const name = titleOf(lines[0])
  const fields: Record<string, string> = {}
  const text: string[] = []
  const squash = (l: string): string => l.toLowerCase().replace(/[^a-z]/g, '')
  for (const line of lines.slice(name === undefined ? 0 : 1)) {
    const pairs = pairsOf(line)
    for (const [k, v] of pairs) fields[k] ??= pageValue(k, v)
    // The name again inside the box is a heading, not the description.
    if (pairs.length === 0 && !SLOT_LINE.test(line) && prose(line) && squash(line) !== squash(name ?? '')) text.push(line)
  }
  return { fields, ...(name === undefined ? {} : { name }), ...describe(text.join(' '), template) }
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
