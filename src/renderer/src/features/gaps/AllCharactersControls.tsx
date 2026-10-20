// The Gaps tab's All characters controls (owner, 2026-10-19): the box (off by default, with its
// warning), the day window beside it while ticked, and one line naming whose data is in the list,
// how old each saved part is, and which are older than two months.

import type { JSX } from 'react'
import { Checkbox, CircularProgress, FormControlLabel, Stack, TextField, Typography } from '@mui/material'
import { MAX_GAP_DAYS, isStale, type CharacterGaps } from '@shared/gapsAllCharacters'
import { Tooltip } from '../../lib/Tooltip'

const WARNING =
  "Joins every character's saved Gaps, on every account and server, with their archived logs when Summarize and archive log is on. " +
  'With many characters this can be a lot of data and take a moment. A character is saved while it is logged in here; one never logged in since this was added shows only its archives. Each log stays separate: only this list is joined.'

/** While main reads every character's saves or the tab joins them: a spinner and what it is doing. */
function Working(): JSX.Element {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" data-testid="gaps-all-working">
      <CircularProgress size={14} />
      <Typography variant="caption" color="text.secondary">
        Reading every character…
      </Typography>
    </Stack>
  )
}

/** The box, and while it is ticked the day window, and a spinner while the join is being made. */
export function AllCharactersBox({
  on,
  onChange,
  days,
  onDays,
  working = false
}: {
  on: boolean
  onChange: (on: boolean) => void
  days: number
  onDays: (days: number) => void
  working?: boolean
}): JSX.Element {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Tooltip title={WARNING}>
        <FormControlLabel
          sx={{ mr: 0 }}
          control={<Checkbox size="small" checked={on} onChange={(e) => onChange(e.target.checked)} sx={{ p: 0.5 }} data-testid="gaps-all-characters" />}
          label={<Typography variant="caption">All characters</Typography>}
        />
      </Tooltip>
      {on && (
        <Tooltip title="Only what was seen in this many days, for every character. A release can rename, move or change things, so older sightings drop out.">
          <TextField
            size="small"
            type="number"
            label="Days back"
            value={days}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isFinite(n) && n >= 1) onDays(n)
            }}
            sx={{ width: 96 }}
            slotProps={{ htmlInput: { min: 1, max: MAX_GAP_DAYS, 'data-testid': 'gaps-days' } }}
          />
        </Tooltip>
      )}
      {on && working && <Working />}
    </Stack>
  )
}

function savedWords(c: CharacterGaps, now: Date): { text: string; stale: boolean } {
  const archives = c.archives > 0 ? `, ${c.archives} archive${c.archives === 1 ? '' : 's'}` : ''
  if (c.savedAt === null) return { text: `${c.name} (archives only${archives})`, stale: false }
  const stale = isStale(c.savedAt, now)
  const date = c.savedAt.slice(0, 10)
  return { text: `${c.name} (saved ${date}${archives}${stale ? ': over 2 months old, log in to refresh it' : ''})`, stale }
}

/** Whose data the list holds: the attached character live, then each other one with its saved date. */
export function CharactersLine({ live, others }: { live: string; others: readonly CharacterGaps[] | undefined }): JSX.Element {
  if (others === undefined) {
    return (
      <Typography variant="caption" color="text.secondary" data-testid="gaps-characters">
        Reading every character&apos;s Gaps…
      </Typography>
    )
  }
  const now = new Date()
  return (
    <Typography variant="caption" color="text.secondary" data-testid="gaps-characters">
      Characters: {live} (live)
      {others.map((c) => {
        const w = savedWords(c, now)
        return (
          <span key={c.character}>
            {', '}
            <Typography component="span" variant="caption" color={w.stale ? 'warning.main' : 'text.secondary'}>
              {w.text}
            </Typography>
          </span>
        )
      })}
      {others.length === 0 ? '. No other character saved yet: log each one in here once.' : '.'}
    </Typography>
  )
}
