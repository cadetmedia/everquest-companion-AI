// shared/gapQuests.ts — the Quests domain's rows (owner, 2026-10-22: "quest pages worked out from the
// log and the Quest Journal"). The engine serves one row per task the log names, with its steps
// (gaps_quest_log.rs, `quest`): who gave it, where, each update with the NPC, the talk before it, the
// items handed over and given, the faction lines, experience and the next task. Here: the types,
// whether the wiki has the page (the quest catalog, quests.json), what its page lacks, the rewards,
// the row's detail lines, and the guess for an item a quest handed over with no log line.
//
// All of it fixed rules over the log, the inventory export and the Quest Journal's reading: no AI
// (owner: "make sure the tool can extract this on it's own in the future without using you").

import { wikiCreateUrl, wikiEditUrl } from './gapUrls'
import { ZONES } from './zones'

/** One line of a step's talk: `You` or the NPC. */
export interface QuestTalk {
  who: string
  text: string
}

/** One task line, as the engine serves it. */
export interface QuestStep {
  /** The log's stamp, `2026-10-22 21:00:12`. */
  at: string
  kind: 'assigned' | 'updated'
  npc?: string
  zone?: string
  talk?: QuestTalk[]
  offered?: string[]
  given?: string[]
  factions?: { faction: string; line: string }[]
  experience?: boolean
  next?: string
  /** `You have completed achievement: X` within 15 s after the step. */
  achievements?: string[]
}

/** A Quests row's `quest`. */
export interface QuestLog {
  giver?: string | null
  zone?: string | null
  npcs: string[]
  steps: QuestStep[]
  reruns: number
}

/** The engine's log on a Quests row; read here rather than typed on `GapRow`, which sits at its size bar. */
export const questLogOf = (row: object): QuestLog | undefined => (row as { quest?: QuestLog }).quest

/** What the quest catalog (quests.json, scripts/sources/questPage.ts) states of a page. */
export interface QuestCatalogEntry {
  name: string
  page: string
  startZone?: string
  giver?: string
  minLevel?: number
  classes?: string[]
  relatedZones?: string[]
  relatedNpcs?: string[]
  rewards?: { name: string }[]
  expReward?: boolean
}

/** What the page writers read of quests beside the row: the catalog's entry, the journal's reading. */
export interface QuestExtras {
  /** A quest's catalog entry when the wiki has its page (quests.json). */
  questEntry?: (name: string) => QuestCatalogEntry | undefined
  /** What a pasted Quest Journal said of it (screenshot-to-wiki `questJournal.ts`). */
  questJournal?: (name: string) => QuestJournalFacts | undefined
  /** The player's own characters, written `Soandso` on a quest page. */
  players?: readonly string[]
}

/** What a Quest Journal screenshot read (screenshot-to-wiki `questJournal.ts`), as the page needs it. */
export interface QuestJournalFacts {
  zone?: string
  minLevel?: number
  maxLevel?: number
  objectives?: { text: string; status?: string; zone?: string }[]
  description?: string
}

/**
 * A quest title as the page check compares it (owner, 2026-10-22): the game's backtick is the wiki's
 * apostrophe (`What`s going on here?`), a trailing `?` is optional, case and spacing are free.
 */
