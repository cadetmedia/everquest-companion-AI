// The Gaps tab's All characters controls (owner, 2026-10-19): the box (off by default, with its
// warning), the day window beside it (every view since 2026-10-21: "days back should be for any
// character yes"), and one line naming whose data is in the list, how old each saved part is, and
// which are older than two months.

import type { JSX } from 'react'
import { Checkbox, CircularProgress, FormControlLabel, Stack, TextField, Typography } from '@mui/material'
import { MAX_GAP_DAYS, isStale, type CharacterGaps } from '@shared/gapsAllCharacters'
import { Tooltip } from '../../lib/Tooltip'

// Screen text is one short sentence (owner, 2026-10-21: "we just hit them with so much text to read").
const WARNING = "Joins every character's saved Gaps across accounts and servers: can be a lot of data."

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

/** The box, the day window, and a spinner while the join is being made. */
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
      <Tooltip title="Only rows seen in this many days; a release can change older sightings.">
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
      {on && working && <Working />}
    </Stack>
  )
}

/** A character's few words on the line, and the one sentence behind them (its date, what to do). */
function savedWords(c: CharacterGaps, now: Date): { text: string; tip: string; stale: boolean } {
  const archives = `${c.archives} archived log${c.archives === 1 ? '' : 's'}`
  if (c.savedAt === null) return { text: `${c.name} (archives only)`, tip: `Not logged in here since this was added: only its ${archives}.`, stale: false }
  const date = c.savedAt.slice(0, 10)
  // Over two months old, or an older build's save that lacks rows this one serves (a known item's forages).
  if (isStale(c.savedAt, now)) return { text: `${c.name} (over 2 months old)`, tip: `Saved ${date}, over two months ago; log in on ${c.name} to refresh it.`, stale: true }
  if (c.olderRows === true) return { text: `${c.name} (needs refresh)`, tip: `Saved ${date} by an older version; log in on ${c.name} to refresh it.`, stale: true }
  return { text: c.name, tip: `${c.name}'s Gaps saved ${date}, plus ${archives}.`, stale: false }
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
            <Tooltip title={w.tip}>
              <Typography component="span" variant="caption" color={w.stale ? 'warning.main' : 'text.secondary'}>
                {w.text}
              </Typography>
            </Tooltip>
          </span>
        )
      })}
      {others.length === 0 ? '. No other character saved yet: log each one in here once.' : '.'}
    </Typography>
  )
}
