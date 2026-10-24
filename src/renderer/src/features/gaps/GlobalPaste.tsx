// GlobalPaste — a picture pasted anywhere in the main window (owner, 2026-10-23: "I should be able to
// paste quest images in ANYWHERE and it should try to scrape data out of them"). Mounted once, beside
// the Gaps overlay feed; a row's own paste box, when one is open, keeps its paste.
//
// The picture is read on this machine and sent where it belongs (shared/pasteRoute.ts): a popup to the
// quest or suggested quest chain it names (`thread:<id>` until the chain is accepted), else Unsorted; a
// Quest Journal to each task it lists; an item window to its Items row (the capture's filing); a
// nameplate to that mob's picture. A short note says where, with Undo and Move.

import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import { Button, Menu, MenuItem, Snackbar } from '@mui/material'
import { GAPS_MODULE_ID, type GapRow, type GapsSnap } from '@shared/gaps'
import type { QuestJournalFacts } from '@shared/gapQuests'
import { withForcedQuests, type TalkSnap } from '@shared/gapForcedQuests'
import { pictureFile } from '@shared/mobPicture'
import { movePicksBut, nameplateRow, pictureKind, pictureRows, questTargets, routePopup, threadTargets, type RouteHit, type ThreadLike } from '@shared/pasteRoute'
import { journalPlaces } from '@shared/questJournal'
import { readPopup, withPopup, withoutPopup, type QuestPopup } from '@shared/questPopup'
import { fileOneCapture } from './CaptureBar'
import { questJournalByKey, setMobPicture, setQuestJournal, useQuestJournals } from './itemShotsStore'
import { keepJournal, thumbOf } from './QuestShot'
import { forcedQuestsNow } from './useForcedQuests'

/** Where a popup no quest claims waits for the player (its key in the journals store). */
export const UNSORTED = 'unsorted'

type Snap = GapsSnap & TalkSnap & { questThreads?: ThreadLike[] }

/** A note on screen: what was read, where it went, and how to take it back or move it. */
interface Note {
  text: string
  undo?: () => void
  move?: { popup: QuestPopup; from: string; picks: RouteHit[] }
}

