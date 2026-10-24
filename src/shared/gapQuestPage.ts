// shared/gapQuestPage.ts — Copy wiki page for a Quests row (owner, 2026-10-22). Two jobs:
//
//   NO PAGE YET: a full draft in the wiki's Quest Page Blueprint (Help:Contents, read 2026-10-23; the
//   new Lake Nerius pages follow it, while most older cached pages write `Start Zone` and `== X ==`):
//   the `questTopTable` (Starts In, Quest Giver, Minimum Level, Classes, Related Zones, Related NPCs),
//   `= Reward =`, `= Summary =` as a `{{CheckboxList}}` ... `{{End}}`, `= Walkthrough =` with the log's
//   own talk (`You say, '...'`, `: NPC says, '...'`), a blank line after each, hand-ins as `Hand [[X]]
//   to [[NPC]]:`, the task lines in bold, a `facblock` and `{{YouGainExperience}}`, then `= Related
//   Quests =` when the log saw the quest before or after. None of the blueprint's option lists: a cell the log cannot
//   fill is `?`, as the wiki writes Classes and Minimum Level; a row no page fills with `?` (Required
//   Faction) is left out. The player's own names read `Soandso`, as the cached pages write a player (27 NPC lines on 8
//   pages; `<name>` 9).
//
//   A PAGE EXISTS, read offline: only what the page is missing, as the top-table rows to paste. The
//   live comparison, walkthrough included, is gapQuestMerge.ts (owner, 2026-10-23: "implement the
//   diff idea").

import { CURRENT_ERA } from './planner/era'
import { wikiZoneLink } from './gapWikiZone'
import { roleLine, roleOf } from './gapRoles'
import { npcImageName } from './mobPageTitle'
import { ownSteps, questLogOf, questPageTitle, questRewards, questRowLines, receivedOf, relatedNpcs, relatedZones, stepKeyword, type QuestCatalogEntry, type QuestJournalFacts, type QuestLog, type QuestStep } from './gapQuests'

/** What the page text needs beside the log: the wiki's spellings and the journal's reading. */
export interface QuestPageContext {
  zoneName?: (raw: string) => string
  mobPage?: (name: string) => string | undefined
  journal?: QuestJournalFacts
  /** The player's own characters: an NPC line naming one reads `Soandso` on the page. */
  players?: readonly string[]
}

export const zoneOf = (z: string, c: QuestPageContext): string => wikiZoneLink(c.zoneName?.(z) ?? z)
export const npcOf = (n: string, c: QuestPageContext): string => `[[${c.mobPage?.(n) ?? n}]]`

/** A line with the player's names as the wiki writes a player: `Soandso`. */
export function scrubPlayers(text: string, players: readonly string[] = []): string {
  return players.filter((p) => p.length > 1).reduce((t, p) => t.replace(new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), 'Soandso'), text)
}
const linkList = (names: readonly string[], link: (n: string) => string): string => (names.length === 0 ? 'None' : names.map(link).join(', '))

/** One `questTopTable` row. */
export const topRow = (label: string, value: string): string => `! ''' ${label}: '''\n| ${value}`

/** The level the journal states, or the placeholder. */
const minLevel = (c: QuestPageContext): string => (c.journal?.minLevel === undefined ? '?' : String(c.journal.minLevel))

/**
 * The Start Zone cell: the zone it was given in, or for a chained quest the quest it follows, as the
 * wiki writes one (`Finishing the quest [[Call for Aid]]`, Unfortunate News).
 */
export function startCell(log: QuestLog, c: QuestPageContext): string | undefined {
  if (log.chainedFrom !== undefined) return `Finishing the quest [[${questPageTitle(log.chainedFrom)}]]`
  const start = log.zone ?? c.journal?.zone
  return start === undefined || start === null ? undefined : zoneOf(start, c)
}

/** The giver a page names: none for a chained quest, whose assigning NPC finished the quest before. */
export const giverOf = (log: QuestLog): string | undefined => (log.chainedFrom === undefined ? (log.giver ?? undefined) : undefined)

/** The zone a page is filed under: where it was given, or a chained quest's first zone of its own. */
export function homeZone(log: QuestLog): string | undefined {
  if (log.chainedFrom === undefined) return log.zone ?? undefined
  return ownSteps(log).find((s) => (s.zone ?? '') !== '')?.zone
}

function topTable(log: QuestLog, c: QuestPageContext): string {
  const giver = giverOf(log)
  const rows = [
    topRow('Starts In', startCell(log, c) ?? '?'),
    ...(log.chainedFrom !== undefined ? [] : [topRow('Quest Giver', giver === undefined ? '?' : npcOf(giver, c))]),
    topRow('Minimum Level', minLevel(c)),
    topRow('Classes', '?'),
    topRow('Related Zones', linkList(relatedZones(log), (z) => zoneOf(z, c))),
    topRow('Related NPCs', linkList(relatedNpcs(log), (n) => npcOf(n, c)))
  ]
  return `{| class="questTopTable"\n${rows.join('\n|-\n')}\n|}`
}

