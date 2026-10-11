// shared/logArchive/modules.ts — every module a segment captures (step 2.1).
//
// ALL OF THEM, from the first capture, whether or not a merge rule exists yet: a rule added later
// then applies to logs archived earlier (the plan's "capture everything, merge gradually"). The
// list is the engine's registry as `parity --snapshots` prints it; a module the engine does not
// have is skipped at capture, so a stale entry costs one refused read.

export const CAPTURED_MODULES: readonly string[] = [
  'combo',
  'roster',
  'loot',
  'turnins',
  'classUnlocks',
  'kills',
  'respawn',
  'progression',
  'leveling',
  'character',
  'outputFiles',
  'spellSets',
  'itemTiers',
  'observedSpellRanks',
  'alerts',
  'buffs',
  'buffTimers',
  'consider',
  'resist',
  'bazaar',
  'gaps',
  'eventFeed'
]
