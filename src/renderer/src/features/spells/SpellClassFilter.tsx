// spells/SpellClassFilter.tsx — THE SPELLBOOK'S CLASS FILTER, as one control two tabs draw.
//
// Lifted out of `SpellbookToolbar` on 2026-10-20 so the Upgrades tab can draw the same thing
// (owner: *"spellbooks, we should just add the same existing control from the other spellbook tabs
// on this tab reusing the existing code"*). It is the Spellbook's control and the Spellbook's state:
// `useSpellClasses` is `useFollowingClasses` under the Spellbook's own key, so a pick on either tab
// is the pick on both. The Loadout keeps its own picker (`LoadoutClasses`) on its own key.
//
// TWO PIECES, NOT ONE, because the Spellbook puts its Kind picker between them and lifting them as
// one block would have moved its chip. Each tab places the two where it wants them.
//
// ── THE GEAR TAB'S CLASS FILTER, WHOLE ──────────────────────────────────────────────────────────
//
// Owner, 2026-09-10: *"the class thing isn't letting me pick and chose like the gear is, this should
// be shared control so we don't reinvent the wheel"*. The CONTROL was always the shared
// `ChipMultiSelect`; what was not shared was everything around it. The Spellbook drove it from a
// query field that started EMPTY, with a separate chip that swapped the whole selection in and out
// - so it opened showing no pills, and there was no way to drop just the Warrior and keep the other
// two. The Gear tab has had the right arrangement since JOS-302: the picker holds the real list and
// shows it as removable pills, it FOLLOWS detection until you touch it, and a separate chip offers
// today's detected trio when the two disagree. `useFollowingClasses` is that state, shared by key.

import type { JSX } from 'react'
import { Chip } from '@mui/material'
import { CLASS_ABBRS } from '@shared/classCombo'
import { classDisplayName } from '@shared/spellLevels'
import ChipMultiSelect from '../../components/ChipMultiSelect'
import { useFollowingClasses, type GearClasses } from '../gear/gearData'

/**
 * The Spellbook's class selection: the pinned list, what the app detects, and the two writers.
 *
 * Call it ONCE per view and pass the result down: a second call in the same view would hold a
 * second copy of the key, and only one of the two would re-read storage after the other wrote it
 * (`useBrowseClasses`' own mount-once rule). The Spells views mount one at a time, so each tab
 * reads the key fresh when it opens.
 */
export function useSpellClasses(): GearClasses {
  return useFollowingClasses('eq.spells.classes')
}

/** The picker. Empty means every class, which is what the placeholder says. */
export function SpellClassPicker({ classes }: { classes: GearClasses }): JSX.Element {
  return (
    <ChipMultiSelect
      options={CLASS_ABBRS}
      value={classes.classes}
      onChange={classes.set}
      label="Classes"
      placeholder="every class"
      optionLabel={classDisplayName}
      minWidth={190}
      testId="spellbook-classes"
    />
  )
}

/**
 * THE OFFER, not a toggle - the Gear tab's `gear-class-offer` chip, same words and same behaviour.
 * It appears only when you have PINNED a list that disagrees with what the app currently infers,
 * and one click adopts today's trio into the picker, where it is then editable like anything else
 * you typed. A filter following detection shows no chip, because there is nothing to offer it.
 */
export function SpellClassOffer({ classes }: { classes: GearClasses }): JSX.Element | null {
  if (classes.offer === null) return null
  return (
    <Chip
      size="small"
      color="warning"
      variant="outlined"
      label={`detected: ${classes.offer.map(classDisplayName).join(', ')}`}
      data-testid="spellbook-class-offer"
      title="What the app currently infers you are running. Click to read the list for it."
      onClick={classes.adopt}
      sx={{ flexShrink: 0 }}
    />
  )
}
