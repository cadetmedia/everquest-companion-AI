// THE EXAMPLE UNDER "Where your pet's damage shows" (owner, 2026-10-21): a small meter showing how
// the chosen layout looks, so the three choices read at a glance. It is the REAL meter: the same
// builder (petRows.meterPanel / groupedPanel) and the same rows (MeterRows) the Combat tab draws,
// over a fixed sample of you, your pet and a group-mate. Nothing here is clickable.

import { type JSX } from 'react'
import { Box, Typography } from '@mui/material'
import { MeterRows } from '../combat/MeterRows'
import { groupedPanel, meterPanel } from '../combat/petRows'
import type { PetLayout } from '../combat/combatPrefs'
import type { SourceView } from '@shared/combat'

/** One sample source, over a one-minute fight: every field the rows read, no misses or resists. */
function sample(id: string, name: string, kind: SourceView['kind'], total: number): SourceView {
  return {
    id,
    name,
    kind,
    total,
    dps: total / 60,
    pct: 100,
    hits: 0,
    crits: 0,
    critPct: 0,
    ambiguousHits: 0,
    ambiguousTotal: 0,
    misses: 0,
    hitPct: 100,
    missBreakdown: { miss: 0, dodge: 0, parry: 0, riposte: 0, block: 0, absorb: 0 },
    resists: 0,
    resistPct: 0,
    skills: [],
    categories: []
  }
}

// Kyle out-damages you alone but not you with your pet, so each layout ranks the rows differently.
const SAMPLE: SourceView[] = [
  sample('member:kyle', 'Kyle', 'member', 5000),
  sample('you', 'You', 'you', 4400),
  sample('pet:example', 'Vanab', 'pet', 2000)
]

export function PetLayoutPreview({ layout }: { layout: PetLayout }): JSX.Element {
  const panel = groupedPanel(meterPanel(SAMPLE, layout === 'nested', null), layout === 'grouped')
  return (
    <Box data-testid="pref-pet-layout-preview" sx={{ maxWidth: 380, pointerEvents: 'none' }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        Example
      </Typography>
      <MeterRows panel={panel} activeSec={60} procs={[]} setDrill={null} />
    </Box>
  )
}
