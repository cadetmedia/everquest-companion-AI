// pasteRoute — a picture pasted anywhere in the app (owner, 2026-10-23: "I should be able to paste quest
// images in ANYWHERE and it should try to scrape data out of them to help fill in the blanks and connect
// the dots to make a whole chain for me"): what the picture is, from the lines main read, and where it
// belongs. Pure; GlobalPaste.tsx reads and stores.
//
//   WHAT IT IS: a Quest Journal (its own reader says so), an item window or its Lore tab (the stats lines
//   or the Description | Lore tab row), a popup window (a title and prose, a closing `Click 'OK'` line),
//   else maybe a mob's nameplate (the plain OCR names a Mobs row), else unknown.
//
//   WHERE A POPUP GOES: every quest and suggested quest chain is a target, its steps carrying the NPCs,
//   mobs, items, keywords and zones the log tied to it. The popup's words are matched against all those
//   names at once, the longest first, so `Old Doug` counts as Old Doug and not also as Doug. A name on
//   one target only decides it; on several, an ordinal in the window (`Your FIRST Quest Reward!`, `a
//   SECOND pair of Boots`) picks among them by start time. A popup naming nobody follows the window
//   whose closing line named it (Skills and Abilities after Combat); else it is never forced onto a
//   quest (the first Alternate Advancement point's window is about no quest): it waits unsorted, the
//   last place a popup went offered first when the player moves it.

import type { GapRow } from './gaps'
import { questLogOf, questRewards, questTitleKey, receivedOf } from './gapQuests'
import { isJournalPicture, namesWindow, type QuestPopup } from './questPopup'

export type PictureKind = 'popup' | 'journal' | 'item' | 'other'

/** An item window's stats lines, or its tab row (`Description | Lore`). */
const ITEM_LINE = /^\W{0,3}(?:Class|Race|Size|Slot|Weight|Value|WT)\b\s*:?/i
const ITEM_TABS = /\bDescr\w*.{0,8}\bLore\b/i
/** The game's closing line under a popup (`Click 'OK' to continue.`, `Press `OK` to continue.`). */
const CLOSING = /\b(?:click|press)\b.{0,6}\bok\b.{0,6}\bto\b/i

/**
 * What a pasted picture is, from the popup reader's lines and whether they made a popup. A journal and
 * an item window are told by their own marks; a popup needs its closing line or real prose (two lines of
 * eight words), since a nameplate's noise can also make a title and a paragraph.
 */
export function pictureKind(lines: readonly string[], popup: QuestPopup | null): PictureKind {
  if (isJournalPicture(lines)) return 'journal'
  if (lines.filter((l) => ITEM_LINE.test(l)).length >= 2 || lines.some((l) => ITEM_TABS.test(l))) return 'item'
  if (popup === null) return 'other'
  const prose = lines.filter((l) => (l.match(/[A-Za-z]{2,}/g) ?? []).length >= 8).length
  return lines.some((l) => CLOSING.test(l)) || prose >= 2 ? 'popup' : 'other'
}

/** What a step of a quest or a chain names: who, what, where, and the kind of thing done there. */
export interface RouteStep {
  npcs: string[]
  mobs: string[]
  items: string[]
  said: string[]
  zones: string[]
  kind?: string
}

/** One place a popup can go: a quest row or a suggested chain. */
export interface RouteTarget {
  /** Where its popups are kept (itemShotsStore `questJournals`): the quest's key, or `thread:<id>`. */
  key: string
  label: string
  kind: 'quest' | 'thread'
  /** When it started (epoch ms), for an ordinal among ties. */
  startMs: number
  steps: RouteStep[]
  rewards: string[]
}

/** A suggested quest chain as the engine serves it (gapQuestThreads.ts `QuestThread`), the parts read here. */
export interface ThreadLike {
  id: string
  name: string
  zone?: string
  startMs: number
  steps: { kind: string; npc?: string; zone?: string; said?: string[]; items?: { name: string }[]; mob?: string }[]
  rewards?: { name: string }[]
}

