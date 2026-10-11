// KnowledgeBadge — the LORE / quest / tradeskill chips on a loot row, read off the row's MARKS
// (`lib/itemMarks.ts`: one batched call per paint for every mounted row), not off a full
// knowledge record: until 2026-10-10 the chips rode the notable-pickups probe, which looks up
// only the 40 most recent pickups one at a time, so most rows never had one (owner report).
//
// A row with a Plane of Sky chip hides the quest chip (the PoSky chip says it). An item whose
// only use is as a TRADESKILL component (Gnome Meat → Gnome Kabobs) gets a `tradeskill` chip
// instead of `quest`, so the two kinds of "it is for something" stay apart.

import type { JSX } from 'react'
import { Chip, Stack } from '@mui/material'
import type { ItemMarks } from '@shared/itemKnowledge'
import { useItemMarks } from '../../lib/itemMarks'

interface BadgeFlags {
  showQuest: boolean
  showTradeskill: boolean
}

function badgeFlags(m: ItemMarks, isPosky: boolean): BadgeFlags {
  const hasQuests = m.questUses > 0
  const tradeskillOnly = m.recipes > 0 && !hasQuests
  return {
    showQuest: (m.quest || hasQuests) && !isPosky && !tradeskillOnly,
    showTradeskill: tradeskillOnly && !isPosky
  }
}

export function KnowledgeBadge({ name, isPosky }: { name: string; isPosky: boolean }): JSX.Element | null {
  const m = useItemMarks(name)
  if (!m) return null
  const flags = badgeFlags(m, isPosky)
  if (!m.lore && !flags.showQuest && !flags.showTradeskill) return null
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" component="span">
      {m.lore && <Chip size="small" color="warning" variant="outlined" label="LORE" sx={{ height: 18, fontSize: 10 }} />}
      {flags.showQuest && (
        <Chip size="small" color="secondary" variant="outlined" label="quest" sx={{ height: 18, fontSize: 10 }} />
      )}
      {flags.showTradeskill && (
        <Chip size="small" color="info" variant="outlined" label="tradeskill" sx={{ height: 18, fontSize: 10 }} />
      )}
    </Stack>
  )
}
