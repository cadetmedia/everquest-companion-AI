// LogArchiveSetting — Preferences → Game → "Summarize and archive log" (docs/plans/log-archive).
//
// OFF FOR EVERY PLAYER, and only the player turns it on, here. While it is off the card shows the
// switch and what turning it on allows, and nothing else, and the app does nothing with the log.
// While it is on, the log is archived automatically whenever it passes AUTO_ARCHIVE_BYTES
// (main/logArchive/autoArchive.ts): turning the switch on is the consent, and the player should
// never have to come back here (owner, 2026-10-06). The one button archives now, for a player who
// does not want to wait. The archive makes its own verified backup, so the card offers no separate
// backup or keep step; the IPC for them stays for the trial scripts.
//
// Shown in every build since step 6.3 (owner, 2026-10-04); the switch stays off by default.

import { type JSX, useCallback, useEffect, useState } from 'react'
import { Alert, Box, Button, FormControlLabel, Stack, Switch, Typography } from '@mui/material'
import type { LogArchiveReply, LogArchiveStatus, SegmentRow } from '@shared/logArchive/panel'
import { AUTO_ARCHIVE_BYTES } from '@shared/logArchive/preflight'

function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

function fmtDay(ms: number | null): string {
  return ms === null ? 'never' : new Date(ms).toLocaleDateString()
}

/** Two-step button: the first click shows what will happen, the second does it. */
function ConfirmButton(props: { label: string; confirm: string; disabled?: boolean; onGo: () => void; testId: string }): JSX.Element {
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return (
      <Button size="small" variant="outlined" disabled={props.disabled} data-testid={props.testId} onClick={() => setAsking(true)}>
        {props.label}
      </Button>
    )
  }
  return (
    <Stack spacing={1}>
      <Typography variant="body2">{props.confirm}</Typography>
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="contained" data-testid={`${props.testId}-yes`} onClick={() => { setAsking(false); props.onGo() }}>
          Yes, go ahead
        </Button>
        <Button size="small" onClick={() => setAsking(false)}>Cancel</Button>
      </Stack>
    </Stack>
  )
}

/** A grey fill rather than a border, as the install-folder card does: the card is the one border. */
const FILL = { p: 1.25, borderRadius: 1, bgcolor: 'action.hover' } as const

/** A small label over its value, the install-folder card's path row. */
function Stat(props: { label: string; value: string; mono?: boolean; testId?: string }): JSX.Element {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block">
        {props.label}
      </Typography>
      <Typography
        variant="body2"
        data-testid={props.testId}
        sx={props.mono === true ? { fontFamily: 'monospace', wordBreak: 'break-all' } : undefined}
      >
        {props.value}
      </Typography>
    </Box>
  )
}

