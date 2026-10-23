// shared/gapQuestPage.ts — Copy wiki page for a Quests row (owner, 2026-10-22). Two jobs:
//
//   NO PAGE YET: a full draft in the layout most of the ~930 cached quest pages share (owner,
//   2026-10-23: "validate that"; page-60172, Acquire a Mark of Karana): the `questTopTable` (Start
//   Zone, Quest Giver, Minimum Level, Classes, Related Zones, Related NPCs), `== Reward ==`,
//   `== Checklist ==` as a `{{CheckboxList}}` ... `{{End}}`, and `== Walkthrough ==` with the log's own
//   talk (`You say, '...'`, `: NPC says, '...'`), a blank line after each, hand-ins as `Give [[X]] to
//   [[NPC]]:`, the task lines in bold, a `facblock` and `{{YouGainExperience}}`. A cell the log cannot
//   fill is `?`, as the wiki writes Classes and Minimum Level; a row no page fills with `?` (Required
//   Faction) is left out. The player's own names read `Soandso`, as 37 cached pages write it.
//
//   A PAGE EXISTS, read offline: only what the page is missing, as the top-table rows to paste. The
//   live comparison, walkthrough included, is gapQuestMerge.ts (owner, 2026-10-23: "implement the
//   diff idea").

import { CURRENT_ERA } from './planner/era'
import { wikiZoneLink } from './gapWikiZone'
import { roleLine, roleOf } from './gapRoles'
import { questLogOf, questPageTitle, questRewards, questRowLines, relatedNpcs, relatedZones, stepKeyword, type QuestCatalogEntry, type QuestJournalFacts, type QuestLog, type QuestStep } from './gapQuests'

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

/** `npc_nikko_canti.png`, as the wiki names an NPC's picture (wikiPage.ts npcImageName, restated: no import cycle). */
const npcFile = (name: string): string => `npc_${name.trim().toLowerCase().replace(/[\\/:*?"<>|#[\]{}]/g, '_').replace(/[\s_]+/g, '_').replace(/^_|_$/g, '')}.png`

/** One `questTopTable` row. */
export const topRow = (label: string, value: string): string => `! ''' ${label}: '''\n| ${value}`

/** The level the journal states, or the placeholder. */
const minLevel = (c: QuestPageContext): string => (c.journal?.minLevel === undefined ? '?' : String(c.journal.minLevel))

function topTable(log: QuestLog, c: QuestPageContext): string {
  const start = log.zone ?? c.journal?.zone
  const rows = [
    topRow('Start Zone', start === undefined || start === null ? '?' : zoneOf(start, c)),
    topRow('Quest Giver', log.giver === undefined || log.giver === null ? '?' : npcOf(log.giver, c)),
    topRow('Minimum Level', minLevel(c)),
    topRow('Classes', '?'),
    topRow('Related Zones', linkList(relatedZones(log), (z) => zoneOf(z, c))),
    topRow('Related NPCs', linkList(relatedNpcs(log), (n) => npcOf(n, c)))
  ]
  return `{| class="questTopTable"\n${rows.join('\n|-\n')}\n|}`
}

/** The reward items as the wiki lists them: `<ul><li>{{:Item}}</li></ul>`. */
export const rewardList = (items: readonly string[]): string[] => items.map((i, n) => `${n === 0 ? '<ul>' : ''}<li>{{:${i}}}</li>${n === items.length - 1 ? '</ul>' : ''}`)

function rewardSection(log: QuestLog): string {
  const r = questRewards(log)
  const items = rewardList(r?.items ?? [])
  const lines = items.length > 0 ? items : r?.experience === true ? ['* Experience'] : ['?']
  return ['== Reward ==', '', ...lines].join('\n')
}

/** One step as a checklist line: who, what was said or handed over, what came of it. */
function checkLine(s: QuestStep, c: QuestPageContext): string | undefined {
  const who = s.npc === undefined ? undefined : npcOf(s.npc, c)
  const where = s.zone === undefined ? '' : ` in ${zoneOf(s.zone, c)}`
  const said = stepKeyword(s)
  const handed = (s.offered ?? []).map((i) => `[[${i}]]`).join(' and ')
  const got = (s.given ?? []).map((i) => `[[${i}]]`).join(' and ')
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
  const lines = log.steps.map((s) => checkLine(s, c)).filter((l): l is string => l !== undefined)
  const next = questRewards(log)?.next
  if (next !== undefined) lines.push(`* Receive the [[${next}]] quest.`)
  if (lines.length === 0) lines.push(`* Finish ${name}.`)
  return ['== Checklist ==', '{{CheckboxList}}', ...lines, '{{End}}'].join('\n')
}

