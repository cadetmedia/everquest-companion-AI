// mobEra.ts — IS THIS BESTIARY ROW CONTENT THE SERVER RUNS TODAY.
//
// The catalog documents the Fear/Hate revamp beside the classic planes it replaced: the Plane of
// Hate's level 60-63 revamp mobs stand in the same zone as the classic ones, so no zone rule can
// tell them apart. The verdict is NOT taken here from the page's raw banner (`MobEntry.eraTag`): a
// banner alone would hide mobs the player fights ("a cave bat" is bannered Velious and lives in a
// classic zone). The data build applies the era rules (banner and zones together) once and stores
// the answer as `MobEntry.outOfEra`; every surface reads that flag through this one function.
//
// A MOB WITHOUT THE FLAG IS IN ERA. Absent says nothing about its era, and silence is not "out"
// (law 1), so every surface behaves exactly as it did before the flag existed.
//
// Pure, relative imports: the node test runner loads it.

import type { MobEntry } from './mobTypes'

/** True exactly when the data build put this mob out of era (`outOfEra: true`). */
export function mobOutOfEra(mob: Pick<MobEntry, 'outOfEra'>): boolean {
  return mob.outOfEra === true
}
