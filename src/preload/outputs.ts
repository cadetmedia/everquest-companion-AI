// outputs.ts — the slice of the main app's bridge that is about the `/outputfile` REGISTRY: the
// per-kind status line every dump-fed surface renders, and the Factions tab's log-evidence read.
//
// A separate file for FILE MASS, not for scope — planner.ts's arrangement verbatim, and the rule
// it states: `src/preload/index.ts` sits at the measured 400-code-line ceiling and the answer is
// to SPLIT rather than to ratchet. This object is spread into the bridge, so every method below
// is an ordinary member of the one `window.eq` surface and no renderer call site changes.

import { ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { OutputFileStatus } from '../shared/outputs/kinds'
import type { FactionEvidenceReport } from '../shared/factionLog'

export const outputsApi = {
  /**
   * Every `/outputfile` kind the app knows, joined to the active character's file on disk
   * (JOS-44). `updatedAt` is the FILE's mtime — when the player dumped, never when we read —
   * and null means the command has never been run here.
   */
  outputsStatus: (): Promise<OutputFileStatus[]> => ipcRenderer.invoke(IPC.outputsStatus),
  /**
   * The LOG's faction receipts since the factions dump was written, folded per faction
   * (shared/factionLog.ts) — what lets a stale dump's numbers be corrected on screen. Null when
   * there is no dump or no log to fold from; in a packaged build the UNRELEASED-gated handler is
   * absent and the invoke rejects, which the (equally absent) Factions tab never gets to see.
   * `recentMinutes` sizes the report's recent tally (the factions the log moved lately).
   */
  factionsEvidence: (recentMinutes?: number): Promise<FactionEvidenceReport | null> =>
    ipcRenderer.invoke(IPC.factionsEvidence, recentMinutes)
}
