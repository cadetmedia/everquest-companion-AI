// character/PlannedSockets.tsx — the two things a socket chip gained on 2026-10-26 (Malkil via the
// owner): the RECOMMENDED view's change chips ("red outline and text for removal, green outline and
// text for addition") and the LOCK ("toggle an exaltation to be locked (and unlocked) in a piece of
// gear"). SlotGrid's socket row draws them; the plan and the locks come in on `SocketAdvice`.

import type { JSX, MouseEvent } from 'react'
import { Chip, Typography } from '@mui/material'
import LockIcon from '@mui/icons-material/Lock'
import LockOpenIcon from '@mui/icons-material/LockOpen'
import { ownershipKey } from '@shared/planner/ownership'
import { KnownItemTooltip } from '../../lib/KnownItemTooltip'
import type { SocketAdvice } from './SlotGrid'
import type { SeatChange } from './socketDiff'

/** The one chip geometry every row under an item name shares (SlotGrid's `SMALL_CHIP`). */
const SMALL_CHIP = {
  height: 16,
  maxWidth: '100%',
  '& .MuiChip-label': { px: 0.5, fontSize: 10, lineHeight: 1.6 }
}

/**
 * The lock on a filled chip: the chip's end icon, a closed padlock while locked and an open one that
 * shows only on hover while not, so an unlocked row stays as quiet as it was. Nothing when the
 * character is not known yet (a lock saved then would be nobody's).
 */
export function lockProps(
  advice: SocketAdvice | undefined,
  seat: { cellId: string; type: string },
  gem: string
): { onDelete?: (e: MouseEvent) => void; deleteIcon?: JSX.Element; sx?: object } {
  const toggle = advice?.toggleLock
  if (toggle === undefined) return {}
  const locked = advice?.lockedAt(seat.cellId, seat.type) === true
  return {
    onDelete: () => toggle(seat.cellId, seat.type, ownershipKey(gem)),
    deleteIcon: locked ? (
      <LockIcon data-testid="exalt-lock-on" aria-label="Unlock" />
    ) : (
      <LockOpenIcon data-testid="exalt-lock-off" aria-label="Lock" />
    ),
    sx: {
      '& .MuiChip-deleteIcon': { fontSize: 11, mr: 0.25, ml: -0.25, opacity: locked ? 0.9 : 0 },
      '&:hover .MuiChip-deleteIcon': { opacity: 0.9 }
    }
  }
}

/** The words a locked chip's hover adds, and whether the gem helps you at all. */
export function lockWords(advice: SocketAdvice | undefined, seat: { cellId: string; type: string }, gem: string): string {
  if (advice?.lockedAt(seat.cellId, seat.type) !== true) return advice?.toggleLock === undefined ? '' : ' Click the padlock to lock it here.'
  const needs = advice.uselessNeeds(ownershipKey(gem), seat.type)
  return ` Locked: the layout keeps it here.${needs === undefined ? '' : ` It only helps ${needs}.`}`
}

/** One coloured chip of a change: the gem going (red) or the gem coming (green). */
function ChangeChip({
  gem,
  label,
  hover,
  added,
  lock = {}
}: {
  gem: string
  label: string
  hover: string
  added: boolean
  /** a removed gem keeps its padlock: lock it to keep it (`lockProps`) */
  lock?: ReturnType<typeof lockProps>
}): JSX.Element {
  return (
    <KnownItemTooltip
      name={gem}
      clickThrough
      extra={<Typography component="div" sx={{ fontSize: 11, mt: 0.5 }}>{hover}</Typography>}
    >
      <Chip
        label={label}
        size="small"
        variant="outlined"
        color={added ? 'success' : 'error'}
        data-testid={added ? 'exalt-plan-added' : 'exalt-plan-removed'}
        onDelete={lock.onDelete}
        deleteIcon={lock.deleteIcon}
        sx={{ ...SMALL_CHIP, fontWeight: 600, ...lock.sx }}
      />
    </KnownItemTooltip>
  )
}

/**
 * A seat the Recommended view changes: the gem that comes out in red, the gem that goes in in green,
 * each labelled by the effect it grants (the filled chip's own spelling), the reason on the hover.
 */
export function ChangedSeat({
  change,
  advice
}: {
  change: SeatChange
  advice: SocketAdvice
}): JSX.Element {
  const { type, current, target } = change
  const effectOf = (gem: string): string => advice.effectOf(ownershipKey(gem), type)?.effect ?? gem
  return (
    <>
      {current !== null && (
        <ChangeChip
          gem={current}
          label={`${type}: ${effectOf(current)}`}
          hover={`Take out ${current}.${target === null ? ` ${change.why ?? ''}` : ''}${advice.toggleLock === undefined ? '' : ' Click the padlock to keep it here.'}`}
          added={false}
          lock={lockProps(advice, change, current)}
        />
      )}
      {target !== null && (
        <ChangeChip
          gem={target}
          label={`${type}: ${change.targetEffect ?? effectOf(target)}`}
          hover={`Put in ${target}${change.targetFrom === undefined ? '' : ` from ${change.targetFrom}`}.`}
          added
        />
      )}
    </>
  )
}
