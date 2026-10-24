// shared/gapQuestThreads.ts — quest chains the engine rebuilds from the log for quests with no task line
// (owner, 2026-10-23: "would be nice if the thing could tie the steps together automatically? like i
// hail someone, then i say the keyword, then i go kill something or do something, and get an item, turn
// it in, etc"). The engine (`gaps_threads.rs`) serves `questThreads`; this file is the shape, the key a
// thread is known by, and the walk from a thread to the QuestLog the page writer reads.

import type { QuestLog, QuestStep } from './gapQuests'
import { zoneKey } from './zones'

/** What a step is. `travel` is a zone change inside the chain. */
export type ThreadStepKind = 'talk' | 'kill' | 'loot' | 'buy' | 'receive' | 'handin' | 'reward' | 'travel' | 'collect'

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
  /** A hand-in's items as one trade held them (the requirement), and how many trades repeated it. */
  perTrade?: ThreadItem[]
  trades?: number
  /** A collect step's droppers per item, the most frequent first (threadDisplaySteps). */
  drops?: { item: string; mobs: string[] }[]
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

/** Every zone the chain went through: where it started, then each step's. */
const threadZones = (t: QuestThread): string[] => [...new Set([t.zone, ...t.steps.map((s) => s.zone)].filter((z): z is string => z !== undefined && z !== ''))]

/**
 * The chains the Quests list's own filters let through (owner, 2026-10-23: "why are they not showing
 * the zone i was in, and being filtered when i'm in a different zone?"): "Zone I'm in" keeps a chain
 * that went through that zone, as `gapInZone` keeps a row; the search matches its name, its NPCs and
 * its zones, as `visibleGaps` does.
 */
export function visibleThreads(threads: readonly QuestThread[], query: string, zone: string | null = null): QuestThread[] {
  const q = query.trim().toLowerCase()
  const here = zone === null ? '' : zoneKey(zone)
  return threads.filter((t) => {
    const zones = threadZones(t)
    if (zone !== null && (here === '' || !zones.some((z) => zoneKey(z) === here))) return false
    if (q === '') return true
    const words = [t.name, t.giver, ...zones, ...t.steps.map((s) => s.npc ?? '')]
    return words.some((w) => w.toLowerCase().includes(q))
  })
}

/** The key a thread is stored and matched by. */
export const threadKey = (t: Pick<QuestThread, 'id'>): string => t.id

/** `6 [[a fragile pet]]`: a count and a link, as the pages write them. */
const counted = (n: number | undefined, name: string): string => `${n !== undefined && n > 1 ? `${String(n)} ` : ''}[[${name}]]`

/** Words too common to tell items apart. */
const STOP = new Set(['a', 'an', 'the', 'of', 'from', 'and', 'out', 'old', 'some', 'one', 'with', 'that', 'has', 'its', 'for', 'to', 'in', 'on', 'my', 'your'])

/** An item name's words worth matching, singular: `Burned Out Lightstone` → burned, lightstone. */
const keyWords = (name: string): string[] =>
  name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(?<=[a-z]{3})s$/, ''))

const COUNT_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

/**
 * How many of an item an NPC's words ask for, or undefined when they do not name it. A word of the line
 * matches an item word whole, as its singular, or as part of a compound (`stone` in Lightstone); the word
 * before it gives the count (`a`, `two`, `4`). Vlad Sterovich: "I need a wing from a flying creature of
 * the night, a fang ..., a chip from the aged dead, and a stone that has lost its light" asks 1 of each.
 */
export function askedCount(line: string, item: string): number | undefined {
  const words = line.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const keys = keyWords(item)
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/(?<=[a-z]{3})s$/, '')
    if (w.length < 4 || STOP.has(w)) continue
    if (!keys.some((k) => k === w || (k.length > w.length && k.includes(w)))) continue
    const before = words[i - 1] ?? ''
    const n = COUNT_WORDS[before] ?? (/^\d+$/.test(before) ? Number(before) : undefined)
    return n ?? 1
  }
  return undefined
}

/** The NPC line that asks for a hand-in's items: the last line of that NPC, before the hand-in, naming one of them. */
function askingLine(steps: readonly ThreadStep[], h: ThreadStep): string | undefined {
  const names = (h.items ?? []).map((i) => i.name)
  let found: string | undefined
  for (const s of steps) {
    if (s === h) break
    for (const l of s.lines ?? []) if (l.who === h.npc && names.some((n) => askedCount(l.text, n) !== undefined)) found = l.text
  }
  return found
}

