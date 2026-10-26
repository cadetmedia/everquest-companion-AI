// shared/logArchive/carryOver.ts — THE PRESENT ACROSS THE CUT: the one place that says which "true
// right now" facts survive a log rotation (owner, 2026-10-25: "we need to make sure we have some sort
// of COMMON CARRY OVER type spot for this data", after an automatic archive left Zone I'm in blank).
//
// A rotation starts a fresh log mid-play. History (kills, loot, gaps) is joined by each module's own
// merge rule, but some fields are not history: they state where you are and what you are NOW, and a
// fresh log says nothing about them until the game prints the line again (a zone line, a ding, your
// own /who row). Until it does, the archive's last word is still the truth, so it is shown.
//
// THE RULE, for every field in the table: the newer side's value when it states one, else the older
// side's. The live log is always the newer side, so the first zone line or level statement it reads
// takes over at once. Nothing is invented: a field neither side states stays absent.
//
// ADDING A FIELD: put it in CARRY_OVER under its module. A module listed here with no merge rule of
// its own gets `carryOverRule` in mergeRules.ts; a module with its own rule calls `carriedValue` for
// the field (respawn's header zone does, in mergeRespawn.ts).
//
// DISPLAY ONLY. The engine is never seeded with these (BRANCH_NOTES, log-archive: a fold is never
// seeded with what it re-derives): a respawn sample still needs a real zone stay in the live log.

/** Per module, the fields a fresh log does not know until the game states them again. */
export const CARRY_OVER: Readonly<Record<string, readonly string[]>> = {
  // Zone I'm in, the maps, the zone strip, celebrations; the level every surface prints.
  character: ['zone', 'level'],
  // The Timers header (mergeRespawn.ts carries its rows too, which this table does not cover).
  respawn: ['zone']
}

/** A value that states something: not absent, not null, not an empty string. */
function states(v: unknown): boolean {
  return v !== undefined && v !== null && v !== ''
}

/** The newer side's value when it states one, else the older side's. */
export function carriedValue<T>(older: T, newer: T): T {
  return states(newer) ? newer : older
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * The merge rule for a module whose only history is its present: `newer` with each CARRY_OVER field
 * it does not state taken from `older`. Null when either side is not an object (that archive is
 * skipped, as every rule's unreadable side is).
 */
export function carryOverRule(moduleId: string): (older: unknown, newer: unknown) => unknown {
  const fields = CARRY_OVER[moduleId] ?? []
  return (older, newer) => {
    if (!isObject(older) || !isObject(newer)) return null
    const out: Record<string, unknown> = { ...newer }
    for (const f of fields) {
      const v = carriedValue(older[f], newer[f])
      if (states(v)) out[f] = v
    }
    return out
  }
}
