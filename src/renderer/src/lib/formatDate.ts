// Central date/time formatting (Task #44). ALL timestamp rendering routes through
// these so the app displays LOCAL time consistently — the game log timestamps parse
// to a LOCAL epoch (parseEqTimestamp → Date.parse('Aug 01 2026 13:00:28') with no
// zone = local), and every formatter here formats WITHOUT an explicit `timeZone`, so
// the runtime's zone (e.g. America/Los_Angeles) is used end to end.
//
// Do NOT introduce toISOString / toUTCString / getUTC* for display, and do NOT bucket
// days by epoch math (Math.floor(ts / 86400000) is a UTC-day boundary — off by the
// local offset near midnight). Use `localDayKey` to group by LOCAL calendar day.

/** `ts` is epoch millis. A falsy/0 ts renders as empty (unknown timestamp). */

/**
 * Date only, local: e.g. "8/1/2026". `opts` is additive — omitted, the output is exactly the
 * runtime's default short date it always was; the weekly-lockout view passes
 * `{ weekday: 'short', month: 'numeric', day: 'numeric' }` because inside a seven-day window the
 * day of the week is the useful referent and the year is noise.
 */
export function formatDate(ts: number, opts?: Intl.DateTimeFormatOptions): string {
  if (!ts) return ''
  const d = new Date(ts)
  return cachedFormat('date', d, opts ?? {}) ?? d.toLocaleDateString(undefined, opts)
}

/**
 * A CALENDAR date — `YYYY-MM-DD` with no instant behind it — rendered the same way as every
 * other date in the app (JOS-73's release dates are the caller).
 *
 * It exists because `new Date('2026-08-07')` is parsed as UTC MIDNIGHT by the spec, so feeding
 * an ISO date string through `formatDate` renders 8/6/2026 for everybody west of Greenwich. A
 * release shipped on the 7th did not ship on the 6th in California. The parts are read out and
 * handed to the LOCAL constructor instead, which is the same "never UTC for display" rule this
 * file's header states, applied to a value that is a day rather than a moment.
 *
 * Anything that is not `YYYY-MM-DD` comes back verbatim — a malformed date should read oddly,
 * not silently become some other day.
 */
export function formatCalendarDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString()
}

/** Time only, local, 24h: e.g. "13:00:28". */
export function formatTime(ts: number, opts?: Intl.DateTimeFormatOptions): string {
  if (!ts) return ''
  const d = new Date(ts)
  const o: Intl.DateTimeFormatOptions = { hour12: false, ...opts }
  return cachedFormat('time', d, o) ?? d.toLocaleTimeString([], o)
}

/** Date + time, local: e.g. "8/1/2026, 1:00:28 PM" (or per opts). */
export function formatDateTime(ts: number, opts?: Intl.DateTimeFormatOptions): string {
  if (!ts) return ''
  const d = new Date(ts)
  return cachedFormat('any', d, opts ?? {}) ?? d.toLocaleString([], opts)
}

// ── The formatter cache (perf audit, 2026-10-20) ─────────────────────────────────────
//
// WHY. `toLocaleTimeString(locales, options)` and its siblings build a brand-new
// Intl.DateTimeFormat on EVERY call whenever either argument is given (V8 keeps a cached
// formatter only for the no-argument form), and building one costs tens of microseconds of
// ICU setup. A list stamps a time on every row, so a tab switch paid it hundreds of times:
// the Loot tab's grouped rows spent ~100 ms of a ~700 ms switch in `formatDateTime` alone,
// Combat's processing log ~50 ms, Overview 13-41 ms. A formatter is reusable, so each
// distinct (method, options) pair now builds one, once, and formats with it after that.
//
// THE OUTPUT IS IDENTICAL, and that is the whole contract; tests/formatDate.test.mts pins
// it against the toLocale* calls this replaced. Three things make it so:
//   1. The locale is the runtime default in both forms: `[]` and `undefined` both mean it.
//   2. The toLocale* methods fill in DEFAULT components when the caller names none
//      (ECMA-402 ToDateTimeOptions: a date method adds year/month/day, a time method
//      hour/minute/second, toLocaleString both), while the Intl.DateTimeFormat constructor
//      would add the DATE ones whatever the method. `withDefaults` applies the method's rule
//      before the constructor sees the options, so it never has to apply its own.
//   3. A formatter FIXES its time zone when it is built, while a toLocale* call reads the
//      current one. The key carries the date's local offset, so a machine whose zone
//      changes while the app is open gets fresh formatters for the new offset (a DST change
//      only costs one more entry). Anything this path does not model (an invalid date, which
//      the toLocale* calls render as "Invalid Date" but `format` throws on; `dateStyle` /
//      `timeStyle`, whose method-specific errors are not reproduced) takes the original call.

