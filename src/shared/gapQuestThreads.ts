// shared/gapQuestThreads.ts — quest chains the engine rebuilds from the log for quests with no task line
// (owner, 2026-10-23: "would be nice if the thing could tie the steps together automatically? like i
// hail someone, then i say the keyword, then i go kill something or do something, and get an item, turn
// it in, etc"). The engine (`gaps_threads.rs`) serves `questThreads`; this file is the shape, the key a
// thread is known by, and the walk from a thread to the QuestLog the page writer reads.

import type { QuestLog, QuestStep } from './gapQuests'

/** What a step is. `travel` is a zone change inside the chain. */
export type ThreadStepKind = 'talk' | 'kill' | 'loot' | 'buy' | 'receive' | 'handin' | 'reward' | 'travel'

/**
 * Why a step follows another (owner, 2026-10-23: "a graph of nodes"): `keyword` (the player said the NPC's
 * `[keyword]`), `goask` ("Go ask my son Doug for 'more work'"), `named` (an NPC's words name this NPC or
 * mob), `sent` ("Go talk to my old man": where that led), `item` (an item bought or looted here is
 * handed in there; a kill's loot), `return` (back to the NPC that asked for it). `start` has no link.
 */
export type ThreadWhy = 'start' | 'keyword' | 'goask' | 'named' | 'sent' | 'item' | 'return'

/** One edge into a step: the step it follows, why, and the words the UI shows ("said [help]"). */
export interface ThreadLink {
  from: string
  why: Exclude<ThreadWhy, 'start'>
  detail: string
}

export interface ThreadItem {
  name: string
  n: number
}

export interface ThreadLine {
  /** `You` or the NPC's name. */
  who: string
  text: string
  ms?: number
}

export interface ThreadStep {
  /** `ask:Old Doug:help`, `handin:Dead Doug:Fragile Pet's Skull`: stable while the log does not change. */
  id: string
  /** The log's stamp of the step's first line, `2026-10-23 17:36:17`. */
  at: string
  ms: number
  kind: ThreadStepKind
  why: ThreadWhy
  /** The NPC talked to, bought from, given by or handed to. */
  npc?: string
  zone?: string
  /** The player's says to the NPC in this step (keywords), in order. */
  said?: string[]
  /** The talk itself; an NPC line naming the player says Soandso. */
  lines?: ThreadLine[]
  /** Items looted, bought, received or handed in. */
  items?: ThreadItem[]
  /** A kill step's mob, and how many were slain. */
  mob?: string
  count?: number
  experience?: boolean
  factions?: { faction: string; line: string }[]
  achievements?: string[]
  /** The edges into this step from earlier ones in the chain; `why` is the first one's. */
  links?: ThreadLink[]
}

/** A chain: its steps in topological order (evidence first, time only between equals). */
export interface QuestThread {
  /** `<giver>@<start ms>`: stable while the log does not change before it. */
  id: string
  giver: string
  zone?: string
  startMs: number
  endMs: number
  /** A suggested name; the player renames on Accept. */
  name: string
  steps: ThreadStep[]
  /** Items that arrived in a hand-in's second: the chain's rewards. */
  rewards?: ThreadItem[]
}

/** The key a thread is stored and matched by. */
export const threadKey = (t: Pick<QuestThread, 'id'>): string => t.id

/** `6 [[a fragile pet]]`: a count and a link, as the pages write them. */
const counted = (n: number | undefined, name: string): string => `${n !== undefined && n > 1 ? `${String(n)} ` : ''}[[${name}]]`

/** How many of each item the chain's hand-ins took: what a page says to loot, not every drop. */
function handedCounts(t: QuestThread): Map<string, number> {
  const n = new Map<string, number>()
  for (const s of t.steps) if (s.kind === 'handin') for (const i of s.items ?? []) n.set(i.name, (n.get(i.name) ?? 0) + i.n)
  return n
}

/**
 * A kill, loot or purchase as the line the page says it in. A loot whose mob the chain also killed is
 * one line, the count the hand-in took: "Kill [[a fragile pet]] and loot 6 [[Fragile Pet's Skull]]."
 */
function noteOf(s: ThreadStep, handed: ReadonlyMap<string, number>, killed: ReadonlySet<string>): string | undefined {
  const needed = (s.items ?? []).map((i) => counted(Math.min(i.n, handed.get(i.name) ?? i.n), i.name)).join(' and ')
  if (s.kind === 'kill' && s.mob !== undefined) return `Kill ${counted(s.count, s.mob)}.`
  if (s.kind === 'loot' && s.mob !== undefined) return killed.has(s.mob) ? `Kill [[${s.mob}]] and loot ${needed}.` : `Loot ${needed} from [[${s.mob}]].`
  if (s.kind === 'buy' && s.npc !== undefined) return `Buy ${needed} from [[${s.npc}]].`
  return undefined
}

