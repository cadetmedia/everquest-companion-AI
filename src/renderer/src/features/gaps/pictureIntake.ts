// pictureIntake — one picture read and sent where it belongs, whatever brought it: a paste, a drop or the
// picture inbox (GlobalPaste.tsx). The read is local: a popup to the quest or suggested chain it names
// (`thread:<id>` until the chain is accepted), else Unsorted; a Quest Journal to each task it lists; an
// item window to its Items row; a nameplate only OFFERS a save (owner, 2026-10-23: a save dialog opened
// "out of nowhere" — nothing is saved without the player's click). Every picture is logged to the dev log.

import { GAPS_MODULE_ID, type GapRow, type GapsSnap } from '@shared/gaps'
import type { QuestJournalFacts } from '@shared/gapQuests'
import { withForcedQuests, type TalkSnap } from '@shared/gapForcedQuests'
import { pictureFile } from '@shared/mobPicture'
import { movePicksBut, nameplateRow, pictureKind, pictureRows, questTargets, routePopup, spellRowNames, threadTargets, type RouteHit, type ThreadLike } from '@shared/pasteRoute'
import { isSpellWindow, readSpellWindow, spellProblem } from '@shared/spellWindow'
import { journalPlaces } from '@shared/questJournal'
import { popupRead, readPopup, withPopup, withoutPopup, type QuestPopup } from '@shared/questPopup'
import { fileOneCapture } from './CaptureBar'
import { keepPartPicture, questJournalByKey, setMobPicture, setQuestJournal, setSpellShot } from './itemShotsStore'
import { keepOf } from './SpellShot'
import { keepJournal, thumbOf } from './QuestShot'
import { forcedQuestsNow } from './useForcedQuests'

/** Where a popup no quest claims waits for the player (its key in the journals store). */
export const UNSORTED = 'unsorted'

export type PictureSource = 'paste' | 'drop' | 'inbox'

export type Snap = GapsSnap & TalkSnap & { questThreads?: ThreadLike[] }

/** What became of one picture: where it went, for the note and the batch summary. */
export interface Outcome {
  kind: 'quest' | 'chain' | 'unsorted' | 'journal' | 'item' | 'spell' | 'nameplate' | 'unknown' | 'error'
  text: string
  undo?: () => void
  move?: { popup: QuestPopup; from: string; picks: RouteHit[] }
  /** A nameplate: the save the player may ask for, never done on its own. */
  save?: { label: string; run: () => Promise<string> }
  /** "Reading …" while a batch runs: not shown again once the player has closed the note. */
  progress?: true
}

export const pictureLog = (line: string): void => window.eq.pictureLog(line)

/** Any picture as PNG bytes: the readers take PNG (and JPEG); a WebP or JPEG is redrawn here. */
export async function asPng(bytes: Uint8Array, name = ''): Promise<Uint8Array> {
  const png = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  if (png) return bytes
  const type = /\.webp$/i.test(name) ? 'image/webp' : 'image/jpeg'
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type }))
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
  return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
}

/** The last place a popup went, offered first when the next is moved. */
let recent: { key: string; ms: number } | undefined

/** Keep `popup` on `key` (a quest, a chain or Unsorted); the undo puts back what was there. */
export function keepPopup(key: string, popup: QuestPopup): () => void {
  const was = questJournalByKey(key)
  setQuestJournal(key, { ...was, popups: withPopup(was?.popups, popup) })
  return () => setQuestJournal(key, was ?? null)
}

/** Move a popup from where it went to `to`. */
export function movePopup(popup: QuestPopup, from: string, to: RouteHit): void {
  const was = questJournalByKey(from)
  const left = withoutPopup(was?.popups, popup.title)
  setQuestJournal(from, was === undefined ? null : { ...was, popups: left })
  keepPopup(to.key, popup)
  recent = { key: to.key, ms: Date.now() }
}