/** The quote a step's reason shows: the start of the line, cut at about 80 letters. */
const quote = (t: string): string => (t.length > 80 ? `'${t.slice(0, 79).trimEnd()}…'` : `'${t}'`)

/**
 * A hand-in's requirement (owner, 2026-10-23): what the asking NPC's words name ("a wing", "a chip"), else
 * one trade's offers (`perTrade`), never the sum of several trades. Items handed but never named still
 * count, from the trade.
 */
function required(h: ThreadStep, asked: string | undefined): ThreadItem[] {
  const per = new Map((h.perTrade ?? h.items ?? []).map((i) => [i.name, i.n]))
  return (h.items ?? []).map((i) => {
    const said = asked === undefined ? undefined : askedCount(asked, i.name)
    return { name: i.name, n: said ?? per.get(i.name) ?? i.n }
  })
}

/** Where each handed item was looted, its droppers the most frequent first. */
function droppers(t: QuestThread): Map<string, string[]> {
  const by = new Map<string, Map<string, number>>()
  for (const s of t.steps) {
    if (s.kind !== 'loot' || s.mob === undefined) continue
    for (const i of s.items ?? []) {
      const m = by.get(i.name) ?? new Map<string, number>()
      m.set(s.mob, (m.get(s.mob) ?? 0) + i.n)
      by.set(i.name, m)
    }
  }
  return new Map([...by].map(([item, m]) => [item, [...m].sort((a, b) => b[1] - a[1]).map(([mob]) => mob)]))
}

/**
 * What a chain shows and its page says (owner, 2026-10-23: "just because i killed 4 skeletons and got 2
 * bone chips, doesn't mean the quest requires that"). A quest's requirements are what was HANDED IN, as
 * the asking NPC named them; kills and loots only say where an item came from, so they are no steps. The
 * talk comes first; each hand-in gets one "Collect" step right before it listing its looted items with
 * their droppers (loot time is evidence of the source, not of the order), then the hand-in, counted per
 * trade, with how many trades repeated it. A purchase says the required count. A keyword said to the wrong
 * NPC and answered only with "go ask X for 'kw'" is the next step's to say.
 */
export function threadDisplaySteps(t: QuestThread): ThreadStep[] {
  const drops = droppers(t)
  const bought = new Set(t.steps.flatMap((s) => (s.kind === 'buy' ? (s.items ?? []).map((i) => i.name) : [])))
  const redirected = new Set(t.steps.flatMap((s) => (s.links ?? []).filter((l) => l.why === 'goask').map((l) => l.from)))
  const resaid = (s: ThreadStep): boolean => s.kind === 'talk' && redirected.has(s.id) && t.steps.some((n) => n.kind === 'talk' && n.npc !== s.npc && n.said?.[0] === s.said?.[0])
  const need = new Map<string, number>()
  const out: ThreadStep[] = []
  for (const s of t.steps) {
    if (s.kind === 'kill' || s.kind === 'loot' || resaid(s)) continue
    if (s.kind !== 'handin') {
      out.push(s)
      continue
    }
    const asked = askingLine(t.steps, s)
    const items = required(s, asked)
    for (const i of items) need.set(i.name, i.n)
    const looted = items.filter((i) => drops.has(i.name) && !bought.has(i.name))
    if (looted.length > 0) {
      const sources = looted.map((i) => `${i.name}: ${(drops.get(i.name) ?? []).join(', ')}`)
      const reasons = [...(asked === undefined ? [] : [`asked: ${quote(asked)}`]), ...sources]
      const links: ThreadLink[] = reasons.map((detail) => ({ from: '', why: 'item', detail }))
      out.push({ id: `collect:${s.id}`, at: s.at, ms: s.ms, kind: 'collect', why: 'item', items: looted, drops: looted.map((i) => ({ item: i.name, mobs: drops.get(i.name) ?? [] })), links, ...(s.zone === undefined ? {} : { zone: s.zone }) })
    }
    out.push({ ...s, items })
  }
  // A purchase of a handed item buys what the hand-in needs.
  return out.map((s) => (s.kind === 'buy' ? { ...s, items: (s.items ?? []).map((i) => ({ name: i.name, n: need.get(i.name) ?? i.n })) } : s))
}