function SegmentLine(props: { s: SegmentRow; newest: boolean; run: (p: Promise<LogArchiveReply>) => void }): JSX.Element {
  const { s } = props
  return (
    <Box
      data-testid={`log-archive-segment-${s.id}`}
      sx={{ ...FILL, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600} title={s.archivePath ?? undefined}>
          {s.firstStamp.slice(0, 10)} to {s.lastStamp.slice(0, 10)}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          {fmtBytes(s.logBytes)}
          {s.gzBytes !== null ? `, ${fmtBytes(s.gzBytes)} compressed` : ''}
          {s.olderEngine && (
            <span title="Later fixes to how the log is read reach this history when it is refreshed.">
              {' '}· recorded by {s.app}
            </span>
          )}
        </Typography>
        {s.gapLines > 0 && (
          <Typography variant="caption" color="text.secondary" display="block">
            {s.gapLines} line(s) written during the move are archived but not counted.
          </Typography>
        )}
      </Box>
      <Stack direction="row" spacing={1}>
        {/* Offered whenever the archive is kept, not only for an older version: a reading can change
            without the version moving (a dev build, or a module that learned something new, as
            the Bazaar did quoting who said what), and reading it again only replaces the totals. */}
        {s.archivePath !== null && (
          <ConfirmButton
            testId="log-archive-refresh"
            label="Refresh"
            confirm="Read this archive again with this version, in the background, and replace its totals. A big log takes a minute or two."
            onGo={() => props.run(window.eq.logArchiveRefresh(s.id))}
          />
        )}
        {props.newest && s.archivePath !== null && (
          <ConfirmButton
            testId="log-archive-restore"
            label="Put back"
            confirm="Join this archive back onto the front of your current log, oldest first, so nothing is lost. The app then restarts to read it."
            onGo={() => props.run(window.eq.logArchiveRestore(s.id))}
          />
        )}
      </Stack>
    </Box>
  )
}

function OnPanel(props: { st: LogArchiveStatus; run: (p: Promise<LogArchiveReply>) => void }): JSX.Element {
  const { st, run } = props
  return (
    <Stack spacing={1.5}>
      <Box sx={{ ...FILL, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {st.live !== null && (
          <Stat label="Current log" value={`${fmtBytes(st.live.bytes)} · ${fmtDay(st.live.modifiedMs)}`} testId="log-archive-live" />
        )}
        <Stat label="Archives kept in" value={st.dir} mono />
      </Box>
      <Box>
        <ConfirmButton
          testId="log-archive-rotate"
          label="Archive now"
          disabled={st.rotateBlockers.length > 0}
          confirm={`Move your log (${fmtBytes(st.live?.bytes ?? 0)}) into the archive folder and start a fresh one? Your history stays, and the game can stay open.`}
          onGo={() => run(window.eq.logArchiveRotate())}
        />
      </Box>
      {st.rotateBlockers.length > 0 && (
        <Typography variant="caption" color="text.secondary" data-testid="log-archive-blockers">
          Archiving is not available right now: {st.rotateBlockers.join(' ')}
        </Typography>
      )}
      {st.archived.length > 0 && (
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1 }}>
          History
        </Typography>
      )}
      {st.archived.map((s) => (
        <SegmentLine key={s.id} s={s} newest={s.id === st.newestSealedId} run={run} />
      ))}
      {st.held.map((h) => (
        <Typography key={h.id} variant="caption" color="text.secondary" display="block">
          {h.text}
        </Typography>
      ))}
      {st.skipped.map((k) => (
        <Typography key={k.file} variant="caption" color="warning.main" display="block">
          {k.file} could not be read: {k.reason}
        </Typography>
      ))}
      <Typography variant="caption" color="text.secondary">
        Kills, loot, levels and AA carry over. Fight details, alerts, zone and group start fresh.
      </Typography>
    </Stack>
  )
}

export function LogArchiveSetting(): JSX.Element {
  const [st, setSt] = useState<LogArchiveStatus | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [offAsking, setOffAsking] = useState(false)

  useEffect(() => {
    void window.eq.logArchiveStatus().then(setSt)
  }, [])

  const run = useCallback((p: Promise<LogArchiveReply>) => {
    setMsg({ ok: true, text: 'Working…' })
    void p.then((r) => {
      setSt(r.status)
      setMsg({ ok: r.ok, text: r.message })
    })
  }, [])

  if (st === null) return <Typography variant="body2">Loading…</Typography>
  return (
    <Stack spacing={1.5} data-testid="pref-log-archive">
      <FormControlLabel
        control={
          <Switch
            size="small"
            data-testid="log-archive-switch"
            checked={st.enabled}
            onChange={(e) => {
              if (e.target.checked) run(window.eq.setLogArchiveEnabled(true))
              else setOffAsking(true)
            }}
          />
        }
        label={<Typography variant="body2">Summarize and archive log</Typography>}
      />
      <Typography variant="caption" color="text.secondary">
        {st.enabled
          ? `On. Past ${fmtBytes(AUTO_ARCHIVE_BYTES)}, your log is archived and a fresh one starts.`
          : `Off. Keeps your log small: past ${fmtBytes(AUTO_ARCHIVE_BYTES)}, it is archived and a fresh one starts, and your kills, loot and levels keep showing.`}
      </Typography>
      {offAsking && (
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2">Turn it off? Archived history stops showing; your archives stay on disk.</Typography>
          <Button size="small" variant="contained" data-testid="log-archive-off-yes" onClick={() => { setOffAsking(false); run(window.eq.setLogArchiveEnabled(false)) }}>
            Turn off
          </Button>
          <Button size="small" onClick={() => setOffAsking(false)}>Cancel</Button>
        </Stack>
      )}
      {msg !== null && <Alert severity={msg.ok ? 'success' : 'warning'}>{msg.text}</Alert>}
      {st.enabled && <OnPanel st={st} run={run} />}
    </Stack>
  )
}