const some = (s: string | undefined | null): string[] => (s === undefined || s === null || s === '' ? [] : [s])

/** The chains' targets: their popups kept under `thread:<id>` until the player accepts one. */
export function threadTargets(threads: readonly ThreadLike[]): RouteTarget[] {
  return threads.map((t) => ({
    key: `thread:${t.id}`,
    label: t.name,
    kind: 'thread',
    startMs: t.startMs,
    steps: t.steps.map((s) => ({ npcs: some(s.npc), mobs: some(s.mob), items: (s.items ?? []).map((i) => i.name), said: s.said ?? [], zones: some(s.zone ?? t.zone), kind: s.kind })),
    rewards: (t.rewards ?? []).map((r) => r.name)
  }))
}

/** A stamp `2026-10-23 17:36:17` as epoch ms (local), 0 when it is not one. */
const stampMs = (at: string | undefined): number => {
  const ms = at === undefined ? NaN : Date.parse(at.replace(' ', 'T'))
  return Number.isNaN(ms) ? 0 : ms
}

/** The Quests rows' targets (task quests and the ones the player named), under their quest keys. */
export function questTargets(rows: readonly GapRow[]): RouteTarget[] {
  return rows.flatMap((r) => {
    const log = r.domain === 'quest' ? questLogOf(r) : undefined
    if (log === undefined) return []
    const steps = log.steps.map(
      (s): RouteStep => ({
        npcs: some(s.npc),
        mobs: [],
        items: [...(s.offered ?? []), ...(s.given ?? [])],
        said: (s.talk ?? []).filter((t) => t.who === 'You').map((t) => t.text),
        zones: some(s.zone),
        kind: (s.offered ?? []).length > 0 ? 'handin' : 'talk'
      })
    )
    const end = questRewards(log)
    const rewards = end?.items ?? log.steps.flatMap((s) => receivedOf(s))
    return [{ key: questTitleKey(r.name), label: r.name, kind: 'quest' as const, startMs: stampMs(log.steps[0]?.at), steps, rewards }]
  })
}