/** The Gaps snapshot now, with the player's named quests joined: the places a popup can go. */
export async function targetsNow(): Promise<{ snap: Snap | null; hits: ReturnType<typeof questTargets> }> {
  const snap = (await window.eq.getModuleSnapshot<Snap>(GAPS_MODULE_ID).catch(() => null))?.state ?? null
  if (snap === null) return { snap, hits: [] }
  const joined = withForcedQuests(snap, forcedQuestsNow(snap.character))
  return { snap, hits: [...questTargets(joined.rows), ...threadTargets(snap.questThreads ?? [])] }
}

export const where = (h: RouteHit): string => (h.step > 0 ? `${h.label}, step ${String(h.step)}` : h.label)

const attachedOf = (journals: Readonly<Record<string, QuestJournalFacts>>): Record<string, QuestPopup[]> =>
  Object.fromEntries(Object.entries(journals).map(([k, f]) => [k, f.popups ?? []]))

async function routeOnePopup(popup: QuestPopup, journals: Readonly<Record<string, QuestJournalFacts>>): Promise<Outcome> {
  const { hits } = await targetsNow()
  const r = routePopup(popup, hits, { attached: attachedOf(journals), ...(recent === undefined ? {} : { recent }) })
  const key = r.hit?.key ?? UNSORTED
  const undo = keepPopup(key, popup)
  if (r.hit !== undefined) recent = { key, ms: Date.now() }
  const move = { popup, from: key, picks: movePicksBut(r.ranked, key) }
  if (r.hit === undefined) return { kind: 'unsorted', text: `Popup '${popup.title}' names no quest: kept unsorted.`, undo, move }
  return { kind: key.startsWith('thread:') ? 'chain' : 'quest', text: `Popup '${popup.title}' → ${where(r.hit)}.`, undo, move }
}

/** A picture neither popup, journal nor item window: a mob's nameplate when the plain read names a row. */
async function nameplate(png: Uint8Array): Promise<Outcome> {
  const { snap } = await targetsNow()
  const rows: GapRow[] = pictureRows(snap?.rows ?? [])
  const look = await window.eq.shotReadText(png)
  const name = nameplateRow(look.lines, rows.map((r) => r.name))
  const row = rows.find((r) => r.name === name)
  if (row === undefined) return { kind: 'unknown', text: 'Could not tell what this picture is.' }
  const file = pictureFile(row)
  const run = async (): Promise<string> => {
    const saved = await window.eq.shotSaveImage(png, file, false)
    if (saved.status === 'saved' || saved.status === 'exists') setMobPicture(file, saved.path)
    pictureLog(`nameplate save for ${row.name}: ${saved.status}`)
    return saved.status === 'saved' ? `Saved ${file}.` : saved.status === 'exists' ? `${file} is already saved.` : `${file} not saved.`
  }
  return { kind: 'nameplate', text: `Looks like ${row.name}.`, save: { label: `Save as ${file}`, run } }
}

/** A Quest Journal: kept on each task it lists (QuestShot.tsx `keepJournal`). */
async function journal(png: Uint8Array): Promise<Outcome> {
  const j = await window.eq.shotReadText(png, 'journal')
  const thumb = await thumbOf(png)
  const kept = keepJournal(j, journalPlaces([]), { key: UNSORTED, thumb })
  return kept ? { kind: 'journal', text: 'Quest Journal read: kept on its quests.' } : { kind: 'error', text: 'Could not read that Quest Journal.' }
}

/** An item window or its Lore tab: filed on its Items row the capture's way (CaptureBar.tsx). */
async function itemWindow(png: Uint8Array): Promise<Outcome> {
  const reply = await window.eq.shotReadItem(png)
  const row = await fileOneCapture({ at: new Date().toISOString(), reply, png, ms: reply.ms })
  return row === undefined ? { kind: 'item', text: `Item window read: no Gaps row for ${reply.read.name ?? 'it'}.` } : { kind: 'item', text: `Item window → ${row}.` }
}

/**
 * A spell display window: kept on its Spells row the row's own way (SpellShot.tsx), or under the spell's
 * name for a row that comes later (owner, 2026-10-23: the Mummy spell windows went to failed/).
 */