/**
 * One walkthrough block: what kind of line it is (the merge tests each kind its own way) and its
 * lines. A block is one line, but a facblock is its `<div>` and every faction line inside it.
 */
export interface WalkBlock {
  kind: 'say' | 'npc' | 'give' | 'receive' | 'task' | 'faction' | 'experience'
  lines: string[]
  /** What the block names: the words said, the item, the faction lines. */
  keys: string[]
}

/** One step in the walkthrough: the talk, what was handed over and given, the task line, its factions. */
function walkStep(name: string, s: QuestStep, c: QuestPageContext): WalkBlock[] {
  const talk = (s.talk ?? []).map((t): WalkBlock => {
    const text = scrubPlayers(t.text, c.players)
    return t.who === 'You' ? { kind: 'say', lines: [`You say, '${text}'`], keys: [text] } : { kind: 'npc', lines: [`: ${t.who} says, '${text}'`], keys: [text] }
  })
  const task = s.kind === 'assigned' ? `'''You have been assigned the task '${name}'.'''` : `'''Your task '${name}' has been updated.'''`
  const fac = (s.factions ?? []).map((f) => `* ${f.line.replace(` with ${f.faction} `, ` with [[${f.faction}]] `)}`)
  const to = s.npc === undefined ? '' : ` to ${npcOf(s.npc, c)}`
  return [
    ...talk,
    ...(s.offered ?? []).map((i): WalkBlock => ({ kind: 'give', lines: [`Give [[${i}]]${to}:`], keys: [i] })),
    ...(s.given ?? []).map((i): WalkBlock => ({ kind: 'receive', lines: [`'''You receive [[${i}]].'''`], keys: [i] })),
    { kind: 'task', lines: [task], keys: [task] },
    ...(fac.length === 0 ? [] : [{ kind: 'faction' as const, lines: ['<div class="facblock">', ...fac, '</div>'], keys: fac }]),
    ...(s.experience === true ? [{ kind: 'experience' as const, lines: ['{{YouGainExperience}}'], keys: [] }] : [])
  ]
}

/** The walkthrough's blocks, step by step. */
export const questWalkBlocks = (name: string, log: QuestLog, c: QuestPageContext = {}): WalkBlock[] => log.steps.flatMap((s) => walkStep(name, s, c))

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
  const giver = log.giver ?? undefined
  const picture = giver === undefined ? [] : [`[[File:${npcFile(giver)}|thumb|${giver}]]`]
  const walk = walkLines(questWalkBlocks(name, log, c))
  // The class category is the editor's to pick: the log never states which classes may take it.
  const cats = ['[[Category:Quests]]', ...(log.zone === undefined || log.zone === null ? [] : [zoneCategory(log.zone, c)]), '<!-- [[Category:All Classes Quests]] or [[Category:<Class> Quests]] -->']
  return [era, ...picture, topTable(log, c), '', rewardSection(log), '', summarySection(name, log, c), '', '== Walkthrough ==', '', ...walk, ...cats].join('\n') + '\n'
}

/** A page's list compared by name: the catalog writes `[[Freeport|West Freeport]]` cells as their shown text. */
const lacks = (list: readonly string[] | undefined, name: string): boolean => !(list ?? []).some((n) => n.toLowerCase().replace(/`/g, "'") === name.toLowerCase().replace(/`/g, "'"))

/**
 * What a page the wiki has is missing that the log or the journal can fill, as the top-table rows to
 * paste: `[label, value]`. Empty when the log can tell of nothing missing.
 */
export function questPageGaps(entry: QuestCatalogEntry, log: QuestLog, c: QuestPageContext = {}): [string, string][] {
  const zone = log.zone ?? undefined
  const giver = log.giver ?? undefined
  const level = c.journal?.minLevel
  const blank = (v: string | undefined): boolean => (v ?? '') === ''
  return [
    ...(blank(entry.startZone) && zone !== undefined ? [['Start Zone', zoneOf(zone, c)] as [string, string]] : []),
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
