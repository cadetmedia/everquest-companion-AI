// ============================================================================
// inFlight.ts — ONE ENGINE REQUEST PER QUESTION, HOWEVER MANY WINDOWS ASK IT AT ONCE.
// ============================================================================
//
// Every renderer read reaches the engine through this process's ONE connection (`readShim.ts`),
// and the engine answers asks one at a time, between its own read boundaries. The main window and
// every overlay hydrate off the same modules and poll the same meter, so they ask the SAME question
// in the same millisecond — a `module.snapshot` for `buffs` from four windows is four requests, four
// serializations of the same state and four replies on the same socket. On a slow PC that queue is
// what pushed the last of them past the shim's deadline, and a read that times out is a surface that
// flips to its loading state.
//
// THE RULE. While a read for a key is in flight, a second caller of that key does not send another:
// it awaits the promise the first one is holding. The entry is removed the moment that promise
// settles, so this is NOT A CACHE — nothing outlives the request that produced it, and the next call
// after an answer always asks again. A joiner is handed a read that began before it asked, which is
// at most one round trip older than its own would have been — the same staleness a reply already in
// flight on the socket has.
//
// WHAT IS SHARED IS THE OUTCOME, NEVER A FALLBACK. The caller decides what to share: `readShim.ts`
// shares the engine arm's `ServeOutcome` and lets every caller run its own fallback, so each still
// builds its own empty shape and each unserved read is still counted once in the dev-log tally.
//
// A KEY MUST NAME THE WHOLE QUESTION. Two calls that share a key are given one answer, so the key has
// to determine everything that shapes it — `stableKey` exists so that a params object spelled with
// its keys in another order is the same question rather than a second request.
//
// PURE, with no app imports: `tests/dataServerInFlight.test.mts` drives it with hand-made promises.

/** The coalescer. One per connection-shaped thing that should not ask the same question twice. */
export interface InFlight {
  /**
   * The in-flight promise for `key` if there is one, else `start()`'s, remembered until it settles.
   * A rejection is shared exactly as a resolution is: every caller of that key sees it.
   */
  share: <T>(key: string, start: () => Promise<T>) => Promise<T>
  /** How many keys are in flight right now. For the unit; nothing in the product reads it. */
  size: () => number
}

export function createInFlight(): InFlight {
  const pending = new Map<string, Promise<unknown>>()

  const share = <T>(key: string, start: () => Promise<T>): Promise<T> => {
    const joined = pending.get(key)
    if (joined !== undefined) return joined as Promise<T>
    // Started synchronously, inside an executor so a start that throws is a rejection like any
    // other rather than a throw out of `share`.
    const started = new Promise<T>((resolve) => {
      resolve(start())
    })
    // Removed on settle, and only if it is still this request's entry: the guard costs nothing
    // and keeps a later request for the same key from ever being deleted by an earlier one.
    const tracked = started.finally(() => {
      if (pending.get(key) === tracked) pending.delete(key)
    })
    pending.set(key, tracked)
    return tracked
  }

  return { share, size: () => pending.size }
}

/**
 * A JSON spelling of `value` that does not depend on the order its object keys were written in.
 *
 * Object keys are sorted at every depth and array order is kept, so `{ a: 1, b: 2 }` and
 * `{ b: 2, a: 1 }` are one key and `[1, 2]` and `[2, 1]` are two. An `undefined` property is
 * dropped, exactly as `JSON.stringify` drops it, which is also what the wire does with it.
 */
export function stableKey(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return v
    const record = v as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const k of Object.keys(record).sort()) sorted[k] = record[k]
    return sorted
  })
}
