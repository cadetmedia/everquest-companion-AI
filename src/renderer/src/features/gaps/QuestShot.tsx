// QuestShot — the screenshot box on a Quests row (owner, 2026-10-22: "quest pages worked out from the
// log and the Quest Journal"; 2026-10-23: "add multiple images for analysis and processing"). Any
// number of pictures: each is read on this machine and kept by what it is.
//
//   A QUEST JOURNAL (main/shot/journalLines.ts, shared/questJournal.ts): every task the window lists is
//   kept (itemShotsStore.ts `setQuestJournal`), so one paste serves each of its quests' rows; Copy wiki
//   page takes the Minimum Level from it.
//   A POPUP WINDOW (main/shot/popupLines.ts, shared/questPopup.ts): the tutorial's Navigation window and
//   the like, kept in paste order on this quest (a second paste of the same window replaces it); the
//   page quotes it and lists its instructions.
//
// Each picture is read as a popup first (its title bar says which window it is); a Quest Journal's is
// read again the journal's own way. A small copy of each paste is kept as its thumbnail.

import { type JSX, useCallback, useMemo, useState } from 'react'
import { Box, Chip, Stack, Typography } from '@mui/material'
import type { GapRow } from '@shared/gaps'
import { questLogOf, questTitleKey, type QuestJournalFacts } from '@shared/gapQuests'
import { isQuestJournal, journalFactsByQuest, journalMissText, journalPlaces, readQuestJournal } from '@shared/questJournal'
import { isJournalPicture, popupKeptLines, popupMissText, readPopup, withoutPopup, withPopup } from '@shared/questPopup'
import { questJournalByKey, setQuestJournal, useQuestJournals } from './itemShotsStore'
import { Line, PasteZone } from './PasteZone'

/** What the kept journal reading says of this quest, in short lines. */
function keptLines(f: QuestJournalFacts): string[] {
  const levels = f.minLevel === undefined ? [] : [`Min ${String(f.minLevel)}${f.maxLevel === undefined ? '' : `, Max ${String(f.maxLevel)}`}`]
  return [
    [...(f.zone === undefined ? [] : [f.zone]), ...levels].join(' · '),
    ...(f.objectives ?? []).map((o) => `${o.text}${o.status === undefined ? '' : ` (${o.status})`}`),
    ...(f.hiddenSteps === undefined ? [] : [`${String(f.hiddenSteps)} more step${f.hiddenSteps === 1 ? '' : 's'} not shown yet`]),
    ...(f.description === undefined ? [] : [f.description])
  ].filter((l) => l !== '')
}

/** Whether a kept reading holds a Quest Journal's facts (not only popups). */
const hasJournal = (f: QuestJournalFacts | undefined): boolean =>
  f !== undefined && (f.zone !== undefined || f.minLevel !== undefined || f.objectives !== undefined || f.description !== undefined || f.hiddenSteps !== undefined)

/** A small JPEG of the paste for its thumbnail; undefined when the picture cannot be drawn. */
export async function thumbOf(png: Uint8Array): Promise<string | undefined> {
  try {
    const bmp = await createImageBitmap(new Blob([new Uint8Array(png)], { type: 'image/png' }))
    const w = Math.min(160, bmp.width)
    const h = Math.max(1, Math.round((bmp.height * w) / bmp.width))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')?.drawImage(bmp, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.6)
  } catch {
    return undefined
  }
}

/** A journal paste: each quest it lists keeps its popups; this row's keeps the thumbnail. */
export function keepJournal(read: { lines: string[]; shades?: number[] }, places: string[], at: { key: string; thumb: string | undefined }): boolean {
  const { key, thumb } = at
  const r = readQuestJournal(read.lines, read.shades, places)
  if (!isQuestJournal(r)) return false
  for (const [k, f] of Object.entries(journalFactsByQuest(r))) {
    const was = questJournalByKey(k)
    setQuestJournal(k, { ...f, ...(was?.popups === undefined ? {} : { popups: was.popups }), ...(k === key ? (thumb === undefined ? {} : { thumb }) : was?.thumb === undefined ? {} : { thumb: was.thumb }) })
  }
  return true
}