export const questTitleKey = (title: string): string =>
  title
    .replace(/[`’]/g, "'")
    .replace(/_/g, ' ')
    .replace(/\?+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** The catalog's entry for a task name, by `questTitleKey`. */
export function questCatalogFinder(entries: readonly QuestCatalogEntry[]): (name: string) => QuestCatalogEntry | undefined {
  const by = new Map<string, QuestCatalogEntry>()
  for (const e of entries) {
    for (const t of [e.page, e.name]) if (!by.has(questTitleKey(t))) by.set(questTitleKey(t), e)
  }
  return (name) => by.get(questTitleKey(name))
}

/** What a quest gave at its end: the last step with a faction line or experience. */
export interface QuestRewards {
  items: string[]
  factions: { faction: string; line: string }[]
  experience: boolean
  next?: string
}

export function questRewards(log: QuestLog): QuestRewards | undefined {
  const end = [...log.steps].reverse().find((s) => (s.factions?.length ?? 0) > 0 || s.experience === true)
  if (end === undefined) return undefined
  return { items: end.given ?? [], factions: end.factions ?? [], experience: end.experience === true, ...(end.next === undefined ? {} : { next: end.next }) }
}

/** The player's last words before a step: the keyword that moved it. */
export function stepKeyword(s: QuestStep): string | undefined {
  const mine = (s.talk ?? []).filter((t) => t.who === 'You' && !t.text.startsWith('Hail, '))
  return mine.at(-1)?.text
}

/** The NPCs a quest names beyond its giver, in the order met. */
export function relatedNpcs(log: QuestLog): string[] {
  return log.npcs.filter((n) => n !== log.giver)
}

/** The zones a quest's steps were in beyond the one it started in. */
export function relatedZones(log: QuestLog): string[] {
  const zones = log.steps.map((s) => s.zone ?? '').filter((z) => z !== '' && z !== log.zone)
  return [...new Set(zones)]
}

/** One step as a detail line: `21:00:12 assigned · Nikko Canti · said help · gave Fresh Fish`. */
function stepLine(s: QuestStep): string {
  const said = stepKeyword(s)
  const bits = [
    `${s.at.slice(11)} ${s.kind}`,
    ...(s.npc === undefined ? [] : [s.npc]),
    ...(said === undefined ? [] : [`said "${said}"`]),
    ...((s.offered ?? []).length === 0 ? [] : [`handed over ${(s.offered ?? []).join(', ')}`]),
    ...((s.given ?? []).length === 0 ? [] : [`given ${(s.given ?? []).join(', ')}`]),
    ...(s.next === undefined ? [] : [`next: ${s.next}`])
  ]
  return bits.join(' · ')
}

/** A Quests row's detail lines: the giver, the steps, the rewards, and what its page lacks. */
export function questRowLines(log: QuestLog | undefined, missing: readonly string[] = []): string[] {
  if (log === undefined) return []
  const r = questRewards(log)
  const reward = r === undefined ? [] : [`Reward: ${[...r.items, ...r.factions.map((f) => f.faction), ...(r.experience ? ['experience'] : [])].join(', ')}`]
  return [
    ...(log.giver === undefined || log.giver === null ? [] : [`Given by ${log.giver}${log.zone === undefined || log.zone === null ? '' : ` in ${log.zone}`}`]),
    ...log.steps.map(stepLine),
    ...reward,
    ...(log.reruns > 0 ? [`Done again ${String(log.reruns)} time${log.reruns === 1 ? '' : 's'} (steps from the first run)`] : []),
    ...missing.map((m) => `Page lacks: ${m}`)
  ]
}

// ---- items a quest handed over with no log line --------------------------------------------------

/** Words too common to tie an item to an NPC's line. */
const STOPWORDS = new Set(['about', 'their', 'there', 'these', 'those', 'which', 'would', 'could', 'should', 'other', 'where', 'while', 'after', 'before', 'under', 'small', 'large', 'great'])

/**
 * The words of the zones' names: a place an NPC talks of is no tie to an item named after it
 * (measured on the owner's log, 2026-10-22: "Appeal of Neriak" matched Dorian's "...ventured into
 * Neriak..." in Alchemical Solution, an hour before the quest that handed it over).
 */
let placeWords: ReadonlySet<string> | undefined
function isPlaceWord(w: string): boolean {
  placeWords ??= new Set(ZONES.flatMap((z) => [z.name, ...(z.aliases ?? [])]).flatMap((n) => n.toLowerCase().split(/[^a-z]+/)))
  return placeWords.has(w)
}

/** The item name's distinctive words: five letters or more, no stopword, no place name, lower case. */
export function distinctiveWords(item: string): string[] {
  return item
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 5 && !STOPWORDS.has(w) && !isPlaceWord(w))
}

/** Whether `text` holds `word` as a word or a word's start (`petition` in "petition for aid", "petitions"). */
const holdsWord = (text: string, word: string): boolean => text.toLowerCase().split(/[^a-z]+/).some((t) => t.startsWith(word))

/** A guessed giver for an item no log line named. */
export interface SilentGiver {
  npc: string
  quest: string
  zone?: string
  at: string
}

/**
 * SILENT HAND-OVERS (owner, 2026-10-22: Solusek Petition, in the export, never in the log): the
 * latest quest step before `before` (the export's stamp, the log's shape) whose NPC, in that step's
 * talk, said a distinctive word of the item's name. Call for Aid at 23:17:17: Dorian G`Wyn, "...the
 * right contacts to petition for aid...". A guess: shown as one, never written into a page.
 */
export function silentGiver(item: string, before: string, quests: readonly { name: string; log: QuestLog }[]): SilentGiver | undefined {
  const words = distinctiveWords(item)
  if (words.length === 0) return undefined
  let best: SilentGiver | undefined
  for (const { name, log } of quests) {
    for (const s of log.steps) {
      if (s.npc === undefined || s.at >= before || (best !== undefined && s.at <= best.at)) continue
      const said = (s.talk ?? []).filter((t) => t.who === s.npc).map((t) => t.text)
      if (said.some((t) => words.some((w) => holdsWord(t, w)))) best = { npc: s.npc, quest: name, at: s.at, ...(s.zone === undefined ? {} : { zone: s.zone }) }
    }
  }
  return best
}

// ---- the row's chip ------------------------------------------------------------------------------

/**
 * A Quests row's chip: fill the page the wiki has (`row.page`, set from the quest catalog), or make
 * the page it lacks. The wiki's editor either way; Copy wiki page gives the rows or the draft.
 */
export function questAction(row: { name: string; page?: string }): { kind: 'checkWiki' | 'addToWiki'; label: string; why: string; href: string } {
  if (row.page !== undefined) {
    return { kind: 'checkWiki', label: 'Update page', why: `The wiki has ${row.page}: add what it is missing from your log (Copy wiki page gives the rows).`, href: wikiEditUrl(row.page) }
  }
  return { kind: 'addToWiki', label: 'Make page', why: 'The wiki data has no page for this quest: Copy wiki page gives a draft from your log.', href: wikiCreateUrl(questPageTitle(row.name)) }
}

/** The title a new quest page takes: the game's backtick as the wiki's apostrophe (`What's going on here?`). */
export const questPageTitle = (name: string): string => name.replace(/`/g, "'")

/** The snapshot with each Quests row's `page` set when the catalog has its quest; the same object when none is. */
export function withQuestPages<S extends { rows: { domain: string; name: string; page?: string }[] }>(snap: S, find: (name: string) => QuestCatalogEntry | undefined): S {
  if (!snap.rows.some((r) => r.domain === 'quest' && find(r.name) !== undefined)) return snap
  const rows = snap.rows.map((r) => {
    const page = r.domain === 'quest' ? find(r.name)?.page : undefined
    return page === undefined ? r : { ...r, page }
  })
  return { ...snap, rows }
}

/** The log's quests among the rows, each with its steps: what the silent hand-over guess reads. */
export function questsOfRows(rows: readonly { domain: string; name: string }[]): { name: string; log: QuestLog }[] {
  return rows.flatMap((r) => {
    const log = r.domain === 'quest' ? questLogOf(r) : undefined
    return log === undefined ? [] : [{ name: r.name, log }]
  })
}
