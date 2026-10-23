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
//   * walkthrough blocks (a say, an NPC line, a hand-in, faction lines, experience, an achievement)
//     whose words the page does not hold, each placed after the last block the page does hold, so a
//     missing hand-in lands between the talk around it. Task lines are never added (12 of the 931
//     cached pages write one), only read as anchors;
//   * the Quests and zone categories.
// A line counts as present when its words are on the page with case, punctuation, markup and the
// game's backtick folded away; a long NPC line by its first 40 letters, since editors trim them. A
// hand-in is present when a Hand/Give line of the walkthrough links its item, and a link an article
// or a letter or two off the game's item name is reported (Unfortunate News links Curt Dismissal and
// Orgination of Might; the game hands over A Curt Dismissal and Ordination of Might).
//
// THE PAGE'S OWN LAYOUT: older pages write level-1 headings (`= Walkthrough =`, 10 of the cache) and
// `Starts In`; sections are found at any level and a new one takes the page's level.

import { questLogOf, questPageTitle, questRewards, questTitleKey, relatedNpcs, relatedZones, type QuestCatalogEntry, type QuestLog } from './gapQuests'
import { giverOf, homeZone, npcOf, questDraftPage, questRowPage, questWalkBlocks, rewardList, startCell, startsFromQuest, topRow, walkLines, zoneCategory, zoneOf, type QuestPageContext, type RowFactContext, type WalkBlock } from './gapQuestPage'

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
  note(text: string): void {
    if (!this.notes.includes(text)) this.notes.push(text)
  }
  find(re: RegExp, from = 0): number {
    for (let i = from; i < this.lines.length; i++) if (re.test(this.lines[i])) return i
    return -1
  }
  words(from = 0, to = this.lines.length): string {
    return ` ${plainWords(this.lines.slice(from, to).join('\n'))} `
  }
}

