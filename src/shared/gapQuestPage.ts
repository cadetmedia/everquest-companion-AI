// shared/gapQuestPage.ts — Copy wiki page for a Quests row (owner, 2026-10-22). Two jobs:
//
//   NO PAGE YET: a full draft in the cached quest pages' layout (page-15332, Yiz Pon's quest): the
//   `questTopTable` (Starts In, Quest Giver, Minimum Level, Classes, Related Zones, Related NPCs,
//   Required Faction), `= Reward =`, `= Summary =` as a `{{CheckboxList}}` ... `{{End}}`, and
//   `= Walkthrough =` with the log's own talk (`You say, '...'`, `: NPC says, '...'`), the task lines
//   in bold, a `facblock` for the faction lines and `{{YouGainExperience}}`. A cell the log cannot
//   fill is `?`, the wiki's own placeholder, never a guess.
//
//   A PAGE EXISTS: only what the page is missing or holds a placeholder for, as the top-table rows
//   to paste (a Minimum Level, a giver, a start zone, Related NPCs the log met). Never a walkthrough
//   (owner: "i don't need the walkthrough someone else seems to have been doing the detailed page").

import { CURRENT_ERA } from './planner/era'
import { wikiZoneLink } from './gapWikiZone'
import { roleLine, roleOf } from './gapRoles'
import { questLogOf, questPageTitle, questRewards, questRowLines, relatedNpcs, relatedZones, stepKeyword, type QuestCatalogEntry, type QuestJournalFacts, type QuestLog, type QuestStep } from './gapQuests'

/** What the page text needs beside the log: the wiki's spellings and the journal's reading. */
export interface QuestPageContext {
  zoneName?: (raw: string) => string
  mobPage?: (name: string) => string | undefined
  journal?: QuestJournalFacts
}

const zoneOf = (z: string, c: QuestPageContext): string => wikiZoneLink(c.zoneName?.(z) ?? z)
const npcOf = (n: string, c: QuestPageContext): string => `[[${c.mobPage?.(n) ?? n}]]`
const linkList = (names: readonly string[], link: (n: string) => string): string => (names.length === 0 ? 'None' : names.map(link).join(', '))

/** `npc_nikko_canti.png`, as the wiki names an NPC's picture (wikiPage.ts npcImageName, restated: no import cycle). */
const npcFile = (name: string): string => `npc_${name.trim().toLowerCase().replace(/[\\/:*?"<>|#[\]{}]/g, '_').replace(/[\s_]+/g, '_').replace(/^_|_$/g, '')}.png`

/** One `questTopTable` row. */
const topRow = (label: string, value: string): string => `! ''' ${label}: '''\n| ${value}`

/** The level the journal states, or the placeholder. */
const minLevel = (c: QuestPageContext): string => (c.journal?.minLevel === undefined ? '?' : String(c.journal.minLevel))

function topTable(log: QuestLog, c: QuestPageContext): string {
  const start = log.zone ?? c.journal?.zone
  const rows = [
    topRow('Starts In', start === undefined || start === null ? '?' : zoneOf(start, c)),
    topRow('Quest Giver', log.giver === undefined || log.giver === null ? '?' : npcOf(log.giver, c)),
    topRow('Minimum Level', minLevel(c)),
    topRow('Classes', '?'),
    topRow('Related Zones', linkList(relatedZones(log), (z) => zoneOf(z, c))),
    topRow('Related NPCs', linkList(relatedNpcs(log), (n) => npcOf(n, c))),
    topRow('Required Faction', '?')
  ]
  return `{| class="questTopTable"\n${rows.join('\n|-\n')}\n|}`
}

function rewardSection(log: QuestLog): string {
  const r = questRewards(log)
  const items = (r?.items ?? []).map((i) => `<li>{{:${i}}}</li>`)
  const lines = items.length > 0 ? ['<ul>', ...items, '</ul>'] : r?.experience === true ? ['* Experience'] : ['?']
  return ['= Reward =', '', ...lines].join('\n')
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
  return ['= Summary =', '{{CheckboxList}}', ...lines, '{{End}}'].join('\n')
}

/** One step in the walkthrough: the talk, what was handed over and given, the task line, its factions. */
function walkStep(name: string, s: QuestStep): string[] {
  const talk = (s.talk ?? []).map((t) => (t.who === 'You' ? `You say, '${t.text}'` : `: ${t.who} says, '${t.text}'`))
  const task = s.kind === 'assigned' ? `'''You have been assigned the task '${name}'.'''` : `'''Your task '${name}' has been updated.'''`
  const fac = (s.factions ?? []).map((f) => `* ${f.line.replace(` with ${f.faction} `, ` with [[${f.faction}]] `)}`)
  return [
    ...talk,
    ...(s.offered ?? []).map((i) => `'''You give [[${i}]] to ${s.npc ?? '?'}.'''`),
    ...(s.given ?? []).map((i) => `'''You receive [[${i}]].'''`),
    task,
    ...(fac.length === 0 ? [] : ['<div class="facblock">', ...fac, '</div>']),
    ...(s.experience === true ? ['{{YouGainExperience}}'] : [])
  ]
}

/** The page the wiki has no copy of yet, from the log (and the journal's level, when read). */
export function questDraftPage(name: string, log: QuestLog, c: QuestPageContext = {}): string {
  const era = `{{${CURRENT_ERA.charAt(0).toUpperCase()}${CURRENT_ERA.slice(1)} Era}}`
  const giver = log.giver ?? undefined
  const picture = giver === undefined ? [] : [`[[File:${npcFile(giver)}|thumb|${giver}]]`]
  const walk = log.steps.flatMap((s) => ['', ...walkStep(name, s)])
  const cats = ['[[Category:Quests]]', ...(log.zone === undefined || log.zone === null ? [] : [`[[Category:${c.zoneName?.(log.zone) ?? log.zone}]]`])]
  return [era, ...picture, topTable(log, c), '', rewardSection(log), '', summarySection(name, log, c), '', '= Walkthrough =', ...walk, '', ...cats].join('\n') + '\n'
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
    ...(blank(entry.startZone) && zone !== undefined ? [['Starts In', zoneOf(zone, c)] as [string, string]] : []),
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
