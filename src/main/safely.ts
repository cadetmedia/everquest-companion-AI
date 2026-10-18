// safely.ts — run one reading, or answer with its fallback.
//
// Shared by the three report builders that assemble many independent readings into one record:
// feedback/perf.ts (the perf block), telemetry/liveRiders.ts (the session riders) and
// telemetry/setupSnapshot.ts (the setup snapshot). The lambda-per-reading shape is what keeps ONE
// failing driver call or question from costing every other reading its place in the record.
// Imports nothing.

/** Run a reading, or answer with the fallback if it throws. */
export function safely<T>(read: () => T, fallback: T): T {
  try {
    return read()
  } catch {
    return fallback
  }
}
