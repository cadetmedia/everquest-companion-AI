// shared/gapForcedQuests.ts — quests the player names by hand (owner, 2026-10-23: "i need to be able to
// force a quest association"). Some quests print no task line: the EverQuest Legends Tutorial's Doug
// gives errands by talk alone. The engine serves the NPC visits no task line claimed
// (gaps_exchanges.rs, the snapshot's `talks`); the player picks visits and names the quest, or adds
// visits to a quest the log already has. The visits are kept whole in the association, so it outlives
// the engine's window of the newest 200.

import type { GapDetails, GapRow, GapsSnap } from './gaps'
import { questLogOf, questTitleKey, type QuestLog, type QuestStep, type QuestTalk } from './gapQuests'
import { questFactsOf } from './itemQuestFacts'
import { questLogFromThread, type QuestThread } from './gapQuestThreads'

/** One NPC visit as the engine serves it (gaps_exchanges.rs `Exchange`). */
export interface TalkVisit {
  /** `<npc>@<start ms>`. */
  id: string
  npc: string
  zone?: string
  /** The log's stamp of its first line. */
  at: string
  startMs: number
  endMs: number
  talk: QuestTalk[]
  offered?: string[]
  given?: string[]
}

/** A quest the player named, and the visits it holds, or the chain the log rebuilt that they accepted. */
export interface ForcedQuest {
  name: string
  visits: TalkVisit[]
  thread?: QuestThread
}

/** One character's forced quests, by `questTitleKey` of the name. */
export type ForcedQuestMap = Record<string, ForcedQuest>

/** What the engine serves beside the rows for this (gaps.rs `snapshot`). */
export interface TalkSnap {
  talks?: TalkVisit[]
  /** The chains rebuilt from the log for quests with no task line (gaps_threads.rs). */
  questThreads?: QuestThread[]
  character?: string | null
}

/** A visit as steps: one per thing the player said (a hail opens the first), each with the NPC's answers. */
function visitSteps(v: TalkVisit): QuestStep[] {
  const steps: QuestStep[] = []
  for (const t of v.talk) {
    if (t.who === 'You' || steps.length === 0) steps.push({ at: v.at, kind: 'talk', npc: v.npc, ...(v.zone === undefined ? {} : { zone: v.zone }), talk: [] })
    steps[steps.length - 1].talk?.push(t)
  }
  const last = steps.at(-1)
  if (last !== undefined) Object.assign(last, (v.offered ?? []).length > 0 ? { offered: v.offered } : {}, (v.given ?? []).length > 0 ? { given: v.given } : {})
  return steps
}

/** A quest's log from the visits it holds, oldest first: the first visit's NPC gave it, in its zone. */
export function questLogFromVisits(visits: readonly TalkVisit[]): QuestLog {
  const sorted = [...visits].sort((a, b) => a.startMs - b.startMs)
  const npcs = [...new Set(sorted.map((v) => v.npc))]
  return { giver: sorted[0]?.npc ?? null, zone: sorted[0]?.zone ?? null, npcs, steps: sorted.flatMap(visitSteps), reruns: 0, forced: true }
}

/** A task quest's log with visits the player added: their steps in time, the NPCs joined. */
function withVisits(log: QuestLog, visits: readonly TalkVisit[]): QuestLog {
  const added = questLogFromVisits(visits)
  const npcs = [...log.npcs, ...added.npcs.filter((n) => !log.npcs.includes(n))]
  return { ...log, npcs, steps: [...log.steps, ...added.steps].sort((a, b) => a.at.localeCompare(b.at)) }
}

/** Whether a Quests row was named by the player, not by a task line (`added by you`). */
export const isForcedRow = (row: object): boolean => questLogOf(row)?.forced === true

/** How many visits the player added to a row, forced or not. */
export const addedVisits = (row: object): number => (row as { addedVisits?: number }).addedVisits ?? 0

/** An accepted chain's row: its steps' time span and zones, the log the page writer reads. */
function threadRow(q: ForcedQuest, t: QuestThread): GapRow {
  const zones = [...new Set(t.steps.map((s) => s.zone).filter((z): z is string => z !== undefined))]
  const samples = t.steps.flatMap((s) => (s.lines ?? []).map((l) => (l.who === 'You' ? `You say, '${l.text}'` : `${l.who} says, '${l.text}'`))).slice(-3)
  const details: GapDetails = { samples, ...(zones.length === 0 ? {} : { zones: { entries: zones.map((name) => ({ name, n: 1 })), distinct: zones.length, all: zones } }) }
  const row: GapRow = { domain: 'quest', name: q.name, kinds: ['hailed'], count: t.steps.length, first: t.steps[0]?.at ?? '', last: t.steps.at(-1)?.at ?? '', details }
  return Object.assign(row, { quest: questLogFromThread(t), addedVisits: 0 })
}

function forcedRow(q: ForcedQuest): GapRow {
  if (q.thread !== undefined) return threadRow(q, q.thread)
  const sorted = [...q.visits].sort((a, b) => a.startMs - b.startMs)
  const zones = [...new Set(sorted.map((v) => v.zone).filter((z): z is string => z !== undefined))]
  // The last three lines, as the log printed them: the row's samples.
  const samples = sorted.flatMap((v) => v.talk.map((t) => (t.who === 'You' ? `You say, '${t.text}'` : `${t.who} says, '${t.text}'`))).slice(-3)
  const details: GapDetails = { samples, ...(zones.length === 0 ? {} : { zones: { entries: zones.map((name) => ({ name, n: 1 })), distinct: zones.length, all: zones } }) }
  const row: GapRow = { domain: 'quest', name: q.name, kinds: ['hailed'], count: sorted.length, first: sorted[0]?.at ?? '', last: sorted.at(-1)?.at ?? '', details }
  return Object.assign(row, { quest: questLogFromVisits(sorted), addedVisits: sorted.length })
}