const HEADING = /^(=+)[^=].*?\1\s*$/
const REWARD_HEADING = /^(=+)\s*Rewards?\s*\1\s*$/i
const WALK_HEADING = /^(=+)\s*Walkthrough\s*\1\s*$/i
const CATEGORY = /^\s*\[\[\s*category\s*:/i
const holds = (hay: string, words: string): boolean => words === '' || hay.includes(` ${words} `)

/** A heading line's level: `= X =` is 1, `== X ==` 2; 0 for any other line. */
const levelOf = (line: string): number => HEADING.exec(line)?.[1].length ?? 0

/** A new section's heading at the page's own level (its first heading's), else the wiki's usual 2. */
function headingLine(doc: Doc, title: string): string {
  const first = doc.lines.find((l) => levelOf(l) > 0)
  const eq = '='.repeat(first === undefined ? 2 : levelOf(first))
  return `${eq} ${title} ${eq}`
}

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

/** A row's written value, '' when the row is missing, blank or `?`. */
function cellText(doc: Doc, label: string): string {
  const v = cellOf(doc, label)
  return v < 0 || emptyCell(doc.lines[v]) ? '' : doc.lines[v].replace(/^\|\s*/, '').trim()
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

/**
 * The start: filled when blank. A page that starts it from a quest is left alone (a chained quest's
 * own answer). A page naming one zone the log disagrees with is noted, never changed; then the zone
 * category is not filed either. Returns whether the page's start agrees with the log's.
 */
function mergeStart(doc: Doc, log: QuestLog, c: QuestPageContext): boolean {
  const want = startCell(log, c)
  if (want === undefined) return true
  const cell = cellText(doc, 'start zone')
  if (cell === '') {
    fillRow(doc, 'Start Zone', want)
    return true
  }
  if (startsFromQuest(cell) || plainWords(cell) === plainWords(want)) return true
  if (/^\[\[[^\]]+\]\]$/.test(cell) || log.chainedFrom !== undefined) doc.note(`Start Zone: the page says ${plainWordsKeep(cell)}; your log: ${plainWordsKeep(want)}.`)
  return false
}

function mergeTopTable(doc: Doc, log: QuestLog, c: QuestPageContext): boolean {
  const agrees = mergeStart(doc, log, c)
  // A page that starts the quest from another quest names no giver; nor does a chained log.
  const giver = startsFromQuest(cellText(doc, 'start zone')) ? undefined : giverOf(log)
  if (giver !== undefined) fillRow(doc, 'Quest Giver', npcOf(giver, c))
  if (c.journal?.minLevel !== undefined) fillRow(doc, 'Minimum Level', String(c.journal.minLevel))
  extendList(doc, 'Related Zones', relatedZones(log), (z) => zoneOf(z, c))
  extendList(doc, 'Related NPCs', relatedNpcs(log), (n) => npcOf(n, c))
  return agrees
}

// ---- the reward ------------------------------------------------------------------------------

/** Where a section's body ends: the next heading of its level or above, or a category, or the end. */
function sectionEnd(doc: Doc, heading: number): number {
  const level = levelOf(doc.lines[heading])
  for (let i = heading + 1; i < doc.lines.length; i++) {
    const l = levelOf(doc.lines[i])
    if ((l > 0 && l <= level) || CATEGORY.test(doc.lines[i])) return i
  }
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
  const heading = doc.find(REWARD_HEADING)
  if (heading >= 0) {
    doc.insert(afterText(doc, sectionEnd(doc, heading)), rewardList(items))
  } else {
    const walk = doc.find(WALK_HEADING)
    const at = walk >= 0 ? walk : firstCategory(doc)
    doc.insert(at, [headingLine(doc, 'Reward'), '', ...rewardList(items), ''])
  }
  doc.changes.push(`Reward: ${items.join(', ')}`)
}

// ---- hand-ins --------------------------------------------------------------------------------

const HAND_LINE = /^\s*:?\s*(?:'''\s*)?(?:hand|give|turn in)\b/i
const LINKS = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g
const ARTICLE = /^(?:a|an|the) /

/** Letters to change to turn one name into the other (insert, delete, swap). */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = row
  }
  return prev[b.length]
}

/** How a page's link names the game's item: the same, near (an article or a letter or two off), or not. */
function itemMatch(item: string, link: string): 'same' | 'near' | undefined {
  const a = plainWords(item)
  const b = plainWords(link)
  if (a === b) return 'same'
  const x = a.replace(ARTICLE, '')
  const y = b.replace(ARTICLE, '')
  if (x === y || (Math.min(x.length, y.length) >= 8 && editDistance(x, y) <= 2)) return 'near'
  return undefined
}

/** The walkthrough line that hands this item over (any Hand/Give line linking it), or -1; a near link is noted. */
function handLineOf(doc: Doc, item: string, from: number, to: number): number {
  for (let i = from; i < to; i++) {
    if (!HAND_LINE.test(doc.lines[i])) continue
    for (const m of doc.lines[i].matchAll(LINKS)) {
      const match = itemMatch(item, m[1])
      if (match === 'near') doc.note(`The page links ${m[1].trim()}; the item is ${item}.`)
      if (match !== undefined) return i
    }
  }
  return -1
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

/** The walkthrough's span: its heading's line and where its body ends. */
interface Span {
  heading: number
  end: number
}

/** The page line that states a block inside the walkthrough at or after `from`, or -1. */
function lineOf(doc: Doc, b: WalkBlock, from: number, walk: Span): number {
  if (b.kind === 'give') return handLineOf(doc, b.keys[0], from, walk.end)
  const words = blockWords(b)
  for (let i = from; i < walk.end; i++) {
    const l = ` ${plainWords(doc.lines[i])} `
    if (b.kind === 'experience' ? /yougainexperience/i.test(doc.lines[i]) : words.some((w) => w !== '' && holds(l, w))) return i
  }
  return -1
}

/** Whether the page already states the block: a hand-in by its item, the rest by their words. */
function stated(doc: Doc, b: WalkBlock, walk: Span): boolean {
  if (b.kind === 'give') return handLineOf(doc, b.keys[0], walk.heading + 1, walk.end) >= 0
  const page = doc.words()
  if (b.kind === 'experience') return page.includes('yougainexperience') || page.includes(' you gain experience ')
  const hay = b.kind === 'receive' || b.kind === 'achievement' ? doc.words(walk.heading, walk.end) : page
  return blockWords(b).every((w) => holds(hay, w))
}

/** A faction line the page states with another number: the log's is the one the game printed. */
function factionNotes(doc: Doc, blocks: readonly WalkBlock[]): void {
  const page = doc.words()
  for (const b of blocks.filter((x) => x.kind === 'faction')) {
    for (const key of b.keys) {
      const m = /with \[\[(.+?)\]\] has been adjusted by (-?\d+)/.exec(key)
      if (!m) continue
      // Only when no number the page gives that faction is the log's: a page may list it at several steps.
      const re = new RegExp(`${plainWords(m[1])} has been adjusted by (\\d+)`, 'g')
      const said = [...page.matchAll(re)].map((x) => x[1])
      if (said.length > 0 && !said.includes(m[2].replace('-', ''))) doc.note(`${m[1]}: the page says ${said.join(' / ')}, your log says ${m[2]}.`)
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
  const heading = doc.find(WALK_HEADING)
  if (heading < 0) {
    const lines = walkLines(blocks.filter((b) => b.kind !== 'task'))
    doc.insert(firstCategory(doc), [headingLine(doc, 'Walkthrough'), '', ...lines])
    doc.changes.push(`Walkthrough: ${String(lines.filter((l) => l !== '').length)} lines from your log`)
    return
  }
  let anchor = heading
  let count = 0
  for (const b of blocks) {
    const walk = { heading, end: sectionEnd(doc, heading) }
    if (stated(doc, b, walk)) {
      const at = lineOf(doc, b, anchor + 1, walk)
      if (at >= 0) anchor = at + b.lines.length - 1
      continue
    }
    // A task line is read as an anchor, never added: almost no page writes one.
    if (b.kind === 'task') continue
    anchor = insertBlock(doc, anchor, b)
    count++
  }
  if (count > 0) doc.changes.push(`Walkthrough: ${String(count)} line${count === 1 ? '' : 's'} from your log`)
}

// ---- categories and the whole ----------------------------------------------------------------

/** The Quests category, and the zone's when the page's start agrees with the log's. */
function mergeCategories(doc: Doc, log: QuestLog, c: QuestPageContext, zoneOk: boolean): void {
  const home = zoneOk ? homeZone(log) : undefined
  const wanted = ['[[Category:Quests]]', ...(home === undefined ? [] : [zoneCategory(home, c)])]
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
  // The walkthrough's blocks read the player's names as Soandso themselves (questWalkBlocks).
  const zoneOk = mergeTopTable(doc, log, c)
  mergeReward(doc, log)
  mergeWalkthrough(doc, name, log, c)
  mergeCategories(doc, log, c, zoneOk)
  return { text: doc.lines.join('\n'), added: doc.added, changes: doc.changes, notes: doc.notes }
}

/** What the live read answered: the page's title and text ('' when the wiki has no such page). */
export interface LiveQuestPage {
  title: string
  text: string
  /** A second page the read passed through: the game's title, holding only a link to this one. */
  stubOf?: string
}

/**
 * A page that is only a link to another spelling of its own title: the title the link names. The
 * wiki's Unfortunate news is the top table, `[[Unfortunate News]]` and the categories, while the
 * walkthrough lives on Unfortunate News (titles are case-sensitive past the first letter).
 */
export function stubLinkTarget(title: string, text: string): string | undefined {
  const t = table(new Doc(text))
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const body = lines
    .filter((_, i) => t === undefined || i < t.open || i > t.close)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !CATEGORY.test(l) && !/^\{\{[^}]*\}\}$/.test(l) && !/^\[\[\s*(?:file|image)\s*:/i.test(l))
  if (body.length !== 1) return undefined
  const m = /^\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]\.?$/.exec(body[0])
  const target = m?.[1].trim()
  return target !== undefined && target !== title && questTitleKey(target) === questTitleKey(title) ? target : undefined
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
  const merged = mergeQuestPage(live.text, name, log, c)
  const stub = live.stubOf === undefined ? [] : [`${live.stubOf} is a second page holding only a link here; this compares against ${live.title}.`]
  return { kind: 'merged', title: live.title, ...merged, notes: [...stub, ...merged.notes] }
}

/** A Quests row's Copy against what the wiki answered: the row's log, the page writers' context. */
export function questRowLiveCopy(row: { name: string }, live: LiveQuestPage | null, x: RowFactContext & { players?: readonly string[] } = {}): QuestLiveCopy {
  const c = { zoneName: x.zoneName, mobPage: x.mobPage, entry: x.questEntry?.(row.name), journal: x.questJournal?.(row.name), players: x.players }
  const log = questLogOf(row) ?? { npcs: [], steps: [], reruns: 0 }
  return questLiveCopy({ name: questPageTitle(row.name), log, offline: questRowPage(row, c) }, live, c)
}