/** The picture on a paste or a drop, as bytes; null when there is none. */
async function pictureOf(data: DataTransfer | null): Promise<Uint8Array | null> {
  const file = [...(data?.items ?? [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile()
  return file === undefined || file === null ? null : new Uint8Array(await file.arrayBuffer())
}

/** A row's own paste box is open: that row takes the paste (PasteZone.tsx). */
const zoneOpen = (): boolean => document.querySelector('[data-testid="gaps-shot-zone"]') !== null

/** The last place a popup went, offered first when the next is moved. */
let recent: { key: string; ms: number } | undefined

/** Keep `popup` on `key` (a quest, a chain or Unsorted); the undo puts back what was there. */
function keepPopup(key: string, popup: QuestPopup): () => void {
  const was = questJournalByKey(key)
  setQuestJournal(key, { ...was, popups: withPopup(was?.popups, popup) })
  return () => setQuestJournal(key, was ?? null)
}

/** The Gaps snapshot now, with the player's named quests joined: the places a popup can go. */
async function targetsNow(): Promise<{ snap: Snap | null; hits: ReturnType<typeof questTargets> }> {
  const snap = (await window.eq.getModuleSnapshot<Snap>(GAPS_MODULE_ID).catch(() => null))?.state ?? null
  if (snap === null) return { snap, hits: [] }
  const joined = withForcedQuests(snap, forcedQuestsNow(snap.character))
  return { snap, hits: [...questTargets(joined.rows), ...threadTargets(snap.questThreads ?? [])] }
}

const where = (h: RouteHit): string => (h.step > 0 ? `${h.label}, step ${String(h.step)}` : h.label)

async function routeOnePopup(popup: QuestPopup, journals: Readonly<Record<string, QuestJournalFacts>>): Promise<Note> {
  const { hits } = await targetsNow()
  const attached = Object.fromEntries(Object.entries(journals).map(([k, f]) => [k, f.popups ?? []]))
  const r = routePopup(popup, hits, { attached, ...(recent === undefined ? {} : { recent }) })
  const key = r.hit?.key ?? UNSORTED
  const undo = keepPopup(key, popup)
  if (r.hit !== undefined) recent = { key, ms: Date.now() }
  const picks = movePicksBut(r.ranked, key)
  const text = r.hit === undefined ? `Popup '${popup.title}' names no quest: kept unsorted.` : `Popup '${popup.title}' → ${where(r.hit)}.`
  return { text, undo, move: { popup, from: key, picks } }
}

/** A picture neither popup, journal nor item window: a mob's nameplate when the plain read names a row. */
async function nameplate(png: Uint8Array): Promise<Note> {
  const { snap } = await targetsNow()
  const rows: GapRow[] = pictureRows(snap?.rows ?? [])
  const look = await window.eq.shotReadText(png)
  const name = nameplateRow(look.lines, rows.map((r) => r.name))
  const row = rows.find((r) => r.name === name)
  if (row === undefined) return { text: 'Could not tell what this picture is.' }
  const file = pictureFile(row)
  const saved = await window.eq.shotSaveImage(png, file, false)
  if (saved.status === 'saved' || saved.status === 'exists') setMobPicture(file, saved.path)
  return { text: saved.status === 'saved' ? `Picture of ${row.name} saved as ${file}.` : saved.status === 'exists' ? `${row.name} already has ${file}.` : `Picture of ${row.name} not saved.` }
}

/** A Quest Journal: kept on each task it lists (QuestShot.tsx `keepJournal`). */
async function journal(png: Uint8Array): Promise<Note> {
  const j = await window.eq.shotReadText(png, 'journal')
  const thumb = await thumbOf(png)
  return { text: keepJournal(j, journalPlaces([]), { key: UNSORTED, thumb }) ? 'Quest Journal read: kept on its quests.' : 'Could not read that Quest Journal.' }
}

/** An item window or its Lore tab: filed on its Items row the capture's way (CaptureBar.tsx). */
async function itemWindow(png: Uint8Array): Promise<Note> {
  const reply = await window.eq.shotReadItem(png)
  const row = await fileOneCapture({ at: new Date().toISOString(), reply, png, ms: reply.ms })
  return { text: row === undefined ? `Item window read: no Gaps row for ${reply.read.name ?? 'it'}.` : `Item window → ${row}.` }
}

/** One paste, read and sent: what the note says. */
async function readAndRoute(png: Uint8Array, journals: Readonly<Record<string, QuestJournalFacts>>): Promise<Note> {
  const look = await window.eq.shotReadText(png, 'popup')
  if (look.error !== undefined) return { text: look.error }
  const popup = readPopup({ lines: look.lines, tops: look.tops ?? [], heights: look.heights ?? [], tones: look.tones ?? [], ...(look.leads === undefined ? {} : { leads: look.leads }) })
  const kind = pictureKind(look.lines, popup)
  if (kind === 'journal') return journal(png)
  if (kind === 'item') return itemWindow(png)
  if (kind === 'popup' && popup !== null) {
    const thumb = await thumbOf(png)
    return routeOnePopup({ ...popup, ...(thumb === undefined ? {} : { thumb }) }, journals)
  }
  return nameplate(png)
}

/** Move a popup from where it went to `to`. */
function movePopup(popup: QuestPopup, from: string, to: RouteHit): void {
  const was = questJournalByKey(from)
  const left = withoutPopup(was?.popups, popup.title)
  setQuestJournal(from, was === undefined ? null : { ...was, popups: left })
  keepPopup(to.key, popup)
  recent = { key: to.key, ms: Date.now() }
}

export default function GlobalPaste(): JSX.Element {
  const [note, setNote] = useState<Note | null>(null)
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const journals = useQuestJournals()
  const journalsRef = useRef(journals)
  useEffect(() => {
    journalsRef.current = journals
  }, [journals])
  const busy = useRef(false)
  const take = useCallback((png: Uint8Array | null) => {
    if (png === null || busy.current) return
    busy.current = true
    setNote({ text: 'Reading the picture…' })
    readAndRoute(png, journalsRef.current)
      .then(setNote)
      .catch((e: unknown) => setNote({ text: `Could not read it (${e instanceof Error ? e.message : String(e)}).` }))
      .finally(() => {
        busy.current = false
      })
  }, [])
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      if (zoneOpen()) return
      const hasImage = [...(e.clipboardData?.items ?? [])].some((i) => i.kind === 'file' && i.type.startsWith('image/'))
      if (!hasImage) return
      e.preventDefault()
      void pictureOf(e.clipboardData).then(take)
    }
    const onDrop = (e: DragEvent): void => {
      if (zoneOpen() || e.defaultPrevented) return
      e.preventDefault()
      void pictureOf(e.dataTransfer).then(take)
    }
    const onDragOver = (e: DragEvent): void => {
      if (!zoneOpen()) e.preventDefault()
    }
    window.addEventListener('paste', onPaste)
    window.addEventListener('drop', onDrop)
    window.addEventListener('dragover', onDragOver)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('dragover', onDragOver)
    }
  }, [take])
  const move = note?.move
  const action = (
    <>
      {note?.undo !== undefined && (
        <Button
          size="small"
          onClick={() => {
            note.undo?.()
            setNote(null)
          }}
          data-testid="paste-undo"
        >
          Undo
        </Button>
      )}
      {move !== undefined && move.picks.length > 0 && (
        <Button size="small" onClick={(e) => setMenu(e.currentTarget)} data-testid="paste-move">
          Move
        </Button>
      )}
    </>
  )
  return (
    <>
      <Snackbar open={note !== null} message={note?.text} action={action} autoHideDuration={move?.from === UNSORTED ? null : 8000} onClose={(_e, why) => why !== 'clickaway' && setNote(null)} data-testid="paste-note" />
      <Menu open={menu !== null} anchorEl={menu} onClose={() => setMenu(null)}>
        {(move?.picks ?? []).map((h) => (
          <MenuItem
            key={h.key}
            onClick={() => {
              if (move !== undefined) movePopup(move.popup, move.from, h)
              setMenu(null)
              setNote({ text: `Popup '${move?.popup.title ?? ''}' → ${where(h)}.` })
            }}
          >
            {where(h)}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