/** The reward items as the blueprint lists them: `<ul>`, one `<li>{{:Item}}</li>` each, `</ul>`. */
export const rewardList = (items: readonly string[]): string[] => (items.length === 0 ? [] : ['<ul>', ...items.map((i) => `<li>{{:${i}}}</li>`), '</ul>'])

function rewardSection(log: QuestLog): string {
  const r = questRewards(log)
  const items = rewardList(r?.items ?? [])
  const lines = items.length > 0 ? items : r?.experience === true ? ['* Experience'] : ['?']
  return ['= Reward =', '', ...lines].join('\n')
}

/** Each distinct item with how many times it appears, in first-seen order. */
function counted(items: readonly string[]): [string, number][] {
  const n = new Map<string, number>()
  for (const i of items) n.set(i, (n.get(i) ?? 0) + 1)
  return [...n]
}

/** `[[Fresh Fish]]`, or `3 [[Fresh Fish]]` as pages write a count (`Hand 4 [[Spiderling Eye]]`). */
const itemLink = ([item, n]: [string, number]): string => `${n > 1 ? `${String(n)} ` : ''}[[${item}]]`

/** One step as a checklist line: who, what was said or handed over, what came of it. */
function checkLine(s: QuestStep, c: QuestPageContext): string | undefined {
  const who = s.npc === undefined ? undefined : npcOf(s.npc, c)
  const where = s.zone === undefined ? '' : ` in ${zoneOf(s.zone, c)}`
  const said = stepKeyword(s)
  const handed = counted(s.offered ?? []).map(itemLink).join(' and ')
  const got = counted(receivedOf(s)).map(itemLink).join(' and ')
  const parts = [
    ...(handed !== '' && who !== undefined ? [`Give ${handed} to ${who}${where}`] : []),
    ...(handed === '' && said !== undefined && who !== undefined ? [`Say '${said}' to ${who}${where}`] : []),
    ...(got === '' ? [] : [`receive ${got}`])
  ]
  if (parts.length === 0) return undefined
  const line = parts.join(', ')
  return `* ${line.charAt(0).toUpperCase()}${line.slice(1)}.`
}

function summarySection(name: string, log: QuestLog, c: QuestPageContext): string {
  const lines = ownSteps(log).map((s) => checkLine(s, c)).filter((l): l is string => l !== undefined)
  const next = questRewards(log)?.next
  if (next !== undefined) lines.push(`* Receive the [[${next}]] quest.`)
  if (lines.length === 0) lines.push(`* Finish ${name}.`)
  return ['= Summary =', '{{CheckboxList}}', ...lines, '{{End}}'].join('\n')
}

/**
 * One walkthrough block: what kind of line it is (the merge tests each kind its own way) and its
 * lines. A block is one line, but a facblock is its `<div>` and every faction line inside it.
 */
export interface WalkBlock {
  kind: 'say' | 'npc' | 'give' | 'receive' | 'task' | 'faction' | 'experience' | 'achievement'
  lines: string[]
  /** What the block names: the words said, the item, the faction lines, the achievement. */
  keys: string[]
}

/** A part of a step with the time its line was printed, when the engine serves it. */
interface Timed {
  ms?: number
  block: WalkBlock
}

/** The first time an item's line was printed, from a list and its parallel stamps. */
const firstMs = (items: readonly string[] = [], ms: readonly number[] = [], item: string): number | undefined => ms[items.indexOf(item)]

/** A step's talk and its hand-ins and returns, in the order the log printed them when it says. */
function stepParts(s: QuestStep, c: QuestPageContext): WalkBlock[] {
  const to = s.npc === undefined ? '' : ` to ${npcOf(s.npc, c)}`
  const parts: Timed[] = [
    ...(s.talk ?? []).map((t): Timed => {
      const text = scrubPlayers(t.text, c.players)
      const block: WalkBlock = t.who === 'You' ? { kind: 'say', lines: [`You say, '${text}'`], keys: [text] } : { kind: 'npc', lines: [`: ${t.who} says, '${text}'`], keys: [text] }
      return { ms: t.ms, block }
    }),
    ...counted(s.offered ?? []).map(([i, n]): Timed => ({ ms: firstMs(s.offered, s.offeredMs, i), block: { kind: 'give', lines: [`Hand ${itemLink([i, n])}${to}:`], keys: [i] } })),
    ...counted(receivedOf(s)).map(([i, n]): Timed => ({ ms: firstMs(s.given, s.givenMs, i), block: { kind: 'receive', lines: [`'''You receive ${itemLink([i, n])}.'''`], keys: [i] } }))
  ]
  const timed = parts.every((p) => p.ms !== undefined)
  return (timed ? [...parts].sort((a, b) => (a.ms ?? 0) - (b.ms ?? 0)) : parts).map((p) => p.block)
}