/** One chain step as the page writer's step: talk with its lines, a hand-in's items, the rest as a note. */
function questStep(s: ThreadStep, handed: ReadonlyMap<string, number>, killed: ReadonlySet<string>): QuestStep {
  const base: QuestStep = { at: s.at, kind: 'talk', ...(s.npc === undefined ? {} : { npc: s.npc }), ...(s.zone === undefined ? {} : { zone: s.zone }) }
  const talk = (s.lines ?? []).map((l) => ({ who: l.who, text: l.text, ...(l.ms === undefined ? {} : { ms: l.ms }) }))
  if (s.kind === 'handin') {
    const offered = (s.items ?? []).flatMap((i) => Array.from({ length: i.n }, () => i.name))
    // The hand-over comes before the NPC's answer to it, as the pages write it ("Hand X to NPC:", then its words).
    const first = Math.min(s.ms, ...talk.map((l) => l.ms ?? s.ms))
    const answers = talk.map((l) => ({ ...l, ms: l.ms ?? s.ms }))
    return { ...base, talk: answers, offered, offeredMs: offered.map(() => first - 1), ...(s.experience === true ? { experience: true } : {}), ...(s.factions === undefined ? {} : { factions: s.factions }), ...(s.achievements === undefined ? {} : { achievements: s.achievements }) }
  }
  const note = noteOf(s, handed, killed)
  return note === undefined ? { ...base, talk } : { ...base, note }
}

/** A chain as the QuestLog the page writer reads: its steps in the chain's order, its giver and zone. */
export function questLogFromThread(t: QuestThread): QuestLog {
  const npcs = [...new Set(t.steps.map((s) => s.npc).filter((n): n is string => n !== undefined))]
  const handed = handedCounts(t)
  // A kill whose mob a later loot names is said in that loot's line.
  const killed = new Set(t.steps.flatMap((s) => (s.kind === 'loot' && s.mob !== undefined ? [s.mob] : [])))
  // A keyword said to the wrong NPC, answered only with "go ask X for 'kw'", is the next step's to say.
  const redirected = new Set(t.steps.flatMap((s) => (s.links ?? []).filter((l) => l.why === 'goask').map((l) => l.from)))
  const resaid = (s: ThreadStep): boolean => s.kind === 'talk' && redirected.has(s.id) && t.steps.some((n) => n.kind === 'talk' && n.npc !== s.npc && n.said?.[0] === s.said?.[0])
  const steps = t.steps.filter((s) => !(s.kind === 'kill' && s.mob !== undefined && killed.has(s.mob)) && !resaid(s))
  return { giver: t.giver, zone: t.zone ?? null, npcs, steps: steps.map((s) => questStep(s, handed, killed)), reruns: 0, forced: true }
}

const itemsText = (s: ThreadStep): string => (s.items ?? []).map((i) => `${i.n > 1 ? `${String(i.n)} ` : ''}${i.name}`).join(' and ')

const many = (n: number | undefined): string => (n !== undefined && n > 1 ? `${String(n)} ` : '')

/** Each kind's few words; `who` is the NPC or the mob. */
const LABELS: Partial<Record<ThreadStepKind, (s: ThreadStep, who: string) => string>> = {
  talk: (s, who) => (s.said?.[0] === undefined ? `Hail ${who}` : `Say '${s.said[0]}' to ${who}`),
  kill: (s, who) => `Kill ${many(s.count)}${who}`,
  loot: (s, who) => `Loot ${itemsText(s)} from ${who}`,
  buy: (s, who) => `Buy ${itemsText(s)} from ${who}`,
  handin: (s, who) => `Hand ${itemsText(s)} to ${who}${s.experience === true ? ' (experience)' : ''}`
}

/** A step in a few words, for the Suggested quests list: "Say 'help' to Old Doug", "Kill 6 a fragile pet". */
export function threadStepLabel(s: ThreadStep): string {
  const who = s.npc ?? s.mob ?? ''
  return LABELS[s.kind]?.(s, who) ?? who
}

/** Why a step follows the ones before it, in the words the log gave: "said [help]", "named Dougina". */
export const threadStepWhy = (s: ThreadStep): string => [...new Set((s.links ?? []).map((l) => l.detail))].join(' · ')
