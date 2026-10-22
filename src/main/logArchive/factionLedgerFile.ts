// main/logArchive/factionLedgerFile.ts — WRITE AN ARCHIVED LOG'S FACTION LEDGER (step 4.16).
//
// The ledger's format and rules are `shared/factionLedger.ts`, which the Factions tab reads. This
// file is the fs half: stream a log's lines through the builder and write the result beside the
// segment. Two callers, and nothing else re-reads an archive:
//
//   * the archive step (`rotate.ts finishFromMoved`), from the moved log while it still exists,
//     whole, including any lines the game wrote between the capture and the move;
//   * Refresh, from the compressed archive, which holds exactly the same bytes.
//
// A ledger that cannot be written costs only the faction correction for that stretch: the archive
// itself is untouched, so the callers note the failure and go on.

import { createReadStream } from 'node:fs'
import { basename, join } from 'node:path'
import { createInterface } from 'node:readline'
import { createGunzip } from 'node:zlib'
import { LedgerBuilder, ledgerFileName, type FactionLedger } from '../../shared/factionLedger'
import { writeFileDurable } from '../telemetry/durableWrite'

export interface LedgerSource {
  /** The plain moved log, or the `.gz` archive. */
  path: string
  gz: boolean
  /** The live log's file name the lines were written to. */
  logName: string
}

/** Every line of `source` through the builder. */
export async function buildFactionLedger(source: LedgerSource, segmentId: string): Promise<FactionLedger> {
  const raw = createReadStream(source.path)
  const input = source.gz ? raw.pipe(createGunzip()) : raw
  const builder = new LedgerBuilder()
  const lines = createInterface({ input, crlfDelay: Infinity })
  for await (const line of lines) builder.add(line)
  return builder.build(source.logName, segmentId)
}

/** Build and write `<segment id>.factions.json` in `dir`. Answers how many entries it holds. */
export async function writeFactionLedger(dir: string, segmentId: string, source: LedgerSource): Promise<number> {
  const ledger = await buildFactionLedger(source, segmentId)
  writeFileDurable(dir, join(dir, ledgerFileName(segmentId)), JSON.stringify(ledger))
  return ledger.events.length
}

/** The live log's name for a moved or archived path: the journal knows it as `logPath`. */
export function logNameOf(logPath: string): string {
  return basename(logPath.replace(/\\/g, '/'))
}
