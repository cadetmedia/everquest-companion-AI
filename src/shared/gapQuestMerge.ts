// shared/gapQuestMerge.ts — a quest page the wiki has, with what the log saw that it lacks (owner,
// 2026-10-23: "implement the diff idea"; "we don't want to remove stuff ... mainly ADDITIVE unless an
// obvious and provable ERROR is found").
//
// The live page comes in as its wikitext (one read per Copy click, main's gapQuestLive.ts); out comes
// that same text with lines added and nothing removed or reworded, a flag per line saying which are
// new, the additions in words, and the differences the log proves but the page keeps (shown, never
// changed). Pure, so the node tests drive it with fixtures and send the wiki nothing.
//
// What is added:
//   * top-table rows the page lacks or holds `?` / blank in (Start Zone, Quest Giver, Minimum Level),
//     and the Related NPCs and Related Zones the log met that the row does not name;
//   * reward items the page names nowhere, under its Reward heading (or a new one);
//   * walkthrough blocks (a say, an NPC line, a hand-in, a task line, faction lines, experience) whose
//     words the page does not hold, each placed after the last block the page does hold, so a missing
//     hand-in lands between the talk around it;
//   * the Quests and zone categories.
// A line counts as present when its words are on the page with case, punctuation, markup and the
// game's backtick folded away; a long NPC line by its first 40 letters, since editors trim them.

import { questLogOf, questPageTitle, questRewards, relatedNpcs, relatedZones, type QuestCatalogEntry, type QuestLog } from './gapQuests'
import { npcOf, questDraftPage, questRowPage, questWalkBlocks, rewardList, scrubPlayers, topRow, walkLines, zoneCategory, zoneOf, type QuestPageContext, type RowFactContext, type WalkBlock } from './gapQuestPage'

/** What Copy shows for a quest row. */
export interface QuestLiveCopy {
  /** merged: the live page plus additions; draft: the wiki has no page; offline: the read failed. */
  kind: 'merged' | 'draft' | 'offline'
  /** The page's title as the wiki answered it (a redirect followed). */
  title: string
  text: string
  /** Per line of `text`: true when the line is new. */
  added: boolean[]
  /** The additions, in words. */
  changes: string[]
  /** What the log proves the page states otherwise; shown, not changed. */
  notes: string[]
}

