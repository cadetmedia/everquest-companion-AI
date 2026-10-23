// QuestShot — the screenshot box on a Quests row (owner, 2026-10-22: "quest pages worked out from the
// log and the Quest Journal"). Paste the Quest Journal window: main reads it on this machine
// (main/shot/journalLines.ts), shared/questJournal.ts finds the task rows (each quest's zone and level
// range) and the selected task's objectives and description. Every task the window lists is kept
// (itemShotsStore.ts `setQuestJournal`), so one paste serves each of its quests' rows; Copy wiki page
// takes the Minimum Level from it.

import { type JSX, useCallback, useMemo, useState } from 'react'
import { Chip, Stack, Typography } from '@mui/material'
import type { GapRow } from '@shared/gaps'
import { questLogOf, questTitleKey, type QuestJournalFacts } from '@shared/gapQuests'
import { isQuestJournal, journalFactsByQuest, journalPlaces, readQuestJournal } from '@shared/questJournal'
import { setQuestJournal, useQuestJournals } from './itemShotsStore'
import { Line, PasteZone } from './PasteZone'

/** What the kept reading says of this quest, in short lines. */
function keptLines(f: QuestJournalFacts): string[] {
  const levels = f.minLevel === undefined ? [] : [`Min ${String(f.minLevel)}${f.maxLevel === undefined ? '' : `, Max ${String(f.maxLevel)}`}`]
  return [
    [...(f.zone === undefined ? [] : [f.zone]), ...levels].join(' · '),
    ...(f.objectives ?? []).map((o) => `${o.text}${o.status === undefined ? '' : ` (${o.status})`}`),
    ...(f.description === undefined ? [] : [f.description])
  ].filter((l) => l !== '')
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
      window.eq
        .shotReadText(png, 'journal')
        .then((reply) => {
          const r = reply.error === undefined ? readQuestJournal(reply.lines, reply.shades, places) : null
          if (r === null || !isQuestJournal(r)) {
            setFailed(reply.error ?? 'No task rows read: paste the whole Quest Journal window, its task list showing.')
            return
          }
          setFailed(null)
          for (const [k, f] of Object.entries(journalFactsByQuest(r))) setQuestJournal(k, f)
        })
        .catch((e: unknown) => setFailed(`The reader did not answer (${e instanceof Error ? e.message : String(e)}). Try the paste again.`))
        .finally(() => setBusy(false))
    },
    [places]
  )
  return (
    <Stack spacing={0.75} data-testid="gaps-shot">
      <PasteZone label="Click here and paste the Quest Journal window (this quest selected) to read its level and objectives" busy={busy} onPicture={onPicture} />
      {failed !== null && (
        <Typography variant="body2" color="error.main" data-testid="gaps-shot-error">
          ERROR: unable to read image. {failed}
        </Typography>
      )}
      {kept !== undefined && (
        <>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip size="small" color="success" label="Quest Journal ✓" onDelete={() => setQuestJournal(key, null)} title="Clear image data" data-testid="gaps-shot-clear-journal" />
          </Stack>
          {keptLines(kept).map((l) => (
            <Line key={l}>{l}</Line>
          ))}
        </>
      )}
    </Stack>
  )
}
