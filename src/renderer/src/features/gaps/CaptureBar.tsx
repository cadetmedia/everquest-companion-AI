// CaptureBar — capturing the item window from the game, on the Gaps Items domain (phase 3 of
// screenshot to wiki; owner, 2026-10-21: "i like the macro log thing ... I also like B too, lets do
// both? and avoid C"). No hotkey: the player makes a social macro that says `eqc capture` on the
// character's private eqc channel (`/2 eqc capture` after `/join eqckaltinril`, the number from the
// latest Channels line), or presses the camera on an overlay; main captures the EverQuest window,
// finds and reads the item window (main/ipc/shotCapture.ts), and this bar files the reading on the
// item's row by name, the same keep rules as a paste (shared/itemShotKeep.ts).
//
// QUIET (owner, 2026-10-21: "i don't want a bunch of text, can't the individual area for the
// item/mob/whatever just 'get' the data? ... if an item isn't in our gaps ... just ignore it"). The
// bar is one line of how-to and a small status: a spinner while capturing, a check and the row's
// name when a reading was filed, a red mark only when the capture itself failed. A reading lands on
// its row (ShotPanel shows its checks, or its question for a near match); one for no row is ignored.

import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import { Button, CircularProgress, Stack, Typography } from '@mui/material'
import CheckIcon from '@mui/icons-material/Check'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import { captureRow, keptAfter, otherItemNote, PART_WORDS, shotKind } from '@shared/itemShotKeep'
import { partPicture } from '@shared/mobPicture'
import { captureHowTo, readNames, type Captured } from '@shared/shotTrigger'
import type { CharacterSnap } from '@shared/types'
import { copyText } from '../../lib/clipboard'
import { Tooltip } from '../../lib/Tooltip'
import { useModule } from '../../lib/useModule'
import { itemRowNamesNow, itemShotNow, keepPartPicture, setCapturedRead, setItemRowNames, setItemShot } from './itemShotsStore'
import { addCapturedItem } from './capturedItemsStore'

const HOW_TIP = "The macro, or an overlay's 📷, reads the item window open in game."
/** How long a check (or a no-window mark) stays before the bar is idle again. */
const DONE_MS = 2500
/** How long a failure's red mark stays. */
const FAILED_MS = 10_000
/** A capture that never answers stops spinning after this. */
const BUSY_MS = 90_000

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'filed'; rows: string[] } | { kind: 'none' } | { kind: 'failed'; why: string }

const IDLE: Status = { kind: 'idle' }

/**
 * One capture onto its row: an exact name is kept at once, a near match waits on the row for the
 * player. The row's name when it went to one; `none` when the game's window held no item window;
 * the reason when the capture failed; undefined when it is ignored (no row by that name, nothing usable).
 */
type Filed = string | { none: true } | { failed: string } | { unplaced: Captured } | undefined

function file(c: Captured, rows: readonly string[]): Filed {
  if (c.reply === undefined) return c.window !== undefined ? { none: true } : { failed: c.error ?? 'The capture failed.' }
  const kind = shotKind(c.reply)
  if (kind === null) return undefined
  const match = captureRow(c.reply.read.name, rows, c.reply.known)
  // No row by that name: main is asked whether the wiki has a page for it (`withNewRows`).
  if (match === undefined) return kind !== 'icon' && c.reply.read.name !== undefined ? { unplaced: c } : undefined
  return fileOn(c, c.reply, kind, match)
}

/** One capture onto its row: an exact name kept at once, a near match waiting on the row. */
function fileOn(c: Captured, reply: NonNullable<Captured['reply']>, kind: NonNullable<ReturnType<typeof shotKind>>, match: NonNullable<ReturnType<typeof captureRow>>): string {
  // A near match always asks: no `others` here, captureRow has already weighed them.
  const note = match.exact ? undefined : (otherItemNote(reply.read.name, match.row, PART_WORDS[kind]) ?? `This ${PART_WORDS[kind]} reads "${reply.read.name ?? ''}": is it ${match.row}'s?`)
  if (note === undefined) {
    setItemShot(match.row, keptAfter(itemShotNow(match.row), reply, kind))
    // The window's picture under the item folder (owner, 2026-10-22: "all items pasted get stored").
    void keepPartPicture(partPicture(kind), match.row, c.png)
  }
  setCapturedRead(match.row, { reply, kind, ...(note === undefined ? {} : { note }), ...(c.png === undefined ? {} : { png: c.png }) })
  return match.row
}

/**
 * A capture of an item no row names and the wiki data has no page for is the witness of its own row
 * (owner, 2026-10-22: a store purchase prints no log line, "neither worked"): the row is kept
 * (capturedItemsStore.ts) and the reading lands on it as on any row. One the wiki knows stays ignored.
 */
async function withNewRows(results: readonly Filed[]): Promise<Exclude<Filed, { unplaced: Captured }>[]> {
  const unplaced = results.flatMap((r) => (typeof r === 'object' && 'unplaced' in r ? [r.unplaced] : []))
  const names = readNames(unplaced)
  const unknown = new Set(names.length === 0 ? [] : await window.eq.gapUnknownItems(names).catch(() => [] as string[]))
  return results.map((r) => (typeof r === 'object' && 'unplaced' in r ? fileNew(r.unplaced, unknown) : r))
}

