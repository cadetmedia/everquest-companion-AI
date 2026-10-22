// CaptureBar — capturing the item window from the game, on the Gaps Items domain (phase 3 of
// screenshot to wiki; owner, 2026-10-21: "i like the macro log thing ... I also like B too, lets do
// both? and avoid C"). No hotkey: the player makes a social macro that says `eqc capture` on the
// character's private eqc channel (`/2 eqc capture` after `/join eqckaltinril`, the number from the
// latest Channels line), or presses the camera on an overlay; main captures the EverQuest window,
// finds and reads the item window (main/ipc/shotCapture.ts), and this bar files the reading on the
// item's row by name, the same keep rules as a paste (shared/itemShotKeep.ts). A window it cannot
// find or a name no row has is said here, never guessed.

import { type JSX, useCallback, useEffect, useState } from 'react'
import { Button, Stack, Typography } from '@mui/material'
import { captureRow, keptAfter, shotKind } from '@shared/itemShotKeep'
import { captureHowTo, type Captured } from '@shared/shotTrigger'
import type { CharacterSnap } from '@shared/types'
import { copyText } from '../../lib/clipboard'
import { useModule } from '../../lib/useModule'
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
  const [channels, setChannels] = useState<Record<string, number>>({})
  const how = captureHowTo(useModule<CharacterSnap>('character')?.character?.name ?? null, channels)
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
  // The channel's number comes from the game's Channels line: asked again when the player is back from the game.
  useEffect(() => {
    const ask = (): void => void window.eq.shotChannels().then(setChannels).catch(() => undefined)
    ask()
    window.addEventListener('focus', ask)
    return () => window.removeEventListener('focus', ask)
  }, [])
  const copy = (): void => {
    void copyText(how.macro ?? how.join).then(setCopied)
  }
  return (
    <Stack spacing={0.5} data-testid="gaps-capture">
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="body2" color="text.secondary" data-testid="gaps-capture-macro">
          Capture from the game: {how.text}
        </Typography>
        <Button size="small" onClick={copy} data-testid="gaps-capture-copy">
          {copied ? 'Copied' : how.macro === undefined ? 'Copy /join' : 'Copy macro'}
        </Button>
        <Typography variant="body2" color="text.secondary">
          Or the 📷 on the Event log or Wiki Gaps overlay, with an item window open.
        </Typography>
      </Stack>
      {notes.map((n, i) => (
        <Line key={`${String(i)}-${n}`}>{n}</Line>
      ))}
    </Stack>
  )
}
