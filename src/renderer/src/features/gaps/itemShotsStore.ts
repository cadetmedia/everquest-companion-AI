// itemShotsStore — what pasted screenshots of item windows gave, as the player kept them, by item name
// (owner ask, 2026-10-21). Per viewer, in localStorage beside the Done marks (doneMarksStore.ts), so
// a reading survives a tab switch and a restart until the page is made. Copy wiki page reads it
// (shared/wikiPage.ts `ItemPageShot`). Spell display windows keep theirs the same way, under their
// own key (shared/spellWindow.ts `SpellPageShot`).

import { useSyncExternalStore } from 'react'
import type { ItemPageShot } from '@shared/wikiPage'
import type { SpellPageShot } from '@shared/spellWindow'
import type { ItemShotReply } from '@shared/itemWindow'
import type { ShotKind } from '@shared/itemShotKeep'
import { questTitleKey, type QuestJournalFacts } from '@shared/gapQuests'

export const SHOTS_KEY = 'eq.gaps.itemShots'
export const SPELL_SHOTS_KEY = 'eq.gaps.spellShots'
/** The mob pictures saved from the tab, by file name, so a row knows it is Ready (shared/gapReady.ts). */
export const PICTURES_KEY = 'eq.gaps.mobPictures'
/** The newest this many are kept: a page a day for most of a year. */
const KEEP = 300

type Stored<T> = T & { at: string }
export type StoredShot = Stored<ItemPageShot>
export type StoredSpellShot = Stored<SpellPageShot>

/** One kind of kept reading, by row name, in localStorage under `key`. */
function shotStore<T extends object>(key: string): {
  now: (name: string) => Stored<T> | undefined
  set: (name: string, shot: T | null) => void
  use: () => Readonly<Record<string, Stored<T>>>
  /** Every kept reading, outside a render: parsed again only when the stored text changed. */
  all: () => Readonly<Record<string, Stored<T>>>
} {
  const load = (): Record<string, Stored<T>> => {
    try {
      const raw = localStorage.getItem(key)
      const parsed: unknown = raw === null ? {} : JSON.parse(raw)
      return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, Stored<T>>) : {}
    } catch {
      return {}
    }
  }
  const listeners = new Set<() => void>()
  let cached: { raw: string | null; shots: Readonly<Record<string, Stored<T>>> } = { raw: null, shots: {} }
  const snapshot = (): Readonly<Record<string, Stored<T>>> => {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(key)
    } catch {
      return cached.shots
    }
    if (raw !== cached.raw) cached = { raw, shots: load() }
    return cached.shots
  }
  const subscribe = (onChange: () => void): (() => void) => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === null || e.key === key) onChange()
    }
    listeners.add(onChange)
    window.addEventListener('storage', onStorage)
    return () => {
      listeners.delete(onChange)
      window.removeEventListener('storage', onStorage)
    }
  }
  const save = (shots: Record<string, Stored<T>>): void => {
    const newest = Object.entries(shots)
      .sort((a, b) => b[1].at.localeCompare(a[1].at))
      .slice(0, KEEP)
    try {
      localStorage.setItem(key, JSON.stringify(Object.fromEntries(newest)))
    } catch {
      // A blocked store keeps nothing; the reading stays on screen for this paste.
    }
    for (const l of listeners) l()
  }
  return {
    now: (name) => load()[name],
    set: (name, shot) => {
      const others = Object.fromEntries(Object.entries(load()).filter(([k]) => k !== name))
      save(shot === null ? others : { ...others, [name]: { ...shot, at: new Date().toISOString() } })
    },
    use: () => useSyncExternalStore(subscribe, snapshot, snapshot),
    all: snapshot
  }
}

const items = shotStore<ItemPageShot>(SHOTS_KEY)
const spells = shotStore<SpellPageShot>(SPELL_SHOTS_KEY)

/** The reading kept for one item right now (not a render's copy: a paste merges against this). */
export const itemShotNow = (name: string): StoredShot | undefined => items.now(name)
/** Keep (or replace) the reading for one item; `null` forgets it. */
export const setItemShot = (name: string, shot: ItemPageShot | null): void => items.set(name, shot)
/** Every kept reading by item name, current across windows. */
export const useItemShots = (): Readonly<Record<string, StoredShot>> => items.use()

/** Keep (or replace) the reading for one spell; `null` forgets it. */
export const setSpellShot = (name: string, shot: SpellPageShot | null): void => spells.set(name, shot)
/** Every kept spell window reading by spell name. */
export const useSpellShots = (): Readonly<Record<string, StoredSpellShot>> => spells.use()

