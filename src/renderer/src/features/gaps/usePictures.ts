// usePictures — where pictures come from (a paste, a drop, the picture inbox) and the one queue that
// reads them in order (GlobalPaste.tsx draws the note). Owner, 2026-10-23: a paste counts only when the
// player made it, into the focused window, and into a text box only when the clipboard holds a picture
// and no text; several pictures are read under one summary.

import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react'
import { GAPS_MODULE_ID } from '@shared/gaps'
import type { QuestJournalFacts } from '@shared/gapQuests'
import { placesKey } from '@shared/pasteRoute'
import { useModule } from '../../lib/useModule'
import { asPng, batchSummary, pictureLog, readAndRoute, rerouteUnsorted, type Outcome, type PictureSource, type Snap } from './pictureIntake'

export interface Job {
  source: PictureSource
  label: string
  bytes: () => Promise<Uint8Array | null>
  /** The inbox: move the file aside once read. */
  done?: (ok: boolean, why: string) => void
}

/** A row's own paste box is open: that row takes the paste (PasteZone.tsx). */
const zoneOpen = (): boolean => document.querySelector('[data-testid="gaps-shot-zone"]') !== null

/** A text box: a paste there is typing unless the clipboard holds only a picture. */
const typingIn = (t: EventTarget | null): boolean => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA'].includes(t.tagName))

const describe = (t: EventTarget | null): string => (t instanceof HTMLElement ? `${t.tagName.toLowerCase()}${t.dataset.testid === undefined ? '' : `[${t.dataset.testid}]`}` : 'window')

/** Every picture file a paste or drop carries. */
function filesOf(data: DataTransfer | null): File[] {
  const fromItems = [...(data?.items ?? [])].filter((i) => i.kind === 'file' && i.type.startsWith('image/')).map((i) => i.getAsFile())
  const files = fromItems.filter((f): f is File => f !== null)
  return files.length > 0 ? files : [...(data?.files ?? [])].filter((f) => f.type.startsWith('image/'))
}

/** Why a paste is not the player's picture for the app, or '' when it is. */
function refusal(e: ClipboardEvent): string {
  const items = [...(e.clipboardData?.items ?? [])]
  if (!e.isTrusted) return 'not made by the player'
  if (!document.hasFocus()) return 'window not focused'
  if (zoneOpen()) return "a row's paste box is open"
  if (typingIn(e.target) && items.some((i) => i.kind === 'string')) return 'a text box has focus and the clipboard holds text'
  return ''
}

const fileJob = (source: PictureSource) => (f: File): Job => ({ source, label: source === 'drop' ? f.name : '', bytes: async () => new Uint8Array(await f.arrayBuffer()) })

/** One picture through the readers; whatever they throw becomes its "not read" note. */
async function readOne(raw: Uint8Array, job: Job, journals: Readonly<Record<string, QuestJournalFacts>>): Promise<Outcome> {
  try {
    return await readAndRoute(await asPng(raw, job.label), journals, job.source, job.label)
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    pictureLog(`${job.source} ${job.label} could not be read: ${why}`)
    return { kind: 'error', text: `Could not read ${job.label === '' ? 'the picture' : job.label}: ${why}` }
  }
}

/** The queue: one picture at a time, in the order given; a batch ends in one summary note. */
export function usePictureQueue(journals: MutableRefObject<Readonly<Record<string, QuestJournalFacts>>>, show: (o: Outcome) => void): (jobs: Job[]) => void {
  const queue = useRef<Job[]>([])
  const running = useRef(false)
  const run = useCallback(async () => {
    if (running.current) return
    running.current = true
    const outcomes: Outcome[] = []
    try {
      for (let job = queue.current.shift(); job !== undefined; job = queue.current.shift()) {
        show({ kind: 'unknown', text: `Reading ${job.label === '' ? 'the picture' : job.label}…`, progress: true })
        const raw = await job.bytes().catch(() => null)
        // A file no reader can open is "not read", never the end of the batch (it threw out of the loop, so
        // the rest went unread and the file stayed in the inbox to fail again at every launch).
        const out: Outcome = raw === null ? { kind: 'error', text: 'Could not read that file.' } : await readOne(raw, job, journals.current)
        job.done?.(out.kind !== 'error' && out.kind !== 'unknown', out.text)
        outcomes.push(out)
      }
    } finally {
      running.current = false
    }
    if (outcomes.length === 1) show(outcomes[0])
    else if (outcomes.length > 1) show({ kind: outcomes.some((o) => o.kind === 'unsorted') ? 'unsorted' : 'quest', text: batchSummary(outcomes) })
  }, [journals, show])
  return useCallback(
    (jobs: Job[]) => {
      if (jobs.length === 0) return
      queue.current.push(...jobs)
      void run()
    },
    [run]
  )
}

/** The picture inbox: what is there at launch, and whatever lands later (src/main/pictureInbox.ts). */
export function usePictureInbox(enqueue: (jobs: Job[]) => void): void {
  useEffect(() => {
    const seen = new Set<string>()
    const pull = (): void => {
      void window.eq.pictureInboxList().then(({ files }) => {
        const fresh = files.filter((f) => !seen.has(f))
        fresh.forEach((f) => seen.add(f))
        // Once moved aside the name is free again: a picture sent back from failed/ is read anew.
        const done = (name: string) => (ok: boolean, why: string): void => void window.eq.pictureInboxDone(name, ok, why).finally(() => seen.delete(name))
        enqueue(fresh.map((name) => ({ source: 'inbox', label: name, bytes: () => window.eq.pictureInboxRead(name), done: done(name) })))
      })
    }
    pull()
    return window.eq.onPictureInbox(pull)
  }, [enqueue])
}

/** The inbox pictures that could not be read (failed/), kept current as the inbox changes. */
export function useFailedPictures(): string[] {
  const [failed, setFailed] = useState<string[]>([])
  useEffect(() => {
    let live = true
    const pull = (): void => {
      void window.eq.pictureInboxList().then((r) => live && setFailed(r.failed))
    }
    pull()
    const stop = window.eq.onPictureInbox(pull)
    return () => {
      live = false
      stop()
    }
  }, [])
  return failed
}

/** A paste or a drop anywhere in the main window. */
export function usePasteAndDrop(enqueue: (jobs: Job[]) => void): void {
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      if (![...(e.clipboardData?.items ?? [])].some((i) => i.kind === 'file' && i.type.startsWith('image/'))) return
      const why = refusal(e)
      if (why !== '') {
        pictureLog(`paste at ${describe(e.target)} ignored: ${why}`)
        return
      }
      e.preventDefault()
      enqueue(filesOf(e.clipboardData).map(fileJob('paste')))
    }
    const onDrop = (e: DragEvent): void => {
      if (zoneOpen() || e.defaultPrevented || !e.isTrusted) return
      e.preventDefault()
      enqueue(filesOf(e.dataTransfer).map(fileJob('drop')))
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
  }, [enqueue])
}

/**
 * Popups waiting in Unsorted are routed again when quest rows or chains change: the engine's chains can
 * land after the inbox was read at launch.
 */
export function useReroute(journals: MutableRefObject<Readonly<Record<string, QuestJournalFacts>>>): void {
  const snap = useModule<Snap>(GAPS_MODULE_ID)
  const key = snap === null ? '' : placesKey(snap.rows, snap.questThreads)
  useEffect(() => {
    if (key === '') return
    const t = setTimeout(() => void rerouteUnsorted(journals.current), 1500)
    return () => clearTimeout(t)
  }, [key, journals])
}
