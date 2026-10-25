// SpellShot — the screenshot box on a Gaps spell row (owner, 2026-10-21: "if they have spells up lets
// do it, anything we can get from an image we should be trying to"). Paste the spell display window:
// main reads its text on this machine, shared/spellWindow.ts maps it against the install's own
// description (the window's numbers into the file's words), and Copy wiki page uses what is kept.
// The icon, classes, mana, times, resist and messages come from the files already (gapSpellFacts).

import { type JSX, useCallback, useMemo, useState } from 'react'
import { Chip, Stack, TextField, Typography } from '@mui/material'
import type { GapRow } from '@shared/gaps'
import { otherItemNote } from '@shared/itemShotKeep'
import { fileDescription, isSpellWindow, RANKS, readSpellWindow, spellProblem, type SpellPageShot, type SpellWindowRead } from '@shared/spellWindow'
import { useSpellFacts } from '../../lib/gapSpellFacts'
import { keepPartPicture, setSpellShot, useSpellShots } from './itemShotsStore'
import { KeptPicture, Line, PasteZone, WrongItem } from './PasteZone'

export const keepOf = (r: SpellWindowRead): SpellPageShot => ({ ...(r.description === undefined ? {} : { description: r.description }), fields: r.fields })

/** The kept window: its description (editable) and the labelled lines it gave. */
function Kept({ name, kept, fromFile }: { name: string; kept: SpellPageShot; fromFile: boolean }): JSX.Element {
  const fields = Object.entries(kept.fields ?? {})
  return (
    <>
      <Stack direction="row" spacing={1} alignItems="center">
        <Chip size="small" color="success" label="Spell window ✓" onDelete={() => setSpellShot(name, null)} title="Clear image data" data-testid="gaps-shot-clear-spell" />
      </Stack>
      {fromFile ? (
        <Line>Description: the game's own text (no numbers to fill), from the install.</Line>
      ) : (
        <TextField
          label="description (check it against the window; Copy wiki page uses this)"
          multiline
          minRows={2}
          size="small"
          value={kept.description ?? ''}
          onChange={(e) => setSpellShot(name, { ...kept, description: e.target.value })}
          slotProps={{ htmlInput: { 'data-testid': 'gaps-shot-description' } }}
        />
      )}
      {fields.length > 0 && <Line>From the window (the files win where they say): {fields.map(([k, v]) => `${k} = ${v}`).join(' · ')}</Line>}
    </>
  )
}

export default function SpellShot({ row }: { row: GapRow }): JSX.Element {
  const kept = useSpellShots()[row.name]
  // The row's name with each rank after it too: `Clarity II` in the install is a spell of its own, not Clarity's rank.
  const names = useMemo(() => [row.name, ...RANKS.map((r) => `${row.name} ${r}`)], [row.name])
  const known = useSpellFacts(names)
  const facts = known[row.name]
  const [busy, setBusy] = useState(false)
  /** Why the last paste kept nothing, in words; null when it kept something. */
  const [failed, setFailed] = useState<string | null>(null)
  const [read, setRead] = useState<SpellWindowRead | null>(null)
  const [pending, setPending] = useState<{ read: SpellWindowRead; note: string; png: Uint8Array } | null>(null)
  /** Where the kept window's picture was saved (owner, 2026-10-22: spell pictures under the spell folder). */
  const [picture, setPicture] = useState<string | null>(null)
  // The picture is written after the reading is kept, and never holds it up.
  const keepWindow = useCallback(
    (r: SpellWindowRead, png: Uint8Array) => {
      setSpellShot(row.name, keepOf(r))
      void keepPartPicture('spell', row.name, png).then((path) => path !== null && setPicture(path))
    },
    [row.name]
  )
  const onPicture = useCallback(
    (png: Uint8Array) => {
      setBusy(true)
      setPending(null)
      window.eq
        .shotReadText(png)
        .then((reply) => {
          const isSpell = (n: string): boolean => known[n] !== undefined
          const r = reply.error === undefined ? readSpellWindow(reply.lines, facts?.description, row.name, isSpell) : null
          const ok = r !== null && isSpellWindow(r)
          setFailed(ok ? null : spellProblem(reply))
          setRead(ok ? r : null)
          if (!ok) return
          // A window that names another spell, or whose name was not read, waits for the player, as an item's does.
          const note = otherItemNote(r.name, row.name, 'spell window', names.slice(1).filter(isSpell))
          if (note === undefined) keepWindow(r, png)
          else setPending({ read: r, note, png })
        })
        .catch((e: unknown) => setFailed(`The reader did not answer (${e instanceof Error ? e.message : String(e)}). Try the paste again.`))
        .finally(() => setBusy(false))
    },
    [row.name, facts, known, names, keepWindow]
  )
  return (
    <Stack spacing={0.75} data-testid="gaps-shot">
      <PasteZone label="Click here and paste the spell display window to read it" busy={busy} onPicture={onPicture} />
      {failed !== null && (
        <Typography variant="body2" color="error.main" data-testid="gaps-shot-error">
          ERROR: unable to read image. {failed}
        </Typography>
      )}
      {pending !== null && (
        <WrongItem
          note={pending.note}
          png={pending.png}
          onUse={() => {
            keepWindow(pending.read, pending.png)
            setPending(null)
          }}
          onDiscard={() => {
            setPending(null)
            setRead(null)
          }}
        />
      )}
      {(read?.checks ?? []).map((c) => (
        <Line key={c} warn>
          {c}
        </Line>
      ))}
      <KeptPicture path={picture} />
      {kept !== undefined && <Kept name={row.name} kept={kept} fromFile={fileDescription(facts?.description) !== undefined} />}
    </Stack>
  )
}