/**
 * What pasted Quest Journal windows said of each quest, by its key (gapQuests.ts `questTitleKey`):
 * its zone and level range, and, for the task the window had selected, its objectives and description
 * (shared/questJournal.ts; owner, 2026-10-22). Copy wiki page reads the Minimum Level from it.
 */
export const JOURNALS_KEY = 'eq.gaps.questJournals'
const journals = shotStore<QuestJournalFacts>(JOURNALS_KEY)
/** Keep (or replace) what a journal said of one quest, by its key; `null` forgets it. */
export const setQuestJournal = (key: string, facts: QuestJournalFacts | null): void => journals.set(key, facts)
/** Every kept journal reading by quest key, current across windows. */
export const useQuestJournals = (): Readonly<Record<string, Stored<QuestJournalFacts>>> => journals.use()
/** One quest's kept journal reading, by its task name, outside a render (Copy wiki page, the details). */
export const questJournalNow = (name: string): QuestJournalFacts | undefined => journals.all()[questTitleKey(name)]
/** One quest's kept readings by its key, outside a render: a paste merges into what is there now. */
export const questJournalByKey = (key: string): QuestJournalFacts | undefined => journals.all()[key]

const pictures = shotStore<{ path: string }>(PICTURES_KEY)
/** Note a mob picture saved under `file` (MobPicture); `null` when it was deleted. */
export const setMobPicture = (file: string, path: string | null): void => pictures.set(file, path === null ? null : { path })
/** Every saved mob picture by file name. */
export const useMobPictures = (): Readonly<Record<string, Stored<{ path: string }>>> => pictures.use()

/**
 * The role a pasted picture's nameplate printed under a merchant's name (`Tailoring Supplies`), by the
 * lower-cased name (owner, 2026-10-23): its new page's description (shared/gapMerchantDescription.ts).
 */
export const NAMEPLATES_KEY = 'eq.gaps.mobNameplates'
const nameplates = shotStore<{ subtitle: string }>(NAMEPLATES_KEY)
/** Keep the subtitle a nameplate check read for `name`. */
export const setMobNameplate = (name: string, subtitle: string): void => nameplates.set(name.toLowerCase(), { subtitle })
/** Every kept nameplate subtitle, by lower-cased name. */
export const useMobNameplates = (): Readonly<Record<string, Stored<{ subtitle: string }>>> => nameplates.use()

/**
 * The Gaps Items rows' names as the list last held them (CaptureBar keeps this current): a paste's name
 * read through an OCR slip is checked against the other rows too (shared/itemShotKeep.ts `sameItem`).
 */
let rowNames: readonly string[] = []
export const setItemRowNames = (names: readonly string[]): void => {
  rowNames = names
}
export const itemRowNamesNow = (): readonly string[] => rowNames

/** A capture from the game for one row; `note` while it waits for the player (a near match). */
export interface CapturedRead {
  reply: ItemShotReply
  kind: ShotKind
  note?: string
  /** The captured window's picture, kept under the item folder once the reading is used. */
  png?: Uint8Array
}

/**
 * Keep an item part's or a spell window's picture under the picture root (main/ipc/shotPicture.ts);
 * the path written, or null (no folder chosen, an icon alone, or it failed: the reading never waits on it).
 */
export function keepPartPicture(kind: 'item' | 'lore' | 'spell' | undefined, name: string, png: Uint8Array | undefined): Promise<string | null> {
  if (kind === undefined || png === undefined) return Promise.resolve(null)
  return window.eq
    .shotKeepPicture(kind, name, png)
    .then((r) => (r.status === 'saved' ? r.path : null))
    .catch(() => null)
}

/**
 * The last capture for each row, for this run only: the row shows its checks, or its question, never
 * the capture bar (owner, 2026-10-21: "can't the individual area for the item/mob/whatever just 'get'
 * the data?").
 */
let captured: Readonly<Record<string, CapturedRead>> = {}
const capturedListeners = new Set<() => void>()
export const setCapturedRead = (name: string, read: CapturedRead | null): void => {
  captured = read === null ? Object.fromEntries(Object.entries(captured).filter(([k]) => k !== name)) : { ...captured, [name]: read }
  for (const l of capturedListeners) l()
}
const subscribeCaptured = (onChange: () => void): (() => void) => {
  capturedListeners.add(onChange)
  return () => {
    capturedListeners.delete(onChange)
  }
}
/** The last capture for this row, or undefined. */
export const useCapturedRead = (name: string): CapturedRead | undefined => useSyncExternalStore(subscribeCaptured, () => captured[name])
