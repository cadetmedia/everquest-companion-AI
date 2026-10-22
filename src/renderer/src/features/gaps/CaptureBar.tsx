// CaptureBar — capturing the item window from the game, on the Gaps Items domain (phase 3 of
// screenshot to wiki; owner, 2026-10-21: "i like the macro log thing ... I also like B too, lets do
// both? and avoid C"). No hotkey: the player makes a social macro that writes `/echo eqc capture`
// to the log, or presses the camera on the Event log overlay; main captures the EverQuest window,
// finds and reads the item window (main/ipc/shotCapture.ts), and this bar files the reading on the
// item's row by name, the same keep rules as a paste (shared/itemShotKeep.ts). A window it cannot
// find or a name no row has is said here, never guessed.

import { type JSX, useCallback, useEffect, useState } from 'react'
import { Button, Stack, Typography } from '@mui/material'
import { captureRow, keptAfter, shotKind } from '@shared/itemShotKeep'
import { CAPTURE_MACRO, type Captured } from '@shared/shotTrigger'
import { copyText } from '../../lib/clipboard'
import { itemShotNow, setItemShot } from './itemShotsStore'
import { Line } from './PasteZone'

/** The newest lines kept on the bar. */
const NOTES = 4

/** One capture filed on its row, or why not, in the player's words. */
function file(c: Captured, rows: readonly string[]): string {
  const from = c.via === 'overlay' ? 'Overlay capture' : 'Macro capture'
  if (c.reply === undefined) return `${from}: ${c.error ?? 'nothing was read.'}`
  const kind = shotKind(c.reply)
  const row = captureRow(c.reply.read.name, rows)
  const name = c.reply.read.name ?? 'an item'
  if (kind === null) return `${from}: ${name}, but nothing usable was read.`
  if (row === undefined) return `${from}: ${name}, no Items row by that name.`
  setItemShot(row, keptAfter(itemShotNow(row), c.reply, kind))
  return `${from}: ${row} (${kind === 'lore' ? 'Lore tab' : 'item window'}) in ${(c.ms / 1000).toFixed(1)} s, filed on its row.`
}

export default function CaptureBar({ rows }: { rows: readonly string[] }): JSX.Element {
  const [notes, setNotes] = useState<string[]>([])
  const [copied, setCopied] = useState(false)
  const say = useCallback((lines: string[]) => setNotes((n) => [...lines, ...n].slice(0, NOTES)), [])
  const drain = useCallback(() => {
    window.eq
      .shotCaptures()
      .then((cs) => cs.length > 0 && say(cs.map((c) => file(c, rows)).reverse()))
      .catch(() => undefined)
  }, [rows, say])
  useEffect(() => {
    drain()
    return window.eq.onShotCaptured(drain)
  }, [drain])
  const copy = (): void => {
    void copyText(CAPTURE_MACRO).then(setCopied)
  }
  return (
    <Stack spacing={0.5} data-testid="gaps-capture">
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="body2" color="text.secondary">
          Capture from the game: a social macro with the line
        </Typography>
        <Typography variant="body2" component="code" data-testid="gaps-capture-macro" sx={{ fontFamily: 'monospace' }}>
          {CAPTURE_MACRO}
        </Typography>
        <Button size="small" onClick={copy} data-testid="gaps-capture-copy">
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Typography variant="body2" color="text.secondary">
          or the 📷 on the Event log overlay, with an item window open.
        </Typography>
      </Stack>
      {notes.map((n, i) => (
        <Line key={`${String(i)}-${n}`}>{n}</Line>
      ))}
    </Stack>
  )
}
