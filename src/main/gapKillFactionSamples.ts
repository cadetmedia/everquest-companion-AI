// gapKillFactionSamples.ts — the kill-faction proof lines the Gaps tab asks for when a faction row
// is opened or copied (shared/gapKillFactionSamples.ts says why they are not in the Gaps snapshot):
// the engine's `killFactionSamples` module joined after the attached character's archived `gaps`
// states, which still carry theirs. Also the one read the capture and save paths put back into the
// `gaps` state they keep on disk (`engineGapsWithSamples`).

import { engineRequest } from './dataServer/engineClientHost'
import { liveHistory } from './logArchive/liveHistory'
import { KILL_FACTION_SAMPLES_MODULE, gapsWithSamples, joinedKillFactionSamples } from '../shared/gapKillFactionSamples'

/** The live module's state; throws when the engine cannot serve it (an engine from before it). */
async function liveProofs(): Promise<unknown> {
  const r = await engineRequest('module.snapshot', { module: KILL_FACTION_SAMPLES_MODULE })
  return r.module === KILL_FACTION_SAMPLES_MODULE ? r.state : null
}

/** The asked pairs' lines by `killFactionKey`; a pair without any is absent. */
export async function killFactionSamples(keys: readonly string[]): Promise<Record<string, string[]>> {
  const live = await liveProofs().catch(() => null)
  return joinedKillFactionSamples(liveHistory.archived('gaps'), live, new Set(keys))
}

/** A `gaps` state read off the app's engine, as it is kept on disk: with each pair's lines put back. */
export function engineGapsWithSamples(gaps: unknown): Promise<unknown> {
  return gapsWithSamples(gaps, liveProofs)
}