/** A collect step as the Summary's lines, one an item: "Collect 1 [[Bone Chips]] (dropped by [[a skeleton]])." */
function collectNotes(s: ThreadStep): string[] {
  return (s.items ?? []).map((i) => {
    const mobs = s.drops?.find((d) => d.item === i.name)?.mobs ?? []
    return `Collect ${counted(i.n, i.name)}${mobs.length === 0 ? '' : ` (dropped by ${mobs.map((m) => `[[${m}]]`).join(', ')})`}.`
  })
}

/** A hand-in as the page writer's step: the hand-over comes before the NPC's answer to it, as the pages write it. */
function handinStep(s: ThreadStep, base: QuestStep, talk: QuestStep['talk'] & object): QuestStep {
  const offered = (s.items ?? []).flatMap((i) => Array.from({ length: i.n }, () => i.name))
  const first = Math.min(s.ms, ...talk.map((l) => l.ms ?? s.ms))
  const answers = talk.map((l) => ({ ...l, ms: l.ms ?? s.ms }))
  return { ...base, talk: answers, offered, offeredMs: offered.map(() => first - 1), ...(s.experience === true ? { experience: true } : {}), ...(s.factions === undefined ? {} : { factions: s.factions }), ...(s.achievements === undefined ? {} : { achievements: s.achievements }) }
}

/** A chain step as the page writer's steps: talk with its lines, a hand-in's items, collects and buys as notes. */
function questSteps(s: ThreadStep): QuestStep[] {
  const base: QuestStep = { at: s.at, kind: 'talk', ...(s.npc === undefined ? {} : { npc: s.npc }), ...(s.zone === undefined ? {} : { zone: s.zone }) }
  const talk = (s.lines ?? []).map((l) => ({ who: l.who, text: l.text, ...(l.ms === undefined ? {} : { ms: l.ms }) }))
  if (s.kind === 'collect') return collectNotes(s).map((note) => ({ ...base, note }))
  if (s.kind === 'buy' && s.npc !== undefined) return [{ ...base, note: `Buy ${(s.items ?? []).map((i) => counted(i.n, i.name)).join(' and ')} from [[${s.npc}]].` }]
  if (s.kind === 'handin') return [handinStep(s, base, talk)]
  return [{ ...base, talk }]
}

/** A chain as the QuestLog the page writer reads: its shown steps in order, its giver and zone; a repeated hand-in is a rerun. */
export function questLogFromThread(t: QuestThread): QuestLog {
  const npcs = [...new Set(t.steps.map((s) => s.npc).filter((n): n is string => n !== undefined))]
  const shown = threadDisplaySteps(t)
  const reruns = Math.max(0, ...shown.map((s) => (s.trades ?? 1) - 1))
  return { giver: t.giver, zone: t.zone ?? null, npcs, steps: shown.flatMap(questSteps), reruns, forced: true }
}

const itemsText = (s: ThreadStep): string => (s.items ?? []).map((i) => `${i.n > 1 ? `${String(i.n)} ` : ''}${i.name}`).join(' and ')

const many = (n: number | undefined): string => (n !== undefined && n > 1 ? `${String(n)} ` : '')

/** Each kind's few words; `who` is the NPC or the mob. */
const LABELS: Partial<Record<ThreadStepKind, (s: ThreadStep, who: string) => string>> = {
  talk: (s, who) => (s.said?.[0] === undefined ? `Hail ${who}` : `Say '${s.said[0]}' to ${who}`),
  kill: (s, who) => `Kill ${many(s.count)}${who}`,
  loot: (s, who) => `Loot ${itemsText(s)} from ${who}`,
  buy: (s, who) => `Buy ${itemsText(s)} from ${who}`,
  collect: (s) => `Collect ${itemsText(s)}`,
  handin: (s, who) => `Hand ${itemsText(s)} to ${who}${s.experience === true ? ' (experience)' : ''}${(s.trades ?? 1) > 1 ? ` (repeatable: done ${String(s.trades)} times)` : ''}`
}

/** A step in a few words, for the Suggested quests list: "Say 'help' to Old Doug", "Kill 6 a fragile pet". */
export function threadStepLabel(s: ThreadStep): string {
  const who = s.npc ?? s.mob ?? ''
  return LABELS[s.kind]?.(s, who) ?? who
}

/** Why a step follows the ones before it, in the words the log gave: "said [help]", "named Dougina". */
export const threadStepWhy = (s: ThreadStep): string => [...new Set((s.links ?? []).map((l) => l.detail))].join(' · ')
