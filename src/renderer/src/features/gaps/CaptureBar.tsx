// CaptureBar — the capture hotkey on the Gaps Items domain (phase 3 of screenshot to wiki; owner,
// 2026-10-21). The player sets a key here; in the game, the key over an open item window (or its
// Lore tab) captures the EverQuest window, main finds and reads the item window (shotCapture.ts),
// and this bar files the reading on the item's row by name, the same keep rules as a paste
// (shared/itemShotKeep.ts). A window it cannot find or a name no row has is said here, never guessed.

import { type JSX, useCallback, useEffect, useState } from 'react'
import { Button, Stack, TextField } from '@mui/material'
import { captureRow, keptAfter, shotKind } from '@shared/itemShotKeep'
import { acceleratorOf, type Captured } from '@shared/shotHotkey'
import { itemShotNow, setItemShot } from './itemShotsStore'
import { Line } from './PasteZone'

/** The newest lines kept on the bar. */
const NOTES = 4

/** One capture filed on its row, or why not, in the player's words. */
function file(c: Captured, rows: readonly string[]): string {
  if (c.reply === undefined) return c.error ?? 'Nothing was read.'
  const kind = shotKind(c.reply)
  const row = captureRow(c.reply.read.name, rows)
  const name = c.reply.read.name ?? 'an item'
  if (kind === null) return `Captured ${name}, but nothing usable was read.`
  if (row === undefined) return `Captured ${name}: no Items row by that name.`
  setItemShot(row, keptAfter(itemShotNow(row), c.reply, kind))
  return `Captured ${row} (${kind === 'lore' ? 'Lore tab' : 'item window'}) in ${(c.ms / 1000).toFixed(1)} s: filed on its row.`
}

export default function CaptureBar({ rows }: { rows: readonly string[] }): JSX.Element {
  const [hotkey, setHotkey] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const [notes, setNotes] = useState<string[]>([])
  const say = useCallback((lines: string[]) => setNotes((n) => [...lines, ...n].slice(0, NOTES)), [])
  const drain = useCallback(() => {
    window.eq
      .shotCaptures()
      .then((cs) => cs.length > 0 && say(cs.map((c) => file(c, rows)).reverse()))
      .catch(() => undefined)
  }, [rows, say])
  useEffect(() => {
    void window.eq.shotHotkey('get').then((r) => setHotkey(r.hotkey)).catch(() => undefined)
  }, [])
  useEffect(() => {
    drain()
    return window.eq.onShotCaptured(drain)
  }, [drain])
  const set = (accel: string | null): void => {
    void window.eq
      .shotHotkey('set', accel)
      .then((r) => {
        setHotkey(r.hotkey)
        if (r.message !== undefined) say([r.message])
      })
      .catch(() => say(['The hotkey could not be set.']))
  }
  return (
    <Stack spacing={0.5} data-testid="gaps-capture">
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          size="small"
          label="Capture hotkey (in game, over an item window)"
          value={listening ? 'Press a key with Ctrl, Alt or Win…' : (hotkey ?? 'Off')}
          onFocus={() => setListening(true)}
          onBlur={() => setListening(false)}
          onKeyDown={(e) => {
            e.preventDefault()
            const accel = acceleratorOf(e)
            if (accel === undefined) return
            setListening(false)
            set(accel)
          }}
          slotProps={{ htmlInput: { readOnly: true, 'data-testid': 'gaps-capture-hotkey' } }}
          sx={{ minWidth: 300 }}
        />
        {hotkey !== null && (
          <Button size="small" onClick={() => set(null)}>
            Turn off
          </Button>
        )}
      </Stack>
      {notes.map((n, i) => (
        <Line key={`${String(i)}-${n}`}>{n}</Line>
      ))}
    </Stack>
  )
}