/** Words alone: markup, case, punctuation and the game's backtick folded away. */
export function plainWords(s: string): string {
  return s
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\{\{:?([^}|]*)[^}]*\}\}/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/'{2,}/g, '')
    .replace(/[`’‘]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** The page's lines, each flagged when new. */
class Doc {
  lines: string[]
  added: boolean[]
  changes: string[] = []
  notes: string[] = []
  constructor(text: string) {
    this.lines = text.replace(/\r\n/g, '\n').split('\n')
    this.added = this.lines.map(() => false)
  }
  insert(at: number, lines: readonly string[]): void {
    this.lines.splice(at, 0, ...lines)
    this.added.splice(at, 0, ...lines.map(() => true))
  }
  replace(at: number, line: string): void {
    this.lines[at] = line
    this.added[at] = true
  }
  find(re: RegExp, from = 0): number {
    for (let i = from; i < this.lines.length; i++) if (re.test(this.lines[i])) return i
    return -1
  }
  words(from = 0, to = this.lines.length): string {
    return ` ${plainWords(this.lines.slice(from, to).join('\n'))} `
  }
}

const HEADING = /^=+[^=].*=+\s*$/
const CATEGORY = /^\s*\[\[\s*category\s*:/i
const holds = (hay: string, words: string): boolean => words === '' || hay.includes(` ${words} `)

// ---- the top table ---------------------------------------------------------------------------

/** The table's label lines, by label in lower case (`starts in` is the start zone too). */
function tableRows(doc: Doc, open: number, close: number): Map<string, number> {
  const rows = new Map<string, number>()
  for (let i = open + 1; i < close; i++) {
    const m = /^\s*!\s*(?:''')?\s*([^:'|]+?)\s*:?\s*(?:''')?\s*$/.exec(doc.lines[i])
    if (m) rows.set(m[1].toLowerCase() === 'starts in' ? 'start zone' : m[1].toLowerCase(), i)
  }
  return rows
}

/** The value line under a label line, or -1. */
function valueLine(doc: Doc, label: number, close: number): number {
  for (let i = label + 1; i < close; i++) {
    const l = doc.lines[i].trim()
    if (l.startsWith('|-') || l.startsWith('!')) return -1
    if (l.startsWith('|')) return i
  }
  return -1
}

const emptyCell = (v: string): boolean => ['', '?', '??', 'unknown'].includes(v.replace(/^\|/, '').trim().toLowerCase())

/** The rows in the order 752 cached pages write them: a new row goes in its place. */
const ROW_ORDER = ['start zone', 'quest giver', 'minimum level', 'classes', 'related zones', 'related npcs']

/**
 * The top table as it stands now: every fill reads it again, since a row added above moves the
 * lines below it.
 */
function table(doc: Doc): { open: number; close: number; rows: Map<string, number> } | undefined {
  const open = doc.find(/^\s*\{\|.*questTopTable/)
  const close = open < 0 ? -1 : doc.find(/^\s*\|\}/, open)
  return close < 0 ? undefined : { open, close, rows: tableRows(doc, open, close) }
}

/** A new row in its place: before the first later row the table has (above that row's `|-`), else at the close. */
function addRow(doc: Doc, label: string, value: string): void {
  const t = table(doc)
  if (t === undefined) return
  const row = topRow(label, value).split('\n')
  for (const later of ROW_ORDER.slice(ROW_ORDER.indexOf(label.toLowerCase()) + 1)) {
    const at = t.rows.get(later)
    if (at === undefined) continue
    if (doc.lines[at - 1]?.trim().startsWith('|-')) doc.insert(at - 1, ['|-', ...row])
    else doc.insert(at, [...row, '|-'])
    return
  }
  doc.insert(t.close, ['|-', ...row])
}

/** A row's value line, or -1 when the row or its value is not there. */
function cellOf(doc: Doc, label: string): number {
  const t = table(doc)
  const at = t?.rows.get(label.toLowerCase())
  return t === undefined || at === undefined ? -1 : valueLine(doc, at, t.close)
}

/** A row the page lacks is added; a blank or `?` cell is filled; a written cell is left alone. */
function fillRow(doc: Doc, label: string, value: string): void {
  const t = table(doc)
  if (t === undefined) return
  if (!t.rows.has(label.toLowerCase())) addRow(doc, label, value)
  else {
    const v = cellOf(doc, label)
    if (v < 0 || !emptyCell(doc.lines[v])) return
    doc.replace(v, `| ${value}`)
  }
  doc.changes.push(`${label}: ${plainWordsKeep(value)}`)
}

/** A link's shown text, for the change list: `[[Lake Nerius]]` reads Lake Nerius. */
const plainWordsKeep = (v: string): string => v.replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')

/** Related NPCs / Zones: the names the log met that the table names nowhere, appended to the cell. */
function extendList(doc: Doc, label: string, names: readonly string[], link: (n: string) => string): void {
  const t = table(doc)
  if (t === undefined || names.length === 0) return
  const words = doc.words(t.open, t.close)
  const missing = names.filter((n) => !holds(words, plainWords(n)))
  if (missing.length === 0) return
  const v = cellOf(doc, label)
  if (v < 0) {
    if (!t.rows.has(label.toLowerCase())) fillRow(doc, label, missing.map(link).join(', '))
    return
  }
  const cell = doc.lines[v].replace(/^\|\s*/, '').trim()
  const keep = emptyCell(cell) || cell.toLowerCase() === 'none' ? [] : [cell]
  doc.replace(v, `| ${[...keep, ...missing.map(link)].join(', ')}`)
  doc.changes.push(`${label}: + ${missing.join(', ')}`)
}

/** The start zone: filled when blank; a page that names another zone is noted, never changed. */
function mergeStartZone(doc: Doc, zone: string, c: QuestPageContext): void {
  const v = cellOf(doc, 'start zone')
  const pageZone = v < 0 || emptyCell(doc.lines[v]) ? '' : plainWords(doc.lines[v].replace(/^\|/, ''))
  if (pageZone !== '' && pageZone !== plainWords(zoneOf(zone, c))) doc.notes.push(`Start Zone: the page says ${pageZone}, your log took it in ${zone}.`)
  fillRow(doc, 'Start Zone', zoneOf(zone, c))
}

function mergeTopTable(doc: Doc, log: QuestLog, c: QuestPageContext): void {
  const zone = log.zone ?? c.journal?.zone
  if (zone !== undefined && zone !== null) mergeStartZone(doc, zone, c)
  if (log.giver !== undefined && log.giver !== null) fillRow(doc, 'Quest Giver', npcOf(log.giver, c))
  if (c.journal?.minLevel !== undefined) fillRow(doc, 'Minimum Level', String(c.journal.minLevel))
  extendList(doc, 'Related Zones', relatedZones(log), (z) => zoneOf(z, c))
  extendList(doc, 'Related NPCs', relatedNpcs(log), (n) => npcOf(n, c))
}

// ---- the reward ------------------------------------------------------------------------------

/** Where a section's body ends: the next heading or category, or the page's end. */
function sectionEnd(doc: Doc, heading: number): number {
  for (let i = heading + 1; i < doc.lines.length; i++) if (HEADING.test(doc.lines[i]) || CATEGORY.test(doc.lines[i])) return i
  return doc.lines.length
}

/** Back over the blank lines before `at`, so an addition sits under the last written line. */
function afterText(doc: Doc, at: number): number {
  let i = at
  while (i > 0 && doc.lines[i - 1].trim() === '') i--
  return i
}

function mergeReward(doc: Doc, log: QuestLog): void {
  const items = (questRewards(log)?.items ?? []).filter((i) => !holds(doc.words(), plainWords(i)))
  if (items.length === 0) return
  const heading = doc.find(/^==\s*Rewards?\s*==\s*$/i)
  if (heading >= 0) {
    doc.insert(afterText(doc, sectionEnd(doc, heading)), rewardList(items))
  } else {
    const walk = doc.find(/^==\s*Walkthrough\s*==\s*$/i)
    const at = walk >= 0 ? walk : firstCategory(doc)
    doc.insert(at, ['== Reward ==', '', ...rewardList(items), ''])
  }
  doc.changes.push(`Reward: ${items.join(', ')}`)
}

// ---- the walkthrough -------------------------------------------------------------------------

/** The first category line, where a new section goes in front of. */
function firstCategory(doc: Doc): number {
  const at = doc.find(CATEGORY)
  return at < 0 ? doc.lines.length : afterText(doc, at)
}

/** The words a block is found by on the page. */
function blockWords(b: WalkBlock): string[] {
  if (b.kind === 'experience') return ['yougainexperience']
  return b.keys.map((k) => {
    const w = plainWords(k)
    return b.kind === 'npc' && w.length > 40 ? w.slice(0, 40).replace(/\s\S*$/, '') : w
  })
}

/** Whether the page (its walkthrough, for a hand-in or a gift) already states the block. */
function stated(b: WalkBlock, page: string, walk: string): boolean {
  if (b.kind === 'experience') return page.includes('yougainexperience') || page.includes(' you gain experience ')
  const hay = b.kind === 'give' || b.kind === 'receive' ? walk : page
  return blockWords(b).every((w) => holds(hay, w))
}

/** The page line that states a block, at or after `from`, or -1. */
function lineOf(doc: Doc, b: WalkBlock, from: number, to: number): number {
  const words = blockWords(b)
  for (let i = from; i < to; i++) {
    const l = ` ${plainWords(doc.lines[i])} `
    if (b.kind === 'experience' ? /yougainexperience/i.test(doc.lines[i]) : words.some((w) => w !== '' && holds(l, w))) return i
  }
  return -1
}

/** A faction line the page states with another number: the log's is the one the game printed. */
function factionNotes(doc: Doc, blocks: readonly WalkBlock[]): void {
  for (const b of blocks.filter((x) => x.kind === 'faction')) {
    for (const key of b.keys) {
      const m = /with \[\[(.+?)\]\] has been adjusted by (-?\d+)/.exec(key)
      if (!m) continue
      // Only when no number the page gives that faction is the log's: a page may list it at several steps.
      const re = new RegExp(`${plainWords(m[1])} has been adjusted by (\\d+)`, 'g')
      const said = [...doc.words().matchAll(re)].map((x) => x[1])
      if (said.length > 0 && !said.includes(m[2].replace('-', ''))) doc.notes.push(`${m[1]}: the page says ${said.join(' / ')}, your log says ${m[2]}.`)
    }
  }
}

/**
 * A new block under `anchor`, a blank line on either side as the wiki spaces its walkthrough lines
 * (`{{YouGainExperience}}` right under its facblock); returns the block's last line.
 */
function insertBlock(doc: Doc, anchor: number, b: WalkBlock): number {
  const at = anchor + 1
  const tight = doc.lines[anchor].trim() === '' || (b.kind === 'experience' && doc.lines[anchor].trim() === '</div>')
  const lines = [...(tight ? [] : ['']), ...b.lines]
  doc.insert(at, (doc.lines[at] ?? '').trim() === '' ? lines : [...lines, ''])
  return at + lines.length - 1
}

function mergeWalkthrough(doc: Doc, name: string, log: QuestLog, c: QuestPageContext): void {
  const blocks = questWalkBlocks(name, log, c)
  if (blocks.length === 0) return
  factionNotes(doc, blocks)
  const heading = doc.find(/^==\s*Walkthrough\s*==\s*$/i)
  if (heading < 0) {
    doc.insert(firstCategory(doc), ['== Walkthrough ==', '', ...walkLines(blocks)])
    doc.changes.push(`Walkthrough: ${String(blocks.length)} lines from your log`)
    return
  }
  let anchor = heading
  let count = 0
  for (const b of blocks) {
    const end = sectionEnd(doc, heading)
    const page = doc.words()
    if (stated(b, page, doc.words(heading, end))) {
      const at = lineOf(doc, b, anchor + 1, end)
      if (at >= 0) anchor = at + b.lines.length - 1
      continue
    }
    anchor = insertBlock(doc, anchor, b)
    count++
  }
  if (count > 0) doc.changes.push(`Walkthrough: ${String(count)} line${count === 1 ? '' : 's'} from your log`)
}

// ---- categories and the whole ----------------------------------------------------------------

function mergeCategories(doc: Doc, log: QuestLog, c: QuestPageContext): void {
  const wanted = ['[[Category:Quests]]', ...(log.zone === undefined || log.zone === null ? [] : [zoneCategory(log.zone, c)])]
  const have = doc.lines.filter((l) => CATEGORY.test(l)).map((l) => plainWords(l.replace(/^\s*\[\[\s*category\s*:/i, '[[')))
  const missing = wanted.filter((w) => !have.includes(plainWords(w.replace(/^\[\[Category:/, '[['))))
  if (missing.length === 0) return
  const last = afterText(doc, doc.lines.length)
  doc.insert(last, have.length === 0 ? ['', ...missing] : missing)
  doc.changes.push(`Category: ${missing.map((m) => m.replace(/^\[\[Category:|\]\]$/g, '')).join(', ')}`)
}

/** The log's quest against the page the wiki has: the page with only additions. */
export function mergeQuestPage(live: string, name: string, log: QuestLog, c: QuestPageContext & { entry?: QuestCatalogEntry } = {}): Omit<QuestLiveCopy, 'kind' | 'title'> {
  const doc = new Doc(live)
  const scrubbed: QuestLog = { ...log, steps: log.steps.map((s) => ({ ...s, ...(s.talk ? { talk: s.talk.map((t) => ({ ...t, text: scrubPlayers(t.text, c.players) })) } : {}) })) }
  mergeTopTable(doc, scrubbed, c)
  mergeReward(doc, scrubbed)
  mergeWalkthrough(doc, name, scrubbed, c)
  mergeCategories(doc, scrubbed, c)
  return { text: doc.lines.join('\n'), added: doc.added, changes: doc.changes, notes: doc.notes }
}

/** What the live read answered: the page's title and text ('' when the wiki has no such page). */
export interface LiveQuestPage {
  title: string
  text: string
}

/**
 * A quest row's Copy: the live page merged, a new-page draft when the wiki has none, or (the read
 * failed) the offline text it always gave, said to be offline.
 */
export function questLiveCopy(q: { name: string; log: QuestLog; offline: string }, live: LiveQuestPage | null, c: QuestPageContext & { entry?: QuestCatalogEntry } = {}): QuestLiveCopy {
  const { name, log, offline } = q
  const flat = (text: string): boolean[] => text.split('\n').map(() => false)
  if (live === null) return { kind: 'offline', title: name, text: offline, added: flat(offline), changes: [], notes: [] }
  if (live.text.trim() === '') {
    const text = questDraftPage(name, log, c)
    return { kind: 'draft', title: live.title, text, added: flat(text), changes: [], notes: [] }
  }
  return { kind: 'merged', title: live.title, ...mergeQuestPage(live.text, name, log, c) }
}

/** A Quests row's Copy against what the wiki answered: the row's log, the page writers' context. */
export function questRowLiveCopy(row: { name: string }, live: LiveQuestPage | null, x: RowFactContext & { players?: readonly string[] } = {}): QuestLiveCopy {
  const c = { zoneName: x.zoneName, mobPage: x.mobPage, entry: x.questEntry?.(row.name), journal: x.questJournal?.(row.name), players: x.players }
  const log = questLogOf(row) ?? { npcs: [], steps: [], reruns: 0 }
  return questLiveCopy({ name: questPageTitle(row.name), log, offline: questRowPage(row, c) }, live, c)
}
