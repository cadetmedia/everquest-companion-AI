// shared/questJournal.ts — a pasted Quest Journal window, read by fixed rules (owner, 2026-10-22: "quest
// pages worked out from the log and the Quest Journal"; no AI). Main reads its text on this machine
// (src/main/shot/journalLines.ts: the dark rock skin thresholded away, the text doubled, then the same
// tesseract read as an item window), with how bright each line's background is, so the selected task
// row (a grey bar) is known. Here the lines become:
//
//   * THE TASK ROWS: `Q <title> <time left> <zone> <min> <max>`, each a quest's zone and level range;
//   * THE SELECTED TASK's objectives, `<instruction> <status> <zone>` (`? ? ?` rows are hidden ones,
//     skipped), and its description, the free text under them.
//
// OCR slips on the journal's font are measured on the owner's three windows (tests/fixtures/shots/
// quest-journal-*.png): `Nerius` read `Merius`, `0/1` read `01`, `011` or `oi`, `Done` read `Cone`. A
// zone is snapped to the nearest known place's name within a slip or two; a status to `n/m` or `Done`
// when the read allows, else left out. The objectives' text is kept as read: it is for the player to
// check, and for the turn-in guess below, never written into a page as it stands.

import { editDistance } from './itemVocab'
import type { QuestJournalFacts } from './gapQuests'
import { questTitleKey } from './gapQuests'
import { ZONES } from './zones'

export interface JournalTask {
  title: string
  zone?: string
  minLevel?: number
  maxLevel?: number
  /** The highlighted row: the task whose objectives the window shows. */
  selected: boolean
}

export interface JournalObjective {
  text: string
  /** `0/1`, `Done`; absent when OCR left it unreadable. */
  status?: string
  zone?: string
}

export interface QuestJournalRead {
  tasks: JournalTask[]
  objectives: JournalObjective[]
  description?: string
}

/** Every place name the zone table knows. */
export const ZONE_NAMES: readonly string[] = ZONES.flatMap((z) => [z.name, ...(z.aliases ?? [])])

/** A line's background this bright (the max channel's median) is the selected row's grey bar (128 measured; the rock is 13). */
export const SELECTED_SHADE = 64

const letters = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, '')

/** The known place nearest `raw`, within a slip per four letters; undefined when none is. */
export function snapPlace(raw: string, places: readonly string[]): string | undefined {
  const r = letters(raw)
  if (r.length < 3) return undefined
  let best: { place: string; d: number } | undefined
  for (const p of places) {
    const d = editDistance(r, letters(p))
    if (d <= Math.floor(r.length / 4) && (best === undefined || d < best.d)) best = { place: p, d }
  }
  return best?.place
}

/** `Done` / `Cone` -> `Done`; `01`, `011`, `oi`, `0i3` -> `0/1`, `0/1`, `0/1`, `0/3`; else undefined. */
export function journalStatus(token: string): string | undefined {
  if (/^[CD]o[nr]e$/i.test(token)) return 'Done'
  // `0/1` with its slash and its 1 read as one stroke: `oi`, `0i`.
  if (/^[0oO][il|]$/.test(token)) return '0/1'
  const m = /^([0-9oO])[/il1|]?([0-9])$/.exec(token)
  return m === null ? undefined : `${m[1].replace(/[oO]/, '0')}/${m[2]}`
}

/** A task row: the junk the row's icon reads as, `Q`, the title, the time left, the zone, min and max. */
const TASK_ROW = /(?:^|[^a-z])Q\s+([A-Za-z].*?)\s+(Unlimited|\d+[dhms:][\d dhms:]*?)\s+(.+?)\s+(\d{1,3})(?:\s+(\d{1,3}))?(?:\s+\S{1,2})?\s*$/

function taskOf(line: string, selected: boolean, places: readonly string[]): JournalTask | undefined {
  const m = TASK_ROW.exec(line)
  if (m === null) return undefined
  const zone = snapPlace(m[3], places)
  const max = m[5] === undefined ? undefined : Number(m[5])
  return { title: m[1].trim(), ...(zone === undefined ? {} : { zone }), minLevel: Number(m[4]), ...(max === undefined ? {} : { maxLevel: max }), selected }
}

