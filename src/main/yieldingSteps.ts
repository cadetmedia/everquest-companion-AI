// yieldingSteps.ts — run a long PURE build in slices, so the main process keeps answering while it
// works.
//
// THE MAIN PROCESS IS EVERY WINDOW'S IPC SERVER. A build that holds its one thread for 200 ms holds
// every `window.eq` call from the main window AND from every overlay for those 200 ms too. Measured
// on the first Gear visit (perf audit, 2026-10-20): 204 ms of main-loop lag, and a trivial
// `getOverlayState` issued meanwhile waited 281 ms — on a machine where the overlays sit over the
// game, that is a system-wide hitch.
//
// SO A LONG BUILDER IS WRITTEN AS A GENERATOR, and the two halves of "when do I stop" are split:
//
//   * the BUILDER says where it is SAFE to stop — every `yield` is a point at which all of its state
//     lives in its own locals and nothing half-written is visible to anyone;
//   * THIS MODULE says where it DOES stop. `runSteps` never does (the old synchronous answer, for
//     tests and any caller that needs the value now); `runStepsSliced` stops whenever a time budget
//     is spent and hands the thread back.
//
// THE ANSWER IS THE SAME OBJECT EITHER WAY. Slicing changes when the steps run, never which steps
// run or in what order, so a builder's result cannot depend on which runner drove it — and its tests
// can keep driving it synchronously.
//
// WHY `setImmediate` AND NOT `setTimeout`. A timer in the main process does not last what it says on
// Windows: it ends at the next 15.6 ms tick edge (AGENTS.md, toolchain gotchas), so a timer between
// slices would add up to a tick of pure idle per slice and stretch a 150 ms build into a second.
// `setImmediate` is not a pause at all, which is exactly what is wanted here: it lets whatever IPC and
// I/O queued up during the slice run, and then comes straight back.
//
// PURE AND ELECTRON-FREE, so `tests/yieldingSteps.test.mts` drives it directly.

/** A builder's steps: it yields nothing, and returns its answer when it is done. */
export type Steps<T> = Generator<undefined, T, undefined>

/**
 * How long one slice may hold the thread. Small enough that an IPC call queued behind a slice is
 * answered within about a frame; large enough that the hand-backs cost nothing measurable.
 */
export const SLICE_BUDGET_MS = 8

/** Run every step now, on this thread. The synchronous builder's exact answer. */
export function runSteps<T>(steps: Steps<T>): T {
  for (;;) {
    const r = steps.next()
    if (r.done === true) return r.value
  }
}

/**
 * Run the steps in slices of about `budgetMs`, handing the thread back between slices.
 *
 * A throw inside the builder rejects the promise; nothing is retried here — what a failed build is
 * worth is the caller's decision, exactly as it was when the builder threw synchronously.
 */
export function runStepsSliced<T>(
  steps: Steps<T>,
  budgetMs = SLICE_BUDGET_MS,
  now: () => number = () => performance.now()
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const slice = (): void => {
      try {
        const until = now() + budgetMs
        for (;;) {
          const r = steps.next()
          if (r.done === true) {
            resolve(r.value)
            return
          }
          if (now() >= until) break
        }
        setImmediate(slice)
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
    setImmediate(slice)
  })
}