/** Lower case, one apostrophe, letters, digits and single spaces: how names and text are compared. */
const fold = (s: string): string =>
  ` ${s
    .toLowerCase()
    .replace(/[`’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `

/** Words too common to name anything on their own. */
const COMMON = new Set(['help', 'yes', 'no', 'next', 'more', 'work', 'thing', 'what', 'else', 'ready', 'send', 'hail', 'the', 'quest', 'quests'])

type NameKind = 'npc' | 'mob' | 'item' | 'said' | 'zone' | 'reward'
const WEIGHT: Record<NameKind, number> = { reward: 4, npc: 3, mob: 3, item: 3, zone: 1, said: 0.5 }

/** Every name the targets carry, with its kind, the longest first. */
function namesOf(targets: readonly RouteTarget[]): { name: string; kind: NameKind }[] {
  const out = new Map<string, NameKind>()
  const put = (n: string, kind: NameKind): void => {
    const f = fold(n).trim()
    const ok = kind === 'said' ? f.length >= 5 && !COMMON.has(f) : f.length >= 3
    if (ok && (WEIGHT[out.get(f) ?? 'said'] < WEIGHT[kind] || !out.has(f))) out.set(f, kind)
  }
  for (const t of targets) {
    for (const s of t.steps) {
      s.npcs.forEach((n) => put(n, 'npc'))
      s.mobs.forEach((n) => put(n, 'mob'))
      s.items.forEach((n) => put(n, 'item'))
      s.said.forEach((n) => put(n, 'said'))
      s.zones.forEach((n) => put(n, 'zone'))
    }
    t.rewards.forEach((n) => put(n, 'reward'))
  }
  return [...out].map(([name, kind]) => ({ name, kind })).sort((a, b) => b.name.length - a.name.length)
}

/** The names the text holds, each match blanked so a shorter name inside it (`Doug` in `Old Doug`) does not count again. */
export function namesIn(text: string, names: readonly { name: string; kind: NameKind }[]): Set<string> {
  let t = fold(text)
  const found = new Set<string>()
  for (const { name } of names) {
    // Every place it is written: an instruction is in the window twice (its paragraph and its step).
    for (let at = t.indexOf(` ${name} `); at >= 0; at = t.indexOf(` ${name} `)) {
      found.add(name)
      t = `${t.slice(0, at + 1)}${' '.repeat(name.length)}${t.slice(at + 1 + name.length)}`
    }
  }
  return found
}

/** A popup's words: its title, paragraphs, list lines, steps and rewards. */
export const popupText = (p: QuestPopup): string =>
  [p.title, ...p.paragraphs.flatMap((x) => [x.heading ?? '', x.text, ...(x.list ?? [])]), ...p.steps, ...(p.rewards ?? [])].join(' \n ')

/** The kind of step an instruction's verb asks for. */
function verbKind(steps: readonly string[]): string | undefined {
  const v = (steps[0] ?? '').toLowerCase().split(/\s+/)[0]
  if (['buy', 'purchase'].includes(v)) return 'buy'
  if (['kill', 'slay', 'defeat'].includes(v)) return 'kill'
  if (['loot', 'collect', 'gather'].includes(v)) return 'loot'
  if (['give', 'hand', 'return', 'deliver', 'bring', 'merge'].includes(v)) return 'handin'
  if (['find', 'talk', 'speak', 'continue', 'go', 'seek', 'visit'].includes(v)) return 'talk'
  return undefined
}

/** One target's score for the names found, and its best step (1-based; 0 when none stands out). */
function scoreOf(t: RouteTarget, found: ReadonlySet<string>, kinds: ReadonlyMap<string, NameKind>, want: string | undefined): { score: number; step: number } {
  const has = (n: string): boolean => found.has(fold(n).trim())
  const named = new Set<string>()
  for (const s of t.steps) for (const n of [...s.npcs, ...s.mobs, ...s.items, ...s.said, ...s.zones]) if (has(n)) named.add(fold(n).trim())
  for (const n of t.rewards) if (has(n)) named.add(fold(n).trim())
  const score = [...named].reduce((a, n) => a + WEIGHT[kinds.get(n) ?? 'said'], 0)
  let best = { step: 0, s: 0 }
  t.steps.forEach((s, i) => {
    const hits = [...s.npcs, ...s.mobs, ...s.items].filter(has).length + (want !== undefined && s.kind === want ? 1.5 : 0)
    if (hits > best.s) best = { step: i + 1, s: hits }
  })
  return { score, step: best.step }
}

export interface RouteHit {
  key: string
  label: string
  kind: 'quest' | 'thread'
  score: number
  /** The step it matched best, 1-based; 0 when none. */
  step: number
}

/** Every target with a score for this popup, best first (ties by start time). */
export function rankPopup(p: QuestPopup, targets: readonly RouteTarget[]): RouteHit[] {
  const names = namesOf(targets)
  const kinds = new Map(names.map((n) => [n.name, n.kind]))
  const found = namesIn(popupText(p), names)
  const want = (p.rewards ?? []).length > 0 ? 'reward' : verbKind(p.steps)
  return targets
    .map((t) => ({ t, ...scoreOf(t, found, kinds, want) }))
    .sort((a, b) => b.score - a.score || a.t.startMs - b.t.startMs)
    .map(({ t, score, step }) => ({ key: t.key, label: t.label, kind: t.kind, score, step }))
}

/** `first` → 0, `second` → 1, `third` → 2: an ordinal the window states, else undefined. */
export function ordinalOf(text: string): number | undefined {
  const m = /\b(first|second|third|fourth)\b/i.exec(text)
  return m === null ? undefined : ['first', 'second', 'third', 'fourth'].indexOf(m[1].toLowerCase())
}

/** A name worth routing on: one solid name (an NPC, a mob, an item) at least. */
const MIN_SCORE = 3

export type RouteWhy = 'named' | 'ordinal' | 'chain' | 'none'

export interface PopupRoute {
  hit?: RouteHit
  why: RouteWhy
  /** The places to offer when the player moves it: the last place a popup went first, then by score. */
  ranked: RouteHit[]
}

/** What the router knows beyond the targets: the popups already kept on each, and where the last one went. */
export interface RouteContext {
  attached?: Readonly<Record<string, readonly QuestPopup[]>>
  recent?: { key: string; ms: number }
  nowMs?: number
}

/** The last popup's place is offered first while the player is still pasting (20 minutes). */
const RECENT_MS = 20 * 60_000

/** The ranking for the Move picker: the recent place first while it is fresh. */
function movePicks(ranked: readonly RouteHit[], ctx: RouteContext): RouteHit[] {
  const recent = ctx.recent
  if (recent === undefined || (ctx.nowMs ?? Date.now()) - recent.ms > RECENT_MS) return [...ranked]
  const first = ranked.find((h) => h.key === recent.key)
  return first === undefined ? [...ranked] : [first, ...ranked.filter((h) => h !== first)]
}

/** Where a popup goes, and why: a name, an ordinal among ties, or the window that named it; else nowhere yet. */
export function routePopup(p: QuestPopup, targets: readonly RouteTarget[], ctx: RouteContext = {}): PopupRoute {
  const ranked = rankPopup(p, targets)
  const top = ranked[0]
  if (top !== undefined && top.score >= MIN_SCORE) {
    const tied = ranked.filter((h) => h.score === top.score)
    const nth = tied.length > 1 ? ordinalOf(popupText(p)) : undefined
    if (nth !== undefined && nth < tied.length) return { hit: tied[nth], why: 'ordinal', ranked }
    return { hit: top, why: 'named', ranked }
  }
  const byKey = new Map(ranked.map((h) => [h.key, h]))
  const chained = Object.entries(ctx.attached ?? {}).find(([, list]) => list.some((x) => x.next !== undefined && namesWindow(x.next, p.title)))
  const chainHit = chained === undefined ? undefined : byKey.get(chained[0])
  if (chainHit !== undefined) return { hit: chainHit, why: 'chain', ranked }
  return { why: 'none', ranked: movePicks(ranked, ctx) }
}

/** Letters only, lower case: a nameplate read through OCR's slips. */
const letters = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, '')

/** The edit distance between `a` and the closest same-length piece of `b` (a name inside a noisy line). */
function nearestIn(a: string, b: string): number {
  let best = Infinity
  for (let i = 0; i + a.length <= b.length + 1; i++) {
    const piece = b.slice(i, i + a.length + 1)
    best = Math.min(best, editDistance(a, piece), editDistance(a, piece.slice(0, a.length)))
    if (best === 0) break
  }
  return best
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = cur
    }
  }
  return row[b.length]
}

/**
 * The row a nameplate picture shows: the name a plain read holds (one slip per eight letters; a name of
 * five letters or fewer must be read exactly, as a word), the longest such name; undefined for none.
 */
export function nameplateRow(lines: readonly string[], names: readonly string[]): string | undefined {
  const read = lines.map(letters)
  const words = new Set(lines.flatMap((l) => l.toLowerCase().split(/[^a-z]+/)))
  const hit = names
    .filter((n) => {
      const want = letters(n)
      if (want.length <= 5) return words.has(want)
      const slips = Math.max(1, Math.floor(want.length / 8))
      return read.some((r) => r.length >= want.length - slips && nearestIn(want, r) <= slips)
    })
    .sort((a, b) => b.length - a.length)
  return hit[0]
}

/** The other places to offer when the player moves a popup: six, the one it went to left out. */
export const movePicksBut = (ranked: readonly RouteHit[], key: string): RouteHit[] => ranked.filter((h) => h.key !== key).slice(0, 6)

/** The rows a nameplate picture can belong to: mobs, merchants and the Images rows. */
export const pictureRows = <R extends { domain: string }>(rows: readonly R[]): R[] => rows.filter((r) => ['mob', 'merchant', 'image'].includes(r.domain))