/** The words of a line with the junk OCR leaves at its end (`1`, `t`, `|`) dropped. */
function words(line: string): string[] {
  const w = line.trim().split(/\s+/)
  while (w.length > 0 && /^(?:[^A-Za-z0-9]+|[1t|I])$/.test(w[w.length - 1])) w.pop()
  return w
}

/** An objective row: the instruction, the status token, and the zone its last words snap to. */
function objectiveOf(line: string, places: readonly string[]): JournalObjective | undefined {
  const w = words(line)
  for (let n = Math.min(4, w.length - 1); n >= 1; n--) {
    // A zone's words start with a letter: a status token (`0i3`) is never part of it.
    const first = w[w.length - n]
    if (!/^[A-Za-z]{2}/.test(first) || journalStatus(first) !== undefined) continue
    const zone = snapPlace(w.slice(-n).join(' '), places)
    if (zone === undefined) continue
    const rest = w.slice(0, -n)
    const status = journalStatus(rest.at(-1) ?? '')
    const known = status !== undefined || /^(?:[a-z|]{1,2}|[0-9oO][^\s]{0,2})$/.test(rest.at(-1) ?? '')
    const text = (known ? rest.slice(0, -1) : rest).join(' ').replace(/^[^A-Za-z[]+/, '')
    return text === '' ? undefined : { text, ...(status === undefined ? {} : { status }), zone }
  }
  return undefined
}

/** Where a heading line sits, by a pattern that survives OCR's slips on it; -1 when absent. */
const headingAt = (lines: readonly string[], re: RegExp, from = 0): number => lines.findIndex((l, i) => i >= from && re.test(l))

/** The task rows between the table's heading and the next section, the highlighted one selected. */
function tasksOf(lines: readonly string[], shades: readonly number[], places: readonly string[], rows: { from: number; to: number }): JournalTask[] {
  const tasks: JournalTask[] = []
  for (let i = rows.from; i < rows.to; i++) {
    const t = taskOf(lines[i], (shades[i] ?? 0) > SELECTED_SHADE, places)
    if (t !== undefined) tasks.push(t)
  }
  if (tasks.length === 1) tasks[0].selected = true
  return tasks
}

/** The objective rows after their heading, then the description: the prose after them. */
function objectivesOf(lines: readonly string[], places: readonly string[], from: number): { objectives: JournalObjective[]; description?: string } {
  const objectives: JournalObjective[] = []
  const prose: string[] = []
  for (const line of lines.slice(from)) {
    if (letters(line).length < 3) continue
    const o = objectiveOf(line, places)
    if (o !== undefined && prose.length === 0) objectives.push(o)
    else if (words(line).length >= 5) prose.push(words(line).join(' '))
  }
  return { objectives, ...(prose.length === 0 ? {} : { description: prose.join(' ') }) }
}

/**
 * The window's tasks, the selected task's objectives and description. `shades`: each line's background
 * brightness (journalLines.ts), for the selected row; with one task row, it is the selected one.
 */
export function readQuestJournal(lines: readonly string[], shades: readonly number[] = [], places: readonly string[] = ZONE_NAMES): QuestJournalRead {
  const head = headingAt(lines, /Task\s+Ti[tl]/i)
  const progress = headingAt(lines, /Task\s+Progr/i, head + 1)
  const objHead = headingAt(lines, /Obje\w*\s+Ins/i, Math.max(head, progress) + 1)
  const taskEnd = progress >= 0 ? progress : objHead >= 0 ? objHead : lines.length
  const tasks = head < 0 ? [] : tasksOf(lines, shades, places, { from: head + 1, to: taskEnd })
  return { tasks, ...(objHead < 0 ? { objectives: [] } : objectivesOf(lines, places, objHead + 1)) }
}

/** The places a quest's journal zone may be: the zones its steps were in (Lake Nerius is in no map pack), then the zone table. */
export function journalPlaces(stepZones: readonly (string | undefined)[]): string[] {
  return [...new Set([...stepZones.filter((z): z is string => z !== undefined), ...ZONE_NAMES])]
}

/** Whether the lines are a Quest Journal at all: its task table and a task row read. */
export const isQuestJournal = (r: QuestJournalRead): boolean => r.tasks.length > 0

/** Two titles one quest: folded alike, or a slip or two apart (OCR's `alchemical Solution`). */
export function sameQuest(read: string, title: string): boolean {
  const a = letters(questTitleKey(read))
  const b = letters(questTitleKey(title))
  return a === b || (b.length >= 8 && editDistance(a, b) <= Math.floor(b.length / 8))
}

/** What the journal says of one quest: its row's zone and levels, and, when it is the selected one, its objectives and description. */
export function journalFacts(r: QuestJournalRead, title: string): QuestJournalFacts | undefined {
  const t = r.tasks.find((x) => sameQuest(x.title, title))
  if (t === undefined) return undefined
  return {
    ...(t.zone === undefined ? {} : { zone: t.zone }),
    ...(t.minLevel === undefined ? {} : { minLevel: t.minLevel }),
    ...(t.maxLevel === undefined ? {} : { maxLevel: t.maxLevel }),
    ...(t.selected ? { objectives: r.objectives, ...(r.description === undefined ? {} : { description: r.description }) } : {})
  }
}

/** The facts the reading gives each task row it names, by quest key: what a paste keeps. */
export function journalFactsByQuest(r: QuestJournalRead): Record<string, QuestJournalFacts> {
  return Object.fromEntries(r.tasks.flatMap((t) => {
    const f = journalFacts(r, t.title)
    return f === undefined ? [] : [[questTitleKey(t.title), f]]
  }))
}

// ---- an item's turn-in, from an objective ---------------------------------------------------------

/** Runs of capitalized words (`Lord Lyfyx`, `Pishtian F`Lok`), each with where it starts. */
function nameRuns(text: string): { name: string; at: number; first: boolean }[] {
  const out: { name: string; at: number; first: boolean }[] = []
  const re = /\b[A-Z][\w`']*(?:\s+(?:of\s+|the\s+)?[A-Z][\w`']*)*/g
  for (const m of text.matchAll(re)) {
    const before = text.slice(0, m.index).trimEnd()
    const first = before === '' || /[.!?,]$/.test(before)
    // A sentence's first word is a verb (`Find`, `Carry`, `There`): the run's name starts after it.
    const rest = first ? /^\S+\s+(.+)$/.exec(m[0]) : null
    if (rest !== null) out.push({ name: rest[1], at: m.index + m[0].length - rest[1].length, first: false })
    else out.push({ name: m[0], at: m.index, first })
  }
  return out
}

/**
 * Who an objective says an item goes to (coordinator, 2026-10-22, the owner's Call for Aid journal):
 * the objective that names a word of the item (four letters or more: `Plea`, `petition`), and the first
 * capitalized name after that word (`... petition Lord Lyfyx on Dorian`s behalf`; `Carry Dorian`s Plea
 * to Sir Mollin`), else the last before it (`Find Pishtian F`Lok in Neriak Commons and ensure he gets
 * Dorian`s Appeal`). A name is not a sentence's first word, a possessive (`Dorian`s`), a place, or the
 * item's own words. A GUESS: shown as one, never written into a page.
 */
export function journalTurnIn(objectives: readonly JournalObjective[], item: string, places: readonly string[] = ZONE_NAMES): string | undefined {
  const itemWords = item.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4)
  for (const o of objectives) {
    const hit = itemWords.map((w) => new RegExp(`\\b${w}`, 'i').exec(o.text)).find((m) => m !== null)
    if (hit === undefined || hit === null) continue
    const ok = (r: { name: string; first: boolean }): boolean =>
      !r.first && !/[`']s$/.test(r.name) && snapPlace(r.name, places) === undefined && !itemWords.some((w) => r.name.toLowerCase().includes(w))
    const runs = nameRuns(o.text).filter(ok)
    const after = runs.find((r) => r.at > hit.index)
    const before = [...runs].reverse().find((r) => r.at < hit.index)
    const name = (after ?? before)?.name
    if (name !== undefined) return name
  }
  return undefined
}
