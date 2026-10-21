// gapSourceMoves — which modules have moved since the Gaps save last looked (gapsCharacters.ts).
//
// A leaf on purpose: serveDeltas.ts notes every engine cursor here, and gapsCharacters.ts reads the
// set before it asks the engine for anything. Without it the save pulled whole `gaps`, `loot` and
// `kills` snapshots (about 2 MB on a long log) through the one engine connection every two minutes
// only to find, by comparing seqs AFTER the fetch, that nothing had moved (perf audit, 2026-10-20:
// the test.28 regression behind a tester's "Reading log…").

const moved = new Set<string>()

/** A module's cursor moved (called for every cursor main receives). */
export function noteModuleMoved(moduleId: string): void {
  moved.add(moduleId)
}

/** Whether any of `ids` moved since the last `takeMoved`, clearing them. */
export function takeMoved(ids: readonly string[]): boolean {
  let any = false
  for (const id of ids) if (moved.delete(id)) any = true
  return any
}