/** One step in the walkthrough: its parts, the task line, its factions, experience, achievements. */
function walkStep(name: string, s: QuestStep, c: QuestPageContext): WalkBlock[] {
  const task = s.kind === 'assigned' ? `'''You have been assigned the task '${name}'.'''` : `'''Your task '${name}' has been updated.'''`
  const fac = (s.factions ?? []).map((f) => `* ${f.line.replace(` with ${f.faction} `, ` with [[${f.faction}]] `)}`)
  return [
    ...stepParts(s, c),
    // A visit the player tied to the quest printed no task line: none is written.
    ...(s.kind === 'talk' ? [] : [{ kind: 'task' as const, lines: [task], keys: [task] }]),
    ...(fac.length === 0 ? [] : [{ kind: 'faction' as const, lines: ['<div class="facblock">', ...fac, '</div>'], keys: fac }]),
    ...(s.experience === true ? [{ kind: 'experience' as const, lines: ['{{YouGainExperience}}'], keys: [] }] : []),
    ...(s.achievements ?? []).map((a): WalkBlock => ({ kind: 'achievement', lines: [`'''You have completed achievement: ${a}'''`], keys: [a] }))
  ]
}

/**
 * The walkthrough's blocks, step by step. The game prints one update per objective, so a three-item
 * turn-in is three of the same task line in one second: those are one line, the first. Three fish
 * caught are three more, seconds apart: a task line right after the same task line is one line too.
 */
export function questWalkBlocks(name: string, log: QuestLog, c: QuestPageContext = {}): WalkBlock[] {
  const seen = new Set<string>()
  const out: WalkBlock[] = []
  /** A task line already written this second, or the line just written. */
  const repeat = (at: string, b: WalkBlock): boolean => {
    const prev = out[out.length - 1]
    const key = `${at}|${b.lines[0]}`
    const again = seen.has(key) || (prev?.kind === 'task' && prev.lines[0] === b.lines[0])
    seen.add(key)
    return again
  }
  for (const s of ownSteps(log)) {
    for (const b of walkStep(name, s, c)) if (b.kind !== 'task' || !repeat(s.at, b)) out.push(b)
  }
  return out
}

/**
 * Blocks as page lines: a blank line after each, as the wiki writes 3,584 of its 3,676 spoken lines;
 * `{{YouGainExperience}}` sits right under its facblock, as the cached pages put it.
 */
export function walkLines(blocks: readonly WalkBlock[]): string[] {
  const out: string[] = []
  blocks.forEach((b, i) => {
    if (b.kind === 'experience' && blocks[i - 1]?.kind === 'faction') out.pop()
    out.push(...b.lines, '')
  })
  return out
}

/** The zone's category, as the wiki spells the zone. */
export const zoneCategory = (zone: string, c: QuestPageContext): string => `[[Category:${c.zoneName?.(zone) ?? zone}]]`

/** The page the wiki has no copy of yet, from the log (and the journal's level, when read). */
export function questDraftPage(name: string, log: QuestLog, c: QuestPageContext = {}): string {
  const era = `{{${CURRENT_ERA.charAt(0).toUpperCase()}${CURRENT_ERA.slice(1)} Era}}`
  const giver = giverOf(log)
  const picture = giver === undefined ? [] : [`[[File:${npcImageName(giver)}|thumb|${giver}]]`]
  const walk = walkLines(questWalkBlocks(name, log, c))
  const home = homeZone(log)
  // The class category is the editor's to pick: the log never states which classes may take it.
  const cats = ['[[Category:Quests]]', ...(home === undefined ? [] : [zoneCategory(home, c)]), '<!-- [[Category:All Classes Quests]] or [[Category:<Class> Quests]] -->']
  return [era, ...picture, topTable(log, c), '', rewardSection(log), '', summarySection(name, log, c), '', '= Walkthrough =', '', ...walk, ...relatedQuests(log), ...cats].join('\n') + '\n'
}

/** `= Related Quests =`: the quest this one follows and the one it hands out, when the log saw them. */
function relatedQuests(log: QuestLog): string[] {
  const chain = [log.chainedFrom, questRewards(log)?.next].filter((q): q is string => q !== undefined)
  return chain.length === 0 ? [] : ['= Related Quests =', '', ...chain.map((q) => `* [[${questPageTitle(q)}]]`), '']
}

/** A start cell that names a quest (`Finishing the quest [[Call for Aid]]`), not a zone. */
export const startsFromQuest = (cell: string | undefined): boolean => /\bquest\b/i.test(cell ?? '')

