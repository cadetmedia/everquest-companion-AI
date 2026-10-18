// slayer/ZoneList.tsx — WHERE TO GO: the zones that serve the picked counters, best first
// (shared/slayer/slayerPlan.ts states the order). A row opens into the mobs that count there.
//
// A MOB WHOSE KIND WAS READ OFF ITS NAME SAYS SO, with the one word the app already uses for an
// estimate (`est.`). A mob whose wiki page states its race carries no mark.

import { type JSX, useState } from 'react'
import {
  Box,
  Chip,
  Collapse,
  FormControlLabel,
  IconButton,
  Link,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from '@mui/material'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import MapIcon from '@mui/icons-material/Map'
import { killsFor, type KillMap } from '@shared/kills'
import type { PlanMob, PlanZone, ZoneOrder } from '@shared/slayer/slayerPlan'
import type { ZoneListBundle } from './useSlayerController'

const CHIP_SX = { height: 18, fontSize: 10, '& .MuiChip-label': { px: 0.75 } }

/** How many counter names a row spells out before it counts the rest. */
const NAMED = 4

function levelText(zone: PlanZone): string {
  if (zone.low === null || zone.high === null) return ''
  if (zone.low === zone.high) return `level ${String(zone.low)}`
  const avg = zone.level === null ? '' : `, avg ${String(zone.level)}`
  return `levels ${String(zone.low)}-${String(zone.high)}${avg}`
}

function CounterChips({
  ids,
  names
}: {
  ids: readonly string[]
  names: ReadonlyMap<string, string>
}): JSX.Element {
  const distinct = [...new Set(ids.map((id) => names.get(id) ?? id))]
  return (
    <>
      {distinct.slice(0, NAMED).map((name) => (
        <Chip key={name} size="small" variant="outlined" label={name} sx={CHIP_SX} />
      ))}
      {distinct.length > NAMED && (
        <Typography variant="caption" color="text.secondary">
          +{String(distinct.length - NAMED)} more
        </Typography>
      )}
    </>
  )
}

/**
 * How often the log saw this mob die, so a mob already worked for a counter reads differently from
 * one never tried. The kills module's own count, archives included (shared/logArchive/mergeKills.ts).
 */
function Killed({ name, kills }: { name: string; kills: KillMap }): JSX.Element {
  const k = killsFor(kills, name)
  if (k === undefined || k.count === 0) {
    return (
      <Typography variant="caption" color="text.disabled" data-testid="slayer-mob-kills">
        never killed
      </Typography>
    )
  }
  const last = new Date(k.lastTs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return (
    <Tooltip title={`Last killed ${last}`}>
      <Typography variant="caption" sx={{ color: 'success.main' }} data-testid="slayer-mob-kills">
        killed {String(k.count)}×
      </Typography>
    </Tooltip>
  )
}

/** How many of a zone's listed mobs the log has seen die at least once. */
function killedIn(zone: PlanZone, kills: KillMap): number {
  let n = 0
  for (const mob of zone.mobs) if ((killsFor(kills, mob.name)?.count ?? 0) > 0) n++
  return n
}

function MobLine({ mob, bundle }: { mob: PlanMob; bundle: ZoneListBundle }): JSX.Element {
  const { onOpenMob, names } = bundle
  return (
    <Stack
      direction="row"
      spacing={0.75}
      alignItems="center"
      flexWrap="wrap"
      useFlexGap
      data-testid="slayer-mob"
      sx={{ py: 0.25 }}
    >
      {onOpenMob === undefined ? (
        <Typography variant="body2">{mob.name}</Typography>
      ) : (
        <Link
          component="button"
          variant="body2"
          underline="hover"
          onClick={() => {
            onOpenMob({ mob: mob.name, entry: mob.entry })
          }}
        >
          {mob.name}
        </Link>
      )}
      {mob.level !== '' && (
        <Typography variant="caption" color="text.secondary">
          level {mob.level}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary">
        {String(mob.spawns)} {mob.spawns === 1 ? 'spawn' : 'spawns'}
      </Typography>
      <Killed name={mob.name} kills={bundle.kills} />
      {mob.basis === 'name' && <Chip size="small" label="est." sx={CHIP_SX} />}
      <CounterChips ids={mob.targets} names={names} />
    </Stack>
  )
}

function ZoneRow({ zone, bundle }: { zone: PlanZone; bundle: ZoneListBundle }): JSX.Element {
  const [open, setOpen] = useState(false)
  const { short } = zone
  const of = bundle.picked > 0 ? ` of ${String(bundle.picked)}` : ''
  return (
    <Box data-testid="slayer-zone" sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ py: 0.5 }}>
        <IconButton
          size="small"
          aria-label={open ? `Hide the mobs in ${zone.name}` : `Show the mobs in ${zone.name}`}
          onClick={() => {
            setOpen(!open)
          }}
        >
          {open ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="body2" sx={{ fontWeight: 600 }} data-testid="slayer-zone-name">
              {zone.name}
            </Typography>
            <Chip
              size="small"
              color={bundle.picked > 0 && zone.targets.length === bundle.picked ? 'success' : undefined}
              label={`${String(zone.targets.length)}${of}`}
              sx={CHIP_SX}
            />
            <Typography variant="caption" color="text.secondary">
              {String(zone.spawns)} spawns
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {levelText(zone)}
            </Typography>
            <Typography variant="caption" color="text.secondary" data-testid="slayer-zone-killed">
              {String(killedIn(zone, bundle.kills))} of {String(zone.mobs.length)} killed before
            </Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <CounterChips ids={zone.targets} names={bundle.names} />
          </Stack>
        </Box>
        {short !== null && (
          <Tooltip title="Open the map">
            <IconButton
              size="small"
              aria-label={`Open the map of ${zone.name}`}
              data-testid="slayer-zone-map"
              onClick={() => {
                bundle.onOpenZone(short)
              }}
            >
              <MapIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ pl: 5, pb: 0.75 }}>
          {zone.mobs.map((mob) => (
            <MobLine key={mob.entry.page} mob={mob} bundle={bundle} />
          ))}
        </Box>
      </Collapse>
    </Box>
  )
}

function PlanControls(props: ZoneListBundle): JSX.Element {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ pb: 0.5 }}>
      <TextField
        size="small"
        type="number"
        label="Mobs up to level"
        value={props.maxLevel ?? ''}
        onChange={(e) => {
          const n = Math.trunc(Number(e.target.value))
          props.onMaxLevel(e.target.value === '' || n <= 0 ? null : n)
        }}
        sx={{ width: 150 }}
        slotProps={{ htmlInput: { min: 1, max: 100, 'data-testid': 'slayer-max-level' } }}
      />
      <Tooltip title="Also list zones from expansions the server has not opened, and mobs the era rules place in content it has not opened (the Fear and Hate revamp).">
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={props.outOfEra}
              onChange={(e) => {
                props.onOutOfEra(e.target.checked)
              }}
            />
          }
          label={<Typography variant="caption">Zones not open yet</Typography>}
        />
      </Tooltip>
      <Tooltip title="Leave out every mob the wiki says lowers a faction when killed. Mobs the wiki says nothing about stay.">
        <FormControlLabel
          control={
            <Switch
              size="small"
              data-testid="slayer-no-faction-hits"
              checked={props.noFactionHits}
              onChange={(e) => {
                props.onNoFactionHits(e.target.checked)
              }}
            />
          }
          label={<Typography variant="caption">No faction hits</Typography>}
        />
      </Tooltip>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="caption" color="text.secondary">
          Sort
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={props.order}
          onChange={(_e, next: ZoneOrder | null) => {
            if (next !== null) props.onOrder(next)
          }}
        >
          <Tooltip title="Most of your picked achievements first">
            <ToggleButton value="matches" data-testid="slayer-sort-matches" sx={{ py: 0.25 }}>
              Matches
            </ToggleButton>
          </Tooltip>
          <Tooltip title="Most spawn points first">
            <ToggleButton value="spawns" data-testid="slayer-sort-spawns" sx={{ py: 0.25 }}>
              Spawns
            </ToggleButton>
          </Tooltip>
          <Tooltip title="Lowest average level of the mobs that count first">
            <ToggleButton value="level" data-testid="slayer-sort-level" sx={{ py: 0.25 }}>
              Level
            </ToggleButton>
          </Tooltip>
        </ToggleButtonGroup>
      </Stack>
    </Stack>
  )
}

export default function ZoneList(props: ZoneListBundle): JSX.Element {
  const { zones, picked } = props
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <Typography variant="subtitle2" data-testid="slayer-zones-title" sx={{ pb: 0.5 }}>
        {picked === 0 ? 'Where to go - every open counter' : `Where to go - ${String(picked)} picked`}
      </Typography>
      <PlanControls {...props} />
      <Box data-testid="slayer-zones" sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }}>
        {zones.map((zone) => (
          <ZoneRow key={zone.key} zone={zone} bundle={props} />
        ))}
        {zones.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            No known zone has these creatures at this level.
          </Typography>
        )}
      </Box>
    </Box>
  )
}
