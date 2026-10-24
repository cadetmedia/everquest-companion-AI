// shared/gapQuestThreads.ts — quest chains the engine rebuilds from the log for quests with no task line
// (owner, 2026-10-23: "would be nice if the thing could tie the steps together automatically? like i
// hail someone, then i say the keyword, then i go kill something or do something, and get an item, turn
// it in, etc"). The engine (`gaps_threads.rs`) serves `questThreads`; this file is the shape, the key a
// thread is known by, and the walk from a thread to the QuestLog the page writer reads.

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