/** A page's list compared by name: the catalog writes `[[Freeport|West Freeport]]` cells as their shown text. */
const lacks = (list: readonly string[] | undefined, name: string): boolean => !(list ?? []).some((n) => n.toLowerCase().replace(/`/g, "'") === name.toLowerCase().replace(/`/g, "'"))

/**
 * What a page the wiki has is missing that the log or the journal can fill, as the top-table rows to
 * paste: `[label, value]`. Empty when the log can tell of nothing missing.
 */
export function questPageGaps(entry: QuestCatalogEntry, log: QuestLog, c: QuestPageContext = {}): [string, string][] {
  const start = startCell(log, c)
  // A page that starts the quest from another quest names no giver, and the log gives it none.
  const giver = startsFromQuest(entry.startZone) ? undefined : giverOf(log)
  const level = c.journal?.minLevel
  const blank = (v: string | undefined): boolean => (v ?? '') === ''
  return [
    ...(blank(entry.startZone) && start !== undefined ? [['Starts In', start] as [string, string]] : []),
    ...(blank(entry.giver) && giver !== undefined ? [['Quest Giver', npcOf(giver, c)] as [string, string]] : []),
    ...(entry.minLevel === undefined && level !== undefined ? [['Minimum Level', String(level)] as [string, string]] : []),
    ...relatedNpcGap(entry, log, c)
  ]
}

/** `Related NPCs` with the NPCs the log met that the page names nowhere, when there are any. */
function relatedNpcGap(entry: QuestCatalogEntry, log: QuestLog, c: QuestPageContext): [string, string][] {
  const listed = (entry.relatedNpcs ?? []).filter((n) => n.toLowerCase() !== 'none')
  const met = relatedNpcs(log).filter((n) => lacks(listed, n) && lacks(entry.giver === undefined ? [] : [entry.giver], n))
  return met.length === 0 ? [] : [['Related NPCs', [...listed, ...met].map((n) => npcOf(n, c)).join(', ')]]
}

/** The missing rows in words, for the row's details. */
export function questGapWords(gaps: readonly [string, string][]): string[] {
  return gaps.map(([label, value]) => `${label} (${value.replace(/\[\[|\]\]/g, '')})`)
}

/** The rows to paste into the page's top table; a note when the log saw nothing missing. */
export function questUpdateText(gaps: readonly [string, string][]): string {
  if (gaps.length === 0) return 'Nothing the log or the Quest Journal can add: the page has a giver, a zone, a level and every NPC the log met.\n'
  return `${gaps.map(([label, value]) => topRow(label, value)).join('\n|-\n')}\n`
}

/** What a Quests row's page needs: the catalog's entry when the wiki has the page. */
export interface QuestRowContext extends QuestPageContext {
  entry?: QuestCatalogEntry
}

/** A Quests row's Copy wiki page: the rows its page lacks, or a draft of the page the wiki has none of. */
export function questRowPage(row: { name: string }, c: QuestRowContext): string {
  const log = questLogOf(row) ?? { npcs: [], steps: [], reruns: 0 }
  if (c.entry !== undefined) return questUpdateText(questPageGaps(c.entry, log, c))
  return questDraftPage(questPageTitle(row.name), log, c)
}

/** What a Quests row's page lacks, in words: the rows to paste, and the level when no journal was read. */
export function questRowMissing(row: { name: string }, c: QuestRowContext): string[] {
  const log = questLogOf(row)
  if (log === undefined || c.entry === undefined) return []
  const level = c.entry.minLevel === undefined && c.journal?.minLevel === undefined ? ['Minimum Level (paste its Quest Journal to read it)'] : []
  return [...questGapWords(questPageGaps(c.entry, log, c)), ...level]
}

/** The page context a row's facts read: the catalog and journal finders (wikiPage.ts PageExtras). */
export interface RowFactContext {
  zoneName?: (raw: string) => string
  mobPage?: (name: string) => string | undefined
  questEntry?: (name: string) => QuestCatalogEntry | undefined
  questJournal?: (name: string) => QuestJournalFacts | undefined
}

/**
 * A row's facts in words beyond its tallies: a quest's giver, steps, rewards and what its page lacks;
 * an NPC's role from its target line; where an item was fished.
 */
export function rowFactLines(row: { domain: string; name: string }, x: RowFactContext = {}): string[] {
  if (row.domain === 'quest') {
    const c: QuestRowContext = { ...x, entry: x.questEntry?.(row.name), journal: x.questJournal?.(row.name) }
    return questRowLines(questLogOf(row), questRowMissing(row, c))
  }
  const fished = (row as { fishedIn?: string[] }).fishedIn ?? []
  return [...roleLine(roleOf(row)), ...(fished.length === 0 ? [] : [`Fished up in ${fished.join(', ')}`])]
}
