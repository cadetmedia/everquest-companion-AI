// Misfit — a picture pasted in one row's box that is another kind of window (owner, 2026-10-25:
// "lets make this thing smart so whatever we paste it can scrape the data into the appropriate area";
// shared/rowPaste.ts tells it from the lines the box read). Nothing is kept on this row: one line says
// what the picture is and which row takes it, by name, and a button sends it there through the readers
// a paste anywhere uses (pictureIntake.ts), or saves a mob's picture as its row's file. The box's own
// choices (a mob row's "Save it anyway") sit beside it.

import { type JSX, type ReactNode, useCallback, useState } from 'react'
import { Button, CircularProgress, Stack, Typography } from '@mui/material'
import { itemRowNames } from '@shared/itemShotKeep'
import { pictureFile } from '@shared/mobPicture'
import { pictureRows, spellRowNames } from '@shared/pasteRoute'
import { boxReads, misfitOf, pastedKind, type Misfit, type PasteHere, type PasteRows } from '@shared/rowPaste'
import { itemRowNamesNow, useQuestJournals } from './itemShotsStore'
import { readAndRoute, saveRowPicture, targetsNow } from './pictureIntake'
import { Line } from './PasteZone'

/** The rows a misplaced picture can go to, now: the Gaps snapshot's, with the Items rows the capture bar holds. */
async function pasteRowsNow(): Promise<PasteRows> {
  const rows = (await targetsNow()).snap?.rows ?? []
  return {
    items: [...new Set([...itemRowNames(rows), ...itemRowNamesNow()])],
    spells: spellRowNames(rows),
    pictures: pictureRows(rows).map((r) => ({ name: r.name, file: pictureFile(r) }))
  }
}

/** A picture pasted on `here`, from the lines its box read: another kind's note, else undefined. */
export async function misfitNow(lines: readonly string[], here: PasteHere): Promise<Misfit | undefined> {
  // The rows are asked only for a picture that may be another kind (most pastes are the box's own).
  const kind = pastedKind(lines)
  if (kind === 'other' ? here.box === 'mob' : boxReads(here.box, kind)) return undefined
  const m = misfitOf(lines, here, await pasteRowsNow().catch((): PasteRows => ({ items: [], spells: [], pictures: [] })))
  if (m !== undefined) window.eq.pictureLog(`paste on ${here.row} (${here.box} row) is ${m.kind}${m.name === undefined ? '' : ` ${m.name}`}: offered ${m.row ?? 'its reader'}`)
  return m
}

/** A misfit with the picture it was read from, held by the box until the next paste. */
export interface HeldMisfit {
  misfit: Misfit
  png: Uint8Array
}

/**
 * A mob row's paste: the picture's text read first, and one of another kind held for the player (its
 * note) instead of handed to `own`, the row's save. `busy` follows the read.
 */
export function useTextFirst(row: string, own: (png: Uint8Array) => void, busy: (on: boolean) => void): { misfit: HeldMisfit | null; take: (png: Uint8Array) => void; drop: () => void } {
  const [misfit, setMisfit] = useState<HeldMisfit | null>(null)
  const take = useCallback(
    (png: Uint8Array) => {
      busy(true)
      setMisfit(null)
      window.eq
        .shotReadText(png)
        .then((reply) => (reply.error === undefined ? misfitNow(reply.lines, { box: 'mob', row }) : undefined))
        .catch(() => undefined)
        .then((m) => {
          if (m === undefined) {
            own(png)
            return
          }
          setMisfit({ misfit: m, png })
          busy(false)
        })
        .catch(() => busy(false))
    },
    [row, own, busy]
  )
  return { misfit, take, drop: useCallback(() => setMisfit(null), []) }
}

/** The note: what the picture is, the button that sends it where it belongs, then what came of it. */
export function MisfitNote({ held, children }: { held: HeldMisfit; children?: ReactNode }): JSX.Element {
  const journals = useQuestJournals()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const { misfit, png } = held
  const send = (): void => {
    setBusy(true)
    const run = misfit.kind === 'mob' && misfit.row !== undefined && misfit.file !== undefined ? saveRowPicture(png, misfit.row, misfit.file) : readAndRoute(png, journals, 'paste', `moved from a row box`).then((o) => o.text)
    run
      .then(setDone)
      .catch((e: unknown) => setDone(`Could not send it (${e instanceof Error ? e.message : String(e)}).`))
      .finally(() => setBusy(false))
  }
  return (
    <Stack spacing={0.5} data-testid="gaps-shot-misfit">
      <Typography variant="body2" color="warning.main">
        {misfit.text}
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        {done === null && (
          <Button size="small" variant="outlined" disabled={busy} onClick={send} data-testid="gaps-shot-misfit-send">
            {misfit.action}
          </Button>
        )}
        {done === null && children}
        {busy && <CircularProgress size={14} />}
        {done !== null && <Line>{done}</Line>}
      </Stack>
    </Stack>
  )
}
