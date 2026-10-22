// CaptureBar — capturing the item window from the game, on the Gaps Items domain (phase 3 of
// screenshot to wiki; owner, 2026-10-21: "i like the macro log thing ... I also like B too, lets do
// both? and avoid C"). No hotkey: the player makes a social macro that says `eqc capture` on the
// character's private eqc channel (`/2 eqc capture` after `/join eqckaltinril`, the number from the
// latest Channels line), or presses the camera on an overlay; main captures the EverQuest window,
// finds and reads the item window (main/ipc/shotCapture.ts), and this bar files the reading on the
// item's row by name, the same keep rules as a paste (shared/itemShotKeep.ts). A window it cannot
// find or a name no row has is said here, never guessed.

import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import { Button, Stack, Typography } from '@mui/material'
import { captureRow, keptAfter, shotKind, type ShotKind } from '@shared/itemShotKeep'
import type { ItemShotReply } from '@shared/itemWindow'
import { captureHowTo, type Captured } from '@shared/shotTrigger'
import type { CharacterSnap } from '@shared/types'
import { copyText } from '../../lib/clipboard'
import { useModule } from '../../lib/useModule'
import { itemShotNow, setItemRowNames, setItemShot } from './itemShotsStore'
import { Line, WrongItem } from './PasteZone'

/** The newest lines kept on the bar. */
const NOTES = 4

/** One capture's line on the bar, with what the reader doubts or did not place (as a paste shows them). */
interface Note {
  text: string
  warn: string[]
}

/** A capture whose name is the row's only through an OCR slip: nothing is filed until the player says. */
interface Waiting {
  row: string
  reply: ItemShotReply
  kind: ShotKind
  note: string
}

const partOf = (kind: ShotKind): string => (kind === 'lore' ? 'Lore tab' : 'item window')

/** The reader's checks and the lines it did not place. */
const doubts = (r: ItemShotReply): string[] => [...(r.read.checks ?? []), ...(r.read.unread.length > 0 ? [`Not placed: ${r.read.unread.join(' · ')}`] : [])]

const fileOn = (w: Pick<Waiting, 'row' | 'reply' | 'kind'>): void => setItemShot(w.row, keptAfter(itemShotNow(w.row), w.reply, w.kind))

/** One capture filed on its row, or why not, in the player's words: the name read and the row. */
function file(c: Captured, rows: readonly string[]): { note: Note; wait?: Waiting } {
  const from = c.via === 'overlay' ? 'Overlay capture' : 'Macro capture'
  if (c.reply === undefined) return { note: { text: `${from}: ${c.error ?? 'nothing was read.'}`, warn: [] } }
  const kind = shotKind(c.reply)
  const read = c.reply.read.name === undefined ? 'no name read' : `read "${c.reply.read.name}"`
  if (kind === null) return { note: { text: `${from}: ${read}, but nothing usable was read.`, warn: [] } }
  const match = captureRow(c.reply.read.name, rows, c.reply.known)
  const warn = doubts(c.reply)
  if (match === undefined) return { note: { text: `${from}: ${read}, no Items row by that name.`, warn } }
  if (!match.exact) {
    const ask = `${from}: ${read} (${partOf(kind)}), not filed: is it ${match.row}'s?`
    return { note: { text: ask, warn }, wait: { row: match.row, reply: c.reply, kind, note: ask } }
  }
  fileOn({ row: match.row, reply: c.reply, kind })
  return { note: { text: `${from}: ${read}, filed on ${match.row} (${partOf(kind)}) in ${(c.ms / 1000).toFixed(1)} s.`, warn } }
}

export default function CaptureBar({ rows }: { rows: readonly string[] }): JSX.Element {
  const [notes, setNotes] = useState<Note[]>([])
  const [waiting, setWaiting] = useState<Waiting[]>([])
  const [copied, setCopied] = useState<string | null>(null)
  const [channels, setChannels] = useState<Record<string, number>>({})
  const how = captureHowTo(useModule<CharacterSnap>('character')?.character?.name ?? null, channels)
  // The rows through a ref: engine pushes change them often, and the capture listener stays subscribed.
  const rowsRef = useRef(rows)
  useEffect(() => {
    rowsRef.current = rows
    setItemRowNames(rows)
  }, [rows])
  const drain = useCallback(() => {
    window.eq
      .shotCaptures()
      .then((cs) => {
        if (cs.length === 0) return
        const filed = cs.map((c) => file(c, rowsRef.current)).reverse()
        setNotes((n) => [...filed.map((f) => f.note), ...n].slice(0, NOTES))
        const asks = filed.flatMap((f) => (f.wait === undefined ? [] : [f.wait]))
        if (asks.length > 0) setWaiting((w) => [...asks, ...w].slice(0, NOTES))
      })
      .catch(() => undefined)
  }, [])
  useEffect(() => {
    drain()
    return window.eq.onShotCaptured(drain)
  }, [drain])
  // The channel's number comes from the game's Channels line: asked again when the player is back from the game.
  useEffect(() => {
    const ask = (): void => void window.eq.shotChannels().then(setChannels).catch(() => undefined)
    ask()
    window.addEventListener('focus', ask)
    return () => window.removeEventListener('focus', ask)
  }, [])
  // "Copied" stands for the text copied: a new macro (another channel number) offers the copy again.
  const text = how.macro ?? how.join
  const copy = (): void => {
    void copyText(text).then((ok) => setCopied(ok ? text : null))
  }
  const settle = (w: Waiting, use: boolean): void => {
    if (use) fileOn(w)
    setWaiting((all) => all.filter((x) => x !== w))
  }
  return (
    <Stack spacing={0.5} data-testid="gaps-capture">
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="body2" color="text.secondary" data-testid="gaps-capture-macro">
          Capture from the game: {how.text}
        </Typography>
        <Button size="small" onClick={copy} data-testid="gaps-capture-copy">
          {copied === text ? 'Copied' : how.macro === undefined ? 'Copy /join' : 'Copy macro'}
        </Button>
        <Typography variant="body2" color="text.secondary">
          Or the 📷 on the Event log or Wiki Gaps overlay, with an item window open.
        </Typography>
      </Stack>
      {waiting.map((w) => (
        <WrongItem key={`${w.row}-${String(w.reply.ms)}-${w.note}`} note={w.note} onUse={() => settle(w, true)} onDiscard={() => settle(w, false)} />
      ))}
      {notes.map((n, i) => (
        <Stack key={`${String(i)}-${n.text}`}>
          <Line>{n.text}</Line>
          {n.warn.map((c) => (
            <Line key={c} warn>
              {c}
            </Line>
          ))}
        </Stack>
      ))}
    </Stack>
  )
}
