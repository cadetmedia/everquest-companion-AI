// iconTokenRepair — runs shared/iconTokenCleanup.ts over this viewer's kept Gaps data once (owner,
// 2026-10-24: "can you clean up my bad data for the 1's?"), on the first load after the fix, then
// never again (a flag in localStorage). A blocked store is left as it is.

import { cleanCaptured, cleanEdits, cleanShots } from '@shared/iconTokenCleanup'
import { capturedItemsOf } from '@shared/gapExtraItems'
import { CAPTURED_ITEMS_KEY } from './capturedItemsStore'
import { SHOTS_KEY } from './itemShotsStore'

const DONE_KEY = 'eq.gaps.iconTokenRepair'
const EDITS_KEY = 'eq.gaps.edits'

function rewrite(key: string, fix: (parsed: unknown) => unknown): void {
  const raw = localStorage.getItem(key)
  if (raw === null) return
  const next = JSON.stringify(fix(JSON.parse(raw)))
  if (next !== raw) localStorage.setItem(key, next)
}

const asRecord = <T>(v: unknown): Record<string, T> => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, T>) : {})

export function repairIconTokens(): void {
  try {
    if (localStorage.getItem(DONE_KEY) !== null) return
    rewrite(SHOTS_KEY, (v) => cleanShots(asRecord<{ tier?: number; at: string }>(v)))
    rewrite(CAPTURED_ITEMS_KEY, (v) => cleanCaptured(capturedItemsOf(v)))
    rewrite(EDITS_KEY, (v) => cleanEdits(asRecord(v)))
    localStorage.setItem(DONE_KEY, new Date().toISOString())
  } catch {
    // A store that cannot be read or written keeps what it has.
  }
}

repairIconTokens()
