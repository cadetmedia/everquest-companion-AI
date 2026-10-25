// character/useCharacterSheet — the sheet's transport, and nothing else.
//
// Same contract as `usePlannerInventory` (features/planner/plannerInventory.ts), for the same
// reason: the dump is a file the player rewrites mid-session on purpose, so the window's one held
// answer is re-asked on every mount and whenever `inventory:autoReloaded` fires. Type `/outputfile
// inventory` in game with this tab open and the sheet fills itself, no click anywhere.
//
// `ready` is a data-availability flag, not an error. A REJECT resolves to the same "no sheet"
// state as a null answer, and that branch OUTLIVED THE REASON IT WAS WRITTEN. It existed because
// the handler behind `character:sheet` was gated (src/main/unreleased.ts) and simply absent from a
// packaged build; JOS-327 released the tab and the handler is registered everywhere now. The catch
// stays anyway: an invoke can fail for reasons nobody planned, and a transport whose designed
// answer for "no dump" is already `null` has no business turning any of them into a red box.

import type { CharacterSheet } from '@shared/characterSheet'
import { createDumpStore, useDumpStore } from '../../lib/dumpStore'

export interface CharacterSheetState {
  /** the joined sheet, or null when this character has never written a dump */
  sheet: CharacterSheet | null
  /** false until the first read settles */
  ready: boolean
}

/** One held answer for the window, re-asked on every mount and dump rewrite (`lib/dumpStore.ts`). */
const STORE = createDumpStore<CharacterSheet>(
  () => window.eq.characterSheet(),
  () => window.eq
)

export function useCharacterSheet(): CharacterSheetState {
  const { value, ready } = useDumpStore(STORE)
  return { sheet: value, ready }
}
