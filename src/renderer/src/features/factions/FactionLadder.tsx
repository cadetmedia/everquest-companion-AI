// factions/FactionLadder.tsx — the /con ladder as a strip: every rung in its colour, equal widths,
// and (on a row) a marker where the standing sits. The legend above the table names each rung's
// range, so a chip reading `amiable` has a meaning on screen (owner ask, 2026-10-12).

import { type JSX } from 'react'
import { Box, Typography } from '@mui/material'
import { CONSIDER_FACTION_COLOR, CONSIDER_FACTION_LABEL } from '@shared/considerFaction'
import { TIER_BANDS, factionTier, ladderPosition, nextTier, type TierBand } from './factionTiers'

const range = (b: TierBand): string => `${String(b.floor)} to ${String(b.ceiling)}`

/** What a row's strip says on hover: the number, the rung, and the next rung up. */
export function ladderTitle(standing: number, toMax: number): string {
  const here = CONSIDER_FACTION_LABEL[factionTier(standing)]
  const next = nextTier(standing)
  const up =
    next === null
      ? 'top rung'
      : `${CONSIDER_FACTION_LABEL[next.faction]} at ${String(next.floor)}, ${String(next.floor - standing)} to go`
  return `${String(standing)}, ${here} · ${up} · ${String(toMax)} to max`
}

/** A row's strip: the rungs, faint, and a marker at the standing. */
export function LadderBar({ standing, title }: { standing: number; title: string }): JSX.Element {
  return (
    <Box title={title} sx={{ position: 'relative', display: 'flex', height: 8, borderRadius: 1, overflow: 'hidden' }}>
      {TIER_BANDS.map((b) => (
        <Box key={b.faction} sx={{ flex: 1, bgcolor: CONSIDER_FACTION_COLOR[b.faction], opacity: 0.35 }} />
      ))}
      <Box
        data-testid="factions-ladder-marker"
        sx={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: 3,
          ml: '-1px',
          left: `${String(ladderPosition(standing) * 100)}%`,
          bgcolor: 'text.primary'
        }}
      />
    </Box>
  )
}

/** The legend: every rung, its name and its range. The floors are the classic-EQ thresholds
 *  (factionTiers.ts), which no Legends dump states, and the caption says so. */
export function LadderLegend(): JSX.Element {
  return (
    <Box data-testid="factions-ladder-legend" sx={{ pb: 1 }}>
      <Box sx={{ display: 'flex', gap: '2px' }}>
        {TIER_BANDS.map((b) => (
          <Box key={b.faction} sx={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
            <Box sx={{ height: 6, borderRadius: 1, bgcolor: CONSIDER_FACTION_COLOR[b.faction] }} />
            <Typography variant="caption" noWrap sx={{ display: 'block', color: CONSIDER_FACTION_COLOR[b.faction], lineHeight: 1.4 }}>
              {CONSIDER_FACTION_LABEL[b.faction]}
            </Typography>
            <Typography variant="caption" noWrap color="text.secondary" sx={{ display: 'block', fontSize: 10, lineHeight: 1.2 }}>
              {range(b)}
            </Typography>
          </Box>
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 10, pt: 0.25 }}>
        Rungs as /con names them, hostile to friendly, drawn equal width. The ranges are the classic
        EverQuest thresholds; the faction file states the number, never the rung.
      </Typography>
    </Box>
  )
}
