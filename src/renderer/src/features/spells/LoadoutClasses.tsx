// spells/LoadoutClasses.tsx — WHICH CLASSES THE LOADOUT IS READ FOR.
//
// Owner, 2026-09-26, pointing at the Spellbook's class filter: *"why does the buff set on loadout
// not let me pick my classes or have the detected like on the spellbook tab?"* The tab read the
// log's detected loadout and nothing else, so a player planning a swap, or one the detection had
// wrong, could not ask the question they had.
//
// THE SPELLBOOK'S ARRANGEMENT, under this tab's own key: the picker FOLLOWS detection until it is
// touched, a pick pins it, and a chip offers today's detected trio whenever the two disagree.
// Two differences, both because this is a loadout rather than a filter: at most three classes,
// and clearing the picker hands it back to detection instead of meaning "every class".
//
// Its own key rather than the Spellbook's: browsing five classes' spells to compare them must not
// re-plan the buff set, and the reverse.

import { type JSX, useCallback, useMemo, useState } from 'react'
import { Chip, Stack } from '@mui/material'
import { CLASS_ABBRS, MAX_COMBO_SLOTS, type ClassAbbr } from '@shared/classCombo'
import type { ComboClasses } from '@shared/levelUnlocks'
import { classDisplayName } from '@shared/spellLevels'
import { readOwnClasses, sameClassSet } from '@shared/spellParty'
import ChipMultiSelect from '../../components/ChipMultiSelect'
import { useCurrentComboClasses } from '../leveling/useLevelUnlocks'

const KEY = 'eq.spells.loadout.classes'

export interface LoadoutClassesState {
  /** The loadout every pane is computed for, in the shape the folds take. */
  combo: ComboClasses
  /** What the app currently infers, whether or not the tab follows it. */
  detected: ClassAbbr[]
  /** The detected trio, when the tab is pinned to something else. */
  offer: ClassAbbr[] | null
  set: (next: ClassAbbr[]) => void
  adopt: () => void
}

export function useLoadoutClasses(): LoadoutClassesState {
  const detectedCombo = useCurrentComboClasses()
  const detected = detectedCombo.resolved
  const [pinned, setPinned] = useState(() => readOwnClasses(localStorage.getItem(KEY)))
  const set = useCallback((next: ClassAbbr[]) => {
    const text = JSON.stringify(next)
    if (next.length === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, text)
    setPinned(readOwnClasses(text))
  }, [])
  const adopt = useCallback(() => set(detected), [set, detected])
  // A PINNED loadout is a statement, so nothing about it is ambiguous; a followed one carries
  // whatever the detection carries, the half-known slots included.
  const combo = useMemo<ComboClasses>(
    () => (pinned === null ? detectedCombo : { resolved: pinned, candidates: [], ambiguous: false }),
    [pinned, detectedCombo]
  )
  const offer = pinned !== null && detected.length > 0 && !sameClassSet(pinned, detected) ? detected : null
  return { combo, detected, offer, set, adopt }
}

/** The picker and its offer chip - the Spellbook's pair, in this tab's words. */
export default function LoadoutClasses({ state }: { state: LoadoutClassesState }): JSX.Element {
  return (
    <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
      <ChipMultiSelect
        options={CLASS_ABBRS}
        value={state.combo.resolved}
        onChange={state.set}
        label="Your classes"
        placeholder="up to three"
        max={MAX_COMBO_SLOTS}
        optionLabel={classDisplayName}
        minWidth={320}
        testId="loadout-classes"
      />
      {state.offer !== null && (
        <Chip
          size="small"
          color="warning"
          variant="outlined"
          label={`detected: ${state.offer.map(classDisplayName).join(', ')}`}
          data-testid="loadout-class-offer"
          title="What the app currently infers you are running. Click to read the loadout for it."
          onClick={state.adopt}
          sx={{ flexShrink: 0 }}
        />
      )}
    </Stack>
  )
}
