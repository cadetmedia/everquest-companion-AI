// achievements/AchievementsView.tsx — THE ACHIEVEMENTS TAB (UNRELEASED, 2026-09-29).
//
// WHAT THIS TAB IS FOR. The game's Achievements window says what there is to do and how much of
// it is done, one group at a time. This tab reads the same thing out of the `/outputfile
// achievements` dump, for whichever character is active, and adds what the window cannot: a
// search across every group, a requirement that opens into the achievement it names, a mob or a
// zone that opens its page or its map, and for the kill counters the zones where several can be
// worked on together (features/slayer/, which this tab grew out of on 2026-09-28).
//
// A RENDER SHELL: every piece of state and derivation is useAchievementsController.ts's, and the
// three columns take their props pre-bundled.
//
// EVERY COLUMN IS ITS OWN SCROLLER (AGENTS.md UI conventions): the view fills its height and each
// list scrolls in a bounded box rather than growing the page.

import { type JSX } from 'react'
import { Box, Button, Stack, Typography } from '@mui/material'
import MilitaryTechIcon from '@mui/icons-material/MilitaryTech'
import OutputKindLine from '../../components/OutputKindLine'
import ZoneList from '../slayer/ZoneList'
import type { PickBundle, SlayerViewProps, ZoneListBundle } from '../slayer/useSlayerController'
import AchievementList from './AchievementList'
import CategoryRail from './CategoryRail'
import { useAchievementsController } from './useAchievementsController'

/** Width of the categories column: the longest group name the game prints, and its tally. */
const RAIL_WIDTH = 200

/** The never-run state. It names what the tab is for; the line above it names the command. */
function NoDump(): JSX.Element {
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      spacing={1.5}
      sx={{ py: 6, color: 'text.secondary' }}
    >
      <MilitaryTechIcon sx={{ fontSize: 44, opacity: 0.6 }} />
      <Typography
        variant="body2"
        data-testid="achievements-empty"
        sx={{ maxWidth: 480, textAlign: 'center' }}
      >
        Type <code>/outputfile achievements</code> in game, or press Output To File in the
        Achievements window, and this becomes this character&apos;s achievements, grouped as the
        game groups them. The app notices the file by itself; write it again any time to refresh.
      </Typography>
    </Stack>
  )
}

/** The kill counters' plan: what is picked, and the zones that serve the picks. */
function Plan({ picks, zones }: { picks: PickBundle; zones: ZoneListBundle }): JSX.Element {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ pb: 0.5 }}>
        <Button size="small" onClick={picks.onPickNearlyDone} data-testid="slayer-pick-nearly">
          Pick nearly done
        </Button>
        <Button
          size="small"
          onClick={picks.onClear}
          disabled={picks.picks.size === 0}
          data-testid="slayer-pick-clear"
        >
          Clear checked ({picks.picked})
        </Button>
      </Stack>
      <Box sx={{ flexGrow: 1, minHeight: 0 }}>
        <ZoneList {...zones} />
      </Box>
    </Box>
  )
}

export default function AchievementsView(props: SlayerViewProps): JSX.Element {
  const c = useAchievementsController(props)
  return (
    <Box
      data-testid="achievements-view"
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2, minHeight: 0 }}
    >
      <OutputKindLine
        kind="achievements"
        why="Type it in game to list this character's achievements."
        loadedAt={c.readAt}
        testId="achievements-freshness"
      />
      {c.ready && !c.hasDump && <NoDump />}
      {c.hasDump && (
        <Box sx={{ flexGrow: 1, minHeight: 0, display: 'flex', gap: 2 }}>
          <Box sx={{ flex: `0 0 ${String(RAIL_WIDTH)}px`, minWidth: 0, minHeight: 0 }}>
            <CategoryRail {...c.rail} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
            <AchievementList {...c.list} />
          </Box>
          {c.plan !== null && (
            <Box sx={{ flex: '0 0 36%', minWidth: 0, minHeight: 0 }}>
              <Plan {...c.plan} />
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}