/** One kept picture: its thumbnail and a chip that removes it. */
function Kept({ thumb, label, onRemove, testId }: { thumb: string | undefined; label: string; onRemove: () => void; testId: string }): JSX.Element {
  return (
    <Stack direction="row" spacing={1} alignItems="center" data-testid={testId}>
      {thumb !== undefined && <Box component="img" src={thumb} alt="" sx={{ height: 48, borderRadius: 0.5, border: 1, borderColor: 'divider' }} />}
      <Chip size="small" color="success" label={label} onDelete={onRemove} title="Remove this picture's reading" />
    </Stack>
  )
}

export default function QuestShot({ row }: { row: GapRow }): JSX.Element {
  const key = questTitleKey(row.name)
  const kept = useQuestJournals()[key]
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const steps = questLogOf(row)?.steps
  const places = useMemo(() => journalPlaces((steps ?? []).map((s) => s.zone)), [steps])
  const onPicture = useCallback(
    (png: Uint8Array) => {
      setBusy(true)
      const read = async (): Promise<string | null> => {
        const thumb = await thumbOf(png)
        const look = await window.eq.shotReadText(png, 'popup')
        if (look.error !== undefined) return look.error
        if (isJournalPicture(look.lines)) {
          const j = await window.eq.shotReadText(png, 'journal')
          if (j.error !== undefined) return j.error
          return keepJournal(j, places, { key, thumb }) ? null : journalMissText(j.lines)
        }
        const popup = readPopup({ lines: look.lines, tops: look.tops ?? [], heights: look.heights ?? [], tones: look.tones ?? [], ...(look.leads === undefined ? {} : { leads: look.leads }) })
        if (popup === null) return popupMissText(look.lines)
        const was = questJournalByKey(key)
        setQuestJournal(key, { ...was, popups: withPopup(was?.popups, { ...popup, ...(thumb === undefined ? {} : { thumb }) }) })
        return null
      }
      read()
        .then(setFailed)
        .catch((e: unknown) => setFailed(`The reader did not answer (${e instanceof Error ? e.message : String(e)}). Try the paste again.`))
        .finally(() => setBusy(false))
    },
    [places, key]
  )
  const removeJournal = (): void => {
    const popups = questJournalByKey(key)?.popups
    setQuestJournal(key, popups === undefined || popups.length === 0 ? null : { popups })
  }
  const removePopup = (title: string): void => {
    const was = questJournalByKey(key)
    const popups = withoutPopup(was?.popups, title)
    setQuestJournal(key, popups.length === 0 && !hasJournal(was) ? null : { ...was, popups })
  }
  return (
    <Stack spacing={0.75} data-testid="gaps-shot">
      <PasteZone label="Click here and paste the Quest Journal or a popup window (as many as you like)" busy={busy} onPicture={onPicture} />
      {failed !== null && (
        <Typography variant="body2" color="error.main" data-testid="gaps-shot-error">
          ERROR: unable to read image. {failed}
        </Typography>
      )}
      {hasJournal(kept) && kept !== undefined && (
        <>
          <Kept thumb={kept.thumb} label="Quest Journal ✓" onRemove={removeJournal} testId="gaps-shot-clear-journal" />
          {keptLines(kept).map((l) => (
            <Line key={l}>{l}</Line>
          ))}
        </>
      )}
      {(kept?.popups ?? []).map((p) => (
        <Stack key={p.title} spacing={0.25} data-testid="gaps-shot-popup">
          <Kept thumb={p.thumb} label={`${p.title} ✓`} onRemove={() => removePopup(p.title)} testId="gaps-shot-clear-popup" />
          {popupKeptLines(p).slice(1).map((l) => (
            <Line key={l}>{l}</Line>
          ))}
        </Stack>
      ))}
    </Stack>
  )
}