/** Which toLocale* method a formatter stands in for: date, time, or both (toLocaleString). */
type FormatKind = 'date' | 'time' | 'any'

/** The fields that count as "the caller named a component", per ECMA-402 ToDateTimeOptions. */
const DATE_FIELDS = ['weekday', 'year', 'month', 'day']
const TIME_FIELDS = ['dayPeriod', 'hour', 'minute', 'second', 'fractionalSecondDigits']

/** A safety valve, not a tuning knob: callers pass literal options, so a handful ever exist. */
const MAX_FORMATTERS = 64
const formatters = new Map<string, Intl.DateTimeFormat>()

function namesAny(opts: Intl.DateTimeFormatOptions, fields: string[]): boolean {
  const o = opts as Record<string, unknown>
  return fields.some((f) => o[f] !== undefined)
}

/** The options the toLocale* method would have handed its formatter (point 2 above). */
function withDefaults(kind: FormatKind, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  const named =
    (kind !== 'time' && namesAny(opts, DATE_FIELDS)) || (kind !== 'date' && namesAny(opts, TIME_FIELDS))
  if (named) return opts
  const date = kind === 'time' ? {} : ({ year: 'numeric', month: 'numeric', day: 'numeric' } as const)
  const time = kind === 'date' ? {} : ({ hour: 'numeric', minute: 'numeric', second: 'numeric' } as const)
  return { ...opts, ...date, ...time }
}

/** `d` formatted by a cached formatter, or null when the caller must take the original call. */
function cachedFormat(kind: FormatKind, d: Date, opts: Intl.DateTimeFormatOptions): string | null {
  if (Number.isNaN(d.getTime()) || opts.dateStyle !== undefined || opts.timeStyle !== undefined) return null
  const key = `${kind}|${String(d.getTimezoneOffset())}|${JSON.stringify(opts)}`
  let f = formatters.get(key)
  if (f === undefined) {
    if (formatters.size >= MAX_FORMATTERS) formatters.clear()
    f = new Intl.DateTimeFormat(undefined, withDefaults(kind, opts))
    formatters.set(key, f)
  }
  return f.format(d)
}

/**
 * Coarse, human relative age: "just now" / "12m ago" / "3h ago" / "2d ago".
 * `ts` 0/undefined ⇒ '' (unknown). Deliberately COARSE — this is ambient text
 * (the left-nav update chip's "checked …" line), not a precise timestamp; the
 * exact clock time lives in Preferences via formatDateTime. `now` is injectable
 * so the mapping is testable without faking the clock.
 */
export function formatAge(ts: number | undefined, now: number = Date.now()): string {
  if (!ts) return ''
  const secs = Math.max(0, (now - ts) / 1000)
  if (secs < 90) return 'just now'
  const mins = secs / 60
  if (mins < 90) return `${Math.round(mins)}m ago`
  const hrs = mins / 60
  if (hrs < 36) return `${Math.round(hrs)}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

/**
 * A stable per-LOCAL-day grouping key (YYYY-MM-DD in the local zone). Use this to
 * bucket events by calendar day instead of `Math.floor(ts / 86400000)`, which buckets
 * by the UTC day and therefore splits/merges the wrong events across local midnight.
 */
export function localDayKey(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