/** A quest and the NPCs and items it touched: what their own pages' quest lists gain. */
export interface QuestLink {
  quest: string
  npcs?: readonly string[]
  items?: readonly string[]
}

const nameKey = (s: string): string => s.trim().toLowerCase().replace(/[`’]/g, "'")

/**
 * The rows with each link's quest in its NPCs' and items' quest facts (`questFacts.quests`, which an
 * NPC page's `related_quests` and an item page's `relatedquests` read), as a task quest's are filled by
 * the engine (owner, 2026-10-23: "update the wiki pages with all the correct quest links and items and
 * npc's"). The popup reader feeds a reward it read the same way.
 */
export function withQuestLinks<R extends { domain: string; name: string }>(rows: readonly R[], links: readonly QuestLink[]): R[] {
  const want = new Map<string, Set<string>>()
  const add = (domains: string, name: string, quest: string): void => {
    for (const d of domains.split('|')) {
      const k = `${d}:${nameKey(name)}`
      want.set(k, (want.get(k) ?? new Set()).add(quest))
    }
  }
  for (const l of links) {
    for (const n of l.npcs ?? []) add('mob|merchant', n, l.quest)
    for (const i of l.items ?? []) add('item', i, l.quest)
  }
  if (want.size === 0) return [...rows]
  return rows.map((r) => {
    const extra = want.get(`${r.domain}:${nameKey(r.name)}`)
    if (extra === undefined) return r
    const facts = questFactsOf(r) ?? {}
    const quests = [...new Set([...(facts.quests ?? []), ...extra])]
    return { ...r, questFacts: { ...facts, quests } }
  })
}

/** A named quest's links: every NPC in its visits, every item handed over or received. */
const linkOf = (q: ForcedQuest): QuestLink => {
  const steps = q.thread?.steps ?? []
  const npcs = [...q.visits.map((v) => v.npc), ...steps.map((s) => s.npc).filter((n): n is string => n !== undefined)]
  const items = [...q.visits.flatMap((v) => [...(v.offered ?? []), ...(v.given ?? [])]), ...steps.flatMap((s) => (s.items ?? []).map((i) => i.name))]
  return { quest: q.name, npcs, items }
}

/**
 * The snapshot with the player's quests in it: a name the log already has as a task gains the visits
 * as steps; any other becomes its own row. The visits they hold leave `talks`, the list to pick from,
 * and the quest joins its NPCs' and items' quest facts (`withQuestLinks`).
 */
export function withForcedQuests<S extends GapsSnap & TalkSnap>(snap: S, forced: ForcedQuestMap | undefined): S {
  const quests = Object.values(forced ?? {}).filter((q) => q.visits.length > 0 || q.thread !== undefined)
  if (quests.length === 0) return snap
  const used = new Set(quests.flatMap((q) => q.visits.map((v) => v.id)))
  const byKey = new Map(quests.map((q) => [questTitleKey(q.name), q]))
  const rows = snap.rows.map((r) => {
    const q = r.domain === 'quest' ? byKey.get(questTitleKey(r.name)) : undefined
    const log = questLogOf(r)
    if (q === undefined || log === undefined) return r
    byKey.delete(questTitleKey(r.name))
    return { ...r, quest: withVisits(log, q.visits), addedVisits: q.visits.length } as GapRow
  })
  const all = withQuestLinks([...rows, ...[...byKey.values()].map(forcedRow)], quests.map(linkOf))
  const taken = new Set(quests.map((q) => q.thread?.id).filter((id): id is string => id !== undefined))
  return { ...snap, rows: all, talks: (snap.talks ?? []).filter((v) => !used.has(v.id)), questThreads: (snap.questThreads ?? []).filter((t) => !taken.has(t.id)) }
}

/** `forced` with `visits` added to the quest `name` (a new one when it has none yet). */
export function withVisitsAdded(forced: ForcedQuestMap, name: string, visits: readonly TalkVisit[]): ForcedQuestMap {
  const key = questTitleKey(name)
  const had = forced[key]?.visits ?? []
  const fresh = visits.filter((v) => !had.some((h) => h.id === v.id))
  return { ...forced, [key]: { name: forced[key]?.name ?? name.trim(), visits: [...had, ...fresh] } }
}

/** `forced` with the chain `thread` accepted as the quest `name`. */
export function withThreadAccepted(forced: ForcedQuestMap, name: string, thread: QuestThread): ForcedQuestMap {
  return { ...forced, [questTitleKey(name)]: { name: name.trim(), visits: [], thread } }
}

/** `forced` without the quest `name`: a forced row goes, a task row loses the visits added to it. */
export function withoutQuest(forced: ForcedQuestMap, name: string): ForcedQuestMap {
  const key = questTitleKey(name)
  return Object.fromEntries(Object.entries(forced).filter(([k]) => k !== key))
}

/** The visits whose ids were ticked, in the list's order. */
export const pickedVisits = (talks: readonly TalkVisit[], picked: ReadonlySet<string>): TalkVisit[] => talks.filter((v) => picked.has(v.id))

/** A visit in a few words, for the picker: its first NPC line, cut at `max` letters. */
export function visitGist(v: TalkVisit, max = 90): string {
  const line = v.talk.find((t) => t.who !== 'You')?.text ?? v.talk[0]?.text ?? ''
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}
