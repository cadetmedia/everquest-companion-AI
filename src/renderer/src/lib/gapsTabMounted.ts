// gapsTabMounted — is the Gaps tab on screen in this window? The Wiki Gaps overlay is fed by ONE
// copy of the Gaps pipeline at a time (owner, 2026-10-20; a tester's app was already struggling):
// the tab's own while it is mounted, the headless publisher's (unreleasedGaps.tsx) while it is not.
// The tab says so here; the publisher's gate reads it. A count rather than a flag, so StrictMode's
// mount, unmount, mount ends where it started.
//
// In lib/ rather than features/gaps/ because the gate reads it in every build, and nothing under
// features/gaps/ may be imported outside the UNRELEASED strip.

import { useEffect, useSyncExternalStore } from 'react'

let mounted = 0
const listeners = new Set<() => void>()

function notify(): void {
  for (const l of [...listeners]) l()
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The Gaps tab calls this: while it is mounted, it feeds the overlay itself. */
export function useMarkGapsTabMounted(): void {
  useEffect(() => {
    mounted += 1
    notify()
    return () => {
      mounted -= 1
      notify()
    }
  }, [])
}

/** Whether the Gaps tab is mounted in this window. */
export function useGapsTabMounted(): boolean {
  return useSyncExternalStore(subscribe, () => mounted > 0)
}
