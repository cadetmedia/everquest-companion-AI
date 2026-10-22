// ARCHIVED FIGHT — what the meter body shows for a fight from an archived log (docs/plans/log-archive,
// step 4.9). Ruling 0.4 keeps a fight's summary and leaves its breakdown in the archive, so this
// states the summary and says where the rest is, instead of an empty meter that reads as broken.

import { Paper, Stack, Typography } from '@mui/material'
import { formatDate, formatTime } from '../../lib/formatDate'
import { formatNum as fmt, formatRate } from '../../lib/formatRate'
import { fmtDur } from './combatShared'
import type { SegmentSummary } from '@shared/combat'

export function ArchivedFightPane({ fight }: { fight: SegmentSummary }): React.JSX.Element {
  const when = fight.startTs ? `${formatDate(fight.startTs)} ${formatTime(fight.startTs)}` : ''
  const activeNote = fight.activeSec > 0 && fight.activeSec < fight.durationSec ? ` (act ${formatRate(fight.activeDps)})` : ''
  return (
    <Paper variant="outlined" data-testid="archived-fight" sx={{ p: 2, flexGrow: 1 }}>
      <Stack spacing={0.75}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {fight.name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {[fight.zone, when].filter(Boolean).join(' · ')}
        </Typography>
        <Typography variant="body2">
          {formatRate(fight.dps)}
          {activeNote} · {fmt(fight.total)} · {fmtDur(fight.durationSec)}
          {fight.enemyHealTotal > 0 ? ` · +${fmt(fight.enemyHealTotal)} enemy heal` : ''}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          This fight is from an archived log, so only its summary is kept here. The full breakdown is
          in the archive {fight.archive ? <strong>{fight.archive}</strong> : 'it was moved to'}.
        </Typography>
      </Stack>
    </Paper>
  )
}
