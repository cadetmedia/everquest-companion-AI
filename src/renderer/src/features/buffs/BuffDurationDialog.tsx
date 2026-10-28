// BuffDurationDialog — how long one spell's timer runs, chosen by the player (fork issue #4).
//
// The automatic estimate is the wiki duration raised to the longest recent cast, and one odd cast
// can leave it far too long: a reporter's Whirl Till You Hurl read 24 s against a 7.5 s spin, and
// nothing let them fix it. Three choices, each with its number stated BEFORE it is picked:
//
//   * Automatic    — the shipped rule.
//   * From my log  — the middle (median) of the last five clean casts, with no wiki floor, so one
//                    outlier no longer decides the bar. With no clean cast yet the engine keeps the
//                    automatic number, and the option says so.
//   * Set it myself — a typed duration, read by the same parser the spell data uses.
//
// The choice is saved per spell LINE through `setBuffDuration`, which merges on main, so this
// dialog and the Preferences caster list never overwrite each other. Bars of new casts use it at
// once; a crowd-control timer already running keeps the length it started with.

import { type JSX, useEffect, useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography
} from '@mui/material'
import type { BuffStat } from '@shared/types'
import { parseTypedDuration, type BuffDurationOverride } from '@shared/buffTrust'
import { estimatorSourceTitle, fmtDuration } from './format'

type Mode = 'auto' | 'log' | 'fixed'

/** Seconds as the field shows them: `7.5`, `90`. */
function secondsText(ms: number | null | undefined): string {
  return ms == null ? '' : String(Math.round(ms / 100) / 10)
}

/** A duration with tenths under a minute (`7.5s`) — these spells are short and 7.5 is not 8. */
function fmtPrecise(ms: number | null | undefined): string {
  if (ms == null || ms <= 0 || ms >= 60_000) return fmtDuration(ms)
  return `${Math.round(ms / 100) / 10}s`
}

/** The automatic figure: stated by the engine while overridden, otherwise it IS the estimate. */
function automaticMs(stat: BuffStat, choice: BuffDurationOverride | undefined): number | null | undefined {
  return choice === undefined ? stat.estimateMs : stat.autoEstimateMs
}

/** One option's label: the choice and its number, with what it means underneath. */
function ChoiceLabel({ title, note }: { title: string; note: string }): JSX.Element {
  return (
    <Stack>
      <Typography variant="body2">{title}</Typography>
      <Typography variant="caption" color="text.secondary">
        {note}
      </Typography>
    </Stack>
  )
}

/** What the typed text means right now, so a refusal is seen before Save rather than by pressing it. */
function TypedReading({ draft, typed }: { draft: string; typed: number | null }): JSX.Element {
  const empty = draft.trim() === ''
  return (
    <Typography
      variant="caption"
      color={typed === null && !empty ? 'error.main' : 'text.secondary'}
      data-testid="buff-duration-reading"
    >
      {typed !== null
        ? `= ${fmtPrecise(typed)}`
        : empty
          ? 'Seconds (7.5), or 1m 30s, or 1:30'
          : 'Not a duration between 1 second and 3 hours'}
    </Typography>
  )
}

export function BuffDurationDialog({
  stat,
  choice,
  open,
  onClose,
  onSave
}: {
  stat: BuffStat
  choice: BuffDurationOverride | undefined
  open: boolean
  onClose: () => void
  onSave: (choice: BuffDurationOverride | undefined) => void
}): JSX.Element {
  const [mode, setMode] = useState<Mode>('auto')
  const [draft, setDraft] = useState('')
  // Prefill on each opening and never while open: the row underneath re-renders as the log moves.
  useEffect(() => {
    if (!open) return
    setMode(choice === undefined ? 'auto' : choice.mode)
    setDraft(secondsText(choice?.mode === 'fixed' ? choice.ms : stat.estimateMs))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read at OPEN, see above.
  }, [open])

  const typed = parseTypedDuration(draft)
  const auto = automaticMs(stat, choice)
  const canSave = mode !== 'fixed' || typed !== null

  const save = (): void => {
    if (!canSave) return
    if (mode === 'auto') onSave(undefined)
    else if (mode === 'log') onSave({ mode: 'log' })
    else if (typed !== null) onSave({ mode: 'fixed', ms: typed })
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth data-testid="buff-duration-dialog">
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="subtitle1" component="div">
          {stat.spell}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Now {fmtPrecise(stat.estimateMs)} · {estimatorSourceTitle(stat.estimatorSource)}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <RadioGroup
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as Mode)
          }}
        >
          <FormControlLabel
            value="auto"
            control={<Radio size="small" data-testid="buff-duration-auto" />}
            label={
              <ChoiceLabel
                title={`Automatic · ${fmtPrecise(auto)}`}
                note="The wiki duration, raised to your longest recent cast"
              />
            }
          />
          <FormControlLabel
            value="log"
            control={<Radio size="small" data-testid="buff-duration-log" />}
            label={
              <ChoiceLabel
                title={`From my log · ${fmtPrecise(stat.logEstimateMs)}`}
                note={
                  stat.logEstimateMs == null
                    ? 'No clean cast yet, so it stays automatic until one is logged'
                    : 'The middle of your last five clean casts, ignoring the wiki'
                }
              />
            }
          />
          <FormControlLabel
            value="fixed"
            control={<Radio size="small" data-testid="buff-duration-fixed" />}
            label={<Typography variant="body2">Set it myself</Typography>}
          />
        </RadioGroup>
        {mode === 'fixed' && (
          <Stack sx={{ ml: 4, mt: 0.5 }} spacing={0.5}>
            <TextField
              size="small"
              autoFocus
              label="Duration"
              value={draft}
              slotProps={{ htmlInput: { 'data-testid': 'buff-duration-input' } }}
              onChange={(e) => {
                setDraft(e.target.value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
              }}
            />
            <TypedReading draft={draft} typed={typed} />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button size="small" color="inherit" data-testid="buff-duration-cancel" onClick={onClose}>
          Cancel
        </Button>
        <Button size="small" variant="contained" disabled={!canSave} data-testid="buff-duration-save" onClick={save}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}