/** A captured item with no row, onto a row of its own when the wiki has no page for it. */
function fileNew(c: Captured, unknown: ReadonlySet<string>): string | undefined {
  const name = c.reply?.read.name
  const kind = c.reply === undefined ? null : shotKind(c.reply)
  if (c.reply === undefined || name === undefined || kind === null || !unknown.has(name)) return undefined
  addCapturedItem(name)
  setItemShot(name, keptAfter(itemShotNow(name), c.reply, kind))
  void keepPartPicture(partPicture(kind), name, c.png)
  setCapturedRead(name, { reply: c.reply, kind, ...(c.png === undefined ? {} : { png: c.png }) })
  return name
}

/**
 * One picture of an item window pasted anywhere in the app (GlobalPaste.tsx), filed the capture's way:
 * its row's name, or undefined when no row takes it.
 */
export async function fileOneCapture(c: Captured): Promise<string | undefined> {
  const [r] = await withNewRows([file(c, itemRowNamesNow())])
  return typeof r === 'string' ? r : undefined
}

/** What a batch of captures leaves the bar showing: the rows filed, else a failure, else no window, else idle. */
function statusOf(results: readonly Exclude<Filed, { unplaced: Captured }>[]): Status {
  const rows = results.filter((r): r is string => typeof r === 'string')
  if (rows.length > 0) return { kind: 'filed', rows }
  const failed = results.find((r): r is { failed: string } => typeof r === 'object' && 'failed' in r)
  if (failed !== undefined) return { kind: 'failed', why: failed.failed }
  return results.some((r) => typeof r === 'object') ? { kind: 'none' } : IDLE
}

function StatusMark({ status }: { status: Status }): JSX.Element | null {
  if (status.kind === 'busy') {
    return (
      <Tooltip title="Capturing the game window and reading the item window.">
        <CircularProgress size={14} data-testid="gaps-capture-busy" />
      </Tooltip>
    )
  }
  if (status.kind === 'filed') {
    return (
      <Stack direction="row" spacing={0.5} alignItems="center" data-testid="gaps-capture-filed">
        <CheckIcon fontSize="small" color="success" />
        <Typography variant="caption" color="success.main">
          {status.rows.join(', ')}
        </Typography>
      </Stack>
    )
  }
  if (status.kind === 'none') {
    return (
      <Tooltip title="No item window was found in the game window.">
        <RemoveCircleOutlineIcon fontSize="small" color="disabled" data-testid="gaps-capture-none" />
      </Tooltip>
    )
  }
  if (status.kind === 'failed') {
    return (
      <Tooltip title={status.why}>
        <ErrorOutlineIcon fontSize="small" color="error" data-testid="gaps-capture-failed" />
      </Tooltip>
    )
  }
  return null
}

/** The bar's status: busy from main's notice, then what the captures came to, then idle again. */
function useCaptureStatus(rows: readonly string[]): Status {
  const [status, setStatus] = useState<Status>(IDLE)
  // The rows through a ref: engine pushes change them often, and the capture listener stays subscribed.
  const rowsRef = useRef(rows)
  useEffect(() => {
    rowsRef.current = rows
    setItemRowNames(rows)
  }, [rows])
  const drain = useCallback(() => {
    window.eq
      .shotCaptures()
      .then(async (cs) => {
        if (cs.length > 0) setStatus(statusOf(await withNewRows(cs.map((c) => file(c, rowsRef.current)))))
      })
      .catch(() => setStatus(IDLE))
  }, [])
  useEffect(() => {
    drain()
    const offDone = window.eq.onShotCaptured(drain)
    const offBusy = window.eq.onShotCapturing(() => setStatus({ kind: 'busy' }))
    return () => {
      offDone()
      offBusy()
    }
  }, [drain])
  useEffect(() => {
    if (status.kind === 'idle') return undefined
    const ms = status.kind === 'busy' ? BUSY_MS : status.kind === 'failed' ? FAILED_MS : DONE_MS
    const t = setTimeout(() => setStatus(IDLE), ms)
    return () => clearTimeout(t)
  }, [status])
  return status
}

export default function CaptureBar({ rows }: { rows: readonly string[] }): JSX.Element {
  const [copied, setCopied] = useState<string | null>(null)
  const [channels, setChannels] = useState<Record<string, number>>({})
  const how = captureHowTo(useModule<CharacterSnap>('character')?.character?.name ?? null, channels)
  const status = useCaptureStatus(rows)
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
  return (
    <Stack direction="row" spacing={1} alignItems="center" data-testid="gaps-capture">
      <Typography variant="body2" color="text.secondary" data-testid="gaps-capture-macro">
        Capture: {how.text}
      </Typography>
      <Button size="small" onClick={copy} data-testid="gaps-capture-copy">
        {copied === text ? 'Copied' : 'Copy'}
      </Button>
      <Typography variant="body2" color="text.secondary">
        Or 📷 on an overlay.
      </Typography>
      <Tooltip title={HOW_TIP}>
        <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} data-testid="gaps-capture-info" />
      </Tooltip>
      <StatusMark status={status} />
    </Stack>
  )
}
