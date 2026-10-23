// gapVerdictsRead.ts — what the runtime knowledge caches already say about a name, read and
// never fetched (the Gaps tab's action chips, owner ask 2026-10-12).
//
// `itemLookup.ts` and `mobLookup.ts` write `<userData>/item-knowledge-cache.json` and
// `mob-knowledge-cache.json` after each wiki lookup: an entry whose `data.notFound` is true is the
// wiki saying "no such page", any other entry is a page it had. Those modules' only readers fetch
// on a miss, which a diagnostics tab must never cause, so this reads the JSON itself. Pure over the
// parsed file, so a test can hand it a fixture; the file read and the key folds live beside the
// handler in ipc/gapVerdicts.ts.
//
// A negative here is read regardless of its age: the lookups let a `notFound` expire so the wiki
// is asked again later, but for "what must someone do" the last answer the wiki gave stands.

import type { GapVerdict, GapVerdicts } from '../shared/gaps'
import { lookupVerdict, type LookupAnswer } from '../shared/gapExistingPage'

/** The two cache files' shape, as much of it as a verdict needs. */
export interface KnowledgeCacheFile {
  version?: number
  entries?: Record<string, { data?: LookupAnswer }>
}

/**
 * One verdict per name. A file that is absent, empty or written by another cache version — the
 * same rule the lookups' readers apply — answers `unchecked` for every name.
 */
export function verdictsFrom(
  file: KnowledgeCacheFile | null,
  version: number,
  names: readonly string[],
  keyOf: (name: string) => string
): GapVerdicts {
  const entries = file !== null && file.version === version && file.entries !== undefined ? file.entries : null
  const out: GapVerdicts = {}
  for (const name of names) {
    const entry = entries?.[keyOf(name)]
    let verdict: GapVerdict = 'unchecked'
    // A lookup made while the wiki was unreachable is no answer at all (review 2026-10-19).
    // A page under other capitals, or one of free text, is named (gapExistingPage.ts, owner 2026-10-22).
    if (entry !== undefined && entry.data?.offline !== true) verdict = lookupVerdict(name, entry.data ?? {})
    out[name] = verdict
  }
  return out
}
