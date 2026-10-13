// achievements/AchievementLines.tsx — an achievement's requirement lines, each drawn as what it
// joins to (shared/achievements/bookRows.ts): a mob's name opens the mob's page, and a line that names another
// achievement opens into that achievement's own lines, as deep as the game goes.
//
// A LINE SAYS WHAT THE FILE SAID ABOUT IT: done or open, the counter when it printed one, and
// `optional` when the game marked it so. A counter the plan can work on carries its checkbox
// while the plan is on screen.

import { type JSX, useState } from 'react'
import { Box, Checkbox, Chip, Collapse, IconButton, Link, Stack, Typography } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import {
  componentText,
  isOptional,
  type BookAchievement,
  type BookComponent,
  type BookGroup
} from '@shared/outputs/achievementBook'
import {
  counterIdOf,
  namedAchievement,
  namedMobs,
  progressText,
  type Located
} from '@shared/achievements/bookRows'
import type { RowContext } from './useAchievementsController'

export const CHIP_SX = { height: 18, fontSize: 10, '& .MuiChip-label': { px: 0.75 } }

/** How deep lines open into lines. The game's deepest chain is four. */
const MAX_NEST = 5

const count = (n: number): string => n.toLocaleString('en-US')

export function StatusIcon({ done }: { done: boolean }): JSX.Element {
  return done ? (
    <CheckCircleIcon color="success" sx={{ fontSize: 16 }} titleAccess="Complete" />
  ) : (
    <RadioButtonUncheckedIcon color="disabled" sx={{ fontSize: 16 }} titleAccess="Open" />
  )
}

/** Where the catalog knows a counter's mobs, in a few words. */
export function reachText(zones: number): string {
  if (zones === 0) return 'no known mobs'
  return `${count(zones)} ${zones === 1 ? 'zone' : 'zones'}`
}

export function PickBox({
  ids,
  label,
  ctx
}: {
  ids: readonly string[]
  label: string
  ctx: RowContext
}): JSX.Element {
  const held = ids.filter((id) => ctx.picks.picks.has(id)).length
  const all = held === ids.length
  return (
    <Checkbox
      size="small"
      checked={all}
      indeterminate={held > 0 && !all}
      onChange={() => {
        ctx.picks.onSet(ids, !all)
      }}
      sx={{ p: 0.25 }}
      slotProps={{ input: { 'aria-label': `Pick ${label}` } }}
    />
  )
}

/**
 * The line's words: a link when they are a mob's whole name, and the achievement's own name when
 * the line names one (`Complete the achievement "Pesticide"` is drawn as `Pesticide`, under the
 * caret that opens it).
 */
function LineText({
  component,
  named,
  ctx
}: {
  component: BookComponent
  named: Located | null
  ctx: RowContext
}): JSX.Element {
  const text = named === null ? componentText(component) : named.achievement.name
  const mobs = named === null ? namedMobs(component, ctx.mobs) : []
  const { onOpenMob } = ctx
  if (mobs.length === 0 || onOpenMob === undefined) {
    return (
      <Typography variant="body2" color={component.done ? 'text.secondary' : 'text.primary'}>
        {text}
      </Typography>
    )
  }
  const [first] = mobs
  return (
    <Link
      component="button"
      variant="body2"
      underline="hover"
      data-testid="achievement-mob"
      onClick={() => {
        // A name several pages share opens by name, and the mob page chooses as a consider does.
        onOpenMob(mobs.length === 1 ? { mob: first.name, entry: first } : { mob: first.name })
      }}
    >
      {text}
    </Link>
  )
}

/** The counter a line printed, and its reach when the plan is on screen (a finished one too). */
function LineCounter({
  id,
  component,
  ctx
}: {
  id: string | null
  component: BookComponent
  ctx: RowContext
}): JSX.Element | null {
  const row = id === null ? undefined : ctx.picks.rows.get(id)
  const { have, need } = component
  return (
    <>
      {have !== undefined && need !== undefined && (
        <Typography variant="caption" color="text.secondary">
          {count(have)} of {count(need)}
        </Typography>
      )}
      {ctx.pickable && row !== undefined && (
        <Typography variant="caption" color="text.secondary">
          {reachText(row.zones)}
        </Typography>
      )}
    </>
  )
}

interface LineProps {
  group: BookGroup
  parent: BookAchievement
  component: BookComponent
  ctx: RowContext
  depth: number
  /** drawn inside the achievement's own row, which already shows the status and the counter */
  bare?: boolean
}

function NestToggle({
  named,
  open,
  onToggle
}: {
  named: Located
  open: boolean
  onToggle: () => void
}): JSX.Element {
  const { name } = named.achievement
  return (
    <>
      <Typography variant="caption" color="text.secondary">
        {progressText(named.achievement)}
      </Typography>
      <IconButton
        size="small"
        aria-label={open ? `Hide what ${name} requires` : `Show what ${name} requires`}
        data-testid="achievement-nest"
        onClick={onToggle}
        sx={{ p: 0.25 }}
      >
        {open ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
      </IconButton>
    </>
  )
}

export function ComponentLine(props: LineProps): JSX.Element {
  const { group, parent, component, ctx, depth, bare = false } = props
  const [open, setOpen] = useState(false)
  const found = namedAchievement(component, parent, ctx.index)
  const named = depth < MAX_NEST ? found : null
  const id = counterIdOf(group, parent, component)
  return (
    <Box data-testid="achievement-line" data-done={component.done ? 'true' : 'false'}>
      <Stack direction="row" spacing={0.75} alignItems="center">
        {!bare && ctx.pickable && id !== null && (
          <PickBox ids={[id]} label={componentText(component)} ctx={ctx} />
        )}
        {!bare && <StatusIcon done={component.done} />}
        <Stack
          direction="row"
          spacing={0.75}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ flex: 1, minWidth: 0 }}
        >
          <LineText component={component} named={found} ctx={ctx} />
          {isOptional(component) && (
            <Chip size="small" variant="outlined" label="optional" sx={CHIP_SX} />
          )}
        </Stack>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
          {!bare && <LineCounter id={id} component={component} ctx={ctx} />}
          {named !== null && (
            <NestToggle
              named={named}
              open={open}
              onToggle={() => {
                setOpen(!open)
              }}
            />
          )}
        </Stack>
      </Stack>
      {named !== null && (
        <Collapse in={open} unmountOnExit>
          <Box sx={{ pl: 3, py: 0.25, borderLeft: '1px solid', borderColor: 'divider', ml: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {named.group.category}
            </Typography>
            <AchievementLines located={named} ctx={ctx} depth={depth + 1} />
          </Box>
        </Collapse>
      )}
    </Box>
  )
}

/** Every requirement line of one achievement. */
export default function AchievementLines({
  located,
  ctx,
  depth
}: {
  located: Located
  ctx: RowContext
  depth: number
}): JSX.Element {
  const { group, achievement } = located
  return (
    <Stack spacing={0.25}>
      {achievement.components.map((component, i) => (
        <ComponentLine
          // The file prints one line twice under one achievement nowhere, but a key must not
          // depend on that.
          key={`${String(i)} ${component.line}`}
          group={group}
          parent={achievement}
          component={component}
          ctx={ctx}
          depth={depth}
        />
      ))}
    </Stack>
  )
}