async function spellWindow(png: Uint8Array): Promise<Outcome> {
  const { snap } = await targetsNow()
  const rows = spellRowNames(snap?.rows ?? [])
  const reply = await window.eq.shotReadText(png)
  const r = reply.error === undefined ? readSpellWindow(reply.lines, undefined, undefined, (n) => rows.includes(n)) : null
  if (r === null || !isSpellWindow(r) || r.name === undefined) return { kind: 'error', text: spellProblem(reply) }
  const name = r.name
  const row = rows.find((n) => n.toLowerCase() === name.toLowerCase())
  setSpellShot(row ?? name, keepOf(r))
  void keepPartPicture('spell', row ?? name, png)
  return { kind: 'spell', text: row === undefined ? `Spell window: ${name} (kept for when its row comes).` : `Spell window → ${row}.` }
}

/** One picture, read and sent: what became of it. Logged with its source either way. */
export async function readAndRoute(png: Uint8Array, journals: Readonly<Record<string, QuestJournalFacts>>, source: PictureSource, label = ''): Promise<Outcome> {
  const t0 = performance.now()
  const out = await classifyAndRoute(png, journals).catch((e: unknown): Outcome => ({ kind: 'error', text: `Could not read it (${e instanceof Error ? e.message : String(e)}).` }))
  pictureLog(`${source}${label === '' ? '' : ` ${label}`}: ${out.kind}: ${out.text} (${String(Math.round(performance.now() - t0))} ms)`)
  return out
}

async function classifyAndRoute(png: Uint8Array, journals: Readonly<Record<string, QuestJournalFacts>>): Promise<Outcome> {
  const look = await window.eq.shotReadText(png, 'popup')
  if (look.error !== undefined) return { kind: 'error', text: look.error }
  const popup = readPopup(popupRead(look))
  const kind = pictureKind(look.lines, popup)
  if (kind === 'journal') return journal(png)
  if (kind === 'item') return itemWindow(png)
  if (kind === 'spell') return spellWindow(png)
  if (kind === 'popup' && popup !== null) {
    const thumb = await thumbOf(png)
    return routeOnePopup({ ...popup, ...(thumb === undefined ? {} : { thumb }) }, journals)
  }
  return nameplate(png)
}

/**
 * Popups waiting in Unsorted are offered again whenever the places change (the engine's chains can
 * land after the inbox was read at launch): one that now names a quest or chain moves there.
 */
export async function rerouteUnsorted(journals: Readonly<Record<string, QuestJournalFacts>>): Promise<number> {
  const waiting = journals[UNSORTED]?.popups ?? []
  if (waiting.length === 0) return 0
  const { hits } = await targetsNow()
  if (hits.length === 0) return 0
  let moved = 0
  for (const popup of waiting) {
    const r = routePopup(popup, hits, { attached: attachedOf(journals) })
    if (r.hit === undefined) continue
    movePopup(popup, UNSORTED, r.hit)
    pictureLog(`rerouted '${popup.title}': Unsorted -> ${where(r.hit)}`)
    moved++
  }
  return moved
}

/** `9 pictures read: 4 to quests, 5 Unsorted`: one note for a batch. */
/** "1 item window", "2 item windows" (owner, 2026-10-23: the summary said "1 item windows"). */
const counted = (c: number, one: string, many: string): string => `${String(c)} ${c === 1 ? one : many}`

export function batchSummary(outcomes: readonly Outcome[]): string {
  const n = (k: Outcome['kind'][]): number => outcomes.filter((o) => k.includes(o.kind)).length
  const parts = [
    [n(['quest', 'chain']), 'to a quest', 'to quests'],
    [n(['unsorted']), 'Unsorted', 'Unsorted'],
    [n(['journal']), 'journal', 'journals'],
    [n(['item']), 'item window', 'item windows'],
    [n(['spell']), 'spell window', 'spell windows'],
    [n(['nameplate']), 'nameplate to save', 'nameplates to save'],
    [n(['unknown', 'error']), 'not read', 'not read']
  ] as const
  const said = parts.filter(([c]) => c > 0).map(([c, one, many]) => counted(c, one, many))
  return `${counted(outcomes.length, 'picture', 'pictures')} read: ${said.join(', ')}.`
}
