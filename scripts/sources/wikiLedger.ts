// wikiLedger.ts — every wiki request a script sends, counted, and one line per run in the repo's
// ledger (owner, 2026-10-23: "track how many API calls we make to the eqlwiki ... every new call ...
// store this in the repo ... i want to audit and make sure we are not using it more than we need to";
// "he doesn't care for what reason we hit the EQLWiki, so i want to track it all").
//
// wikiApi.ts and deltaApi.ts record each attempt here (retries included). The first record arms a
// process-exit hook that prints the run's summary and appends ONE JSON line to
// docs/community/wiki-usage/ledger.jsonl, so no scraper has to remember to call anything. Fork-only:
// it lives on scrape-delta-tool, never on the upstream PR branch wiki-scraper-fixes.
//
// `WIKI_LEDGER=<path>` writes elsewhere and `WIKI_LEDGER=off` writes nothing. Under node:test (a
// stubbed fetch, nothing sent) no line is written unless WIKI_LEDGER names a file.

import { appendFileSync, mkdirSync } from 'fs'
import { basename, dirname, join } from 'path'
import { fileURLToPath } from 'url'

/** The committed ledger, from this file's place in the repo. */
export const LEDGER_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'community', 'wiki-usage', 'ledger.jsonl')

/** One request as sent: what it asked, of whom, what came back. */
export interface WikiCall {
  /** `query/revisions`, `parse`, `query/recentchanges`, `file` for a download. */
  kind: string
  host: string
  /** null: the network failed before an answer. */
  status: number | null
  bytes: number
  ms: number
  /** a second or later attempt of the same request */
  retry: boolean
  /** an HTTP failure or an API error body */
  error: boolean
}

/** One run's line in the ledger. */
export interface WikiRunLine {
  at: string
  started: string
  script: string
  args: string
  reason?: string
  requests: number
  retries: number
  errors: number
  bytes: number
  ms: number
  hosts: Record<string, number>
  byKind: Record<string, { n: number; bytes: number }>
  statuses: Record<string, number>
}

const calls: WikiCall[] = []
const run = { started: '', script: '', reason: undefined as string | undefined }
let armed = false
let flushed = false

/** The run's own name and why it ran, for an entry point that is not the script file (wiki-call.mts). */
export function setWikiRun(script: string, reason?: string): void {
  run.script = script
  run.reason = reason
}

/** `query/revisions` from a request's parameters. */
export function kindOf(params: Record<string, string>): string {
  const sub = params.list ?? params.prop ?? params.meta
  return sub ? `${params.action ?? '?'}/${sub}` : (params.action ?? '?')
}

export const hostOf = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return '?'
  }
}

/** One attempt. Returns the record, so the caller can add the bytes once it has read the body. */
export function recordWikiCall(c: Omit<WikiCall, 'bytes'> & { bytes?: number }): WikiCall {
  const rec: WikiCall = { ...c, bytes: c.bytes ?? 0 }
  if (calls.length === 0) run.started ||= new Date().toISOString()
  calls.push(rec)
  if (!armed) {
    armed = true
    process.on('exit', () => {
      flushWikiLedger()
    })
  }
  return rec
}

/** The run so far, as the ledger line it would write. */
export function wikiRunSummary(now = new Date()): WikiRunLine {
  const line: WikiRunLine = {
    at: now.toISOString(),
    started: run.started || now.toISOString(),
    script: run.script || basename(process.argv[1] ?? '?'),
    args: process.argv.slice(2).join(' ').slice(0, 200),
    ...(run.reason ? { reason: run.reason } : {}),
    requests: calls.length,
    retries: 0,
    errors: 0,
    bytes: 0,
    ms: 0,
    hosts: {},
    byKind: {},
    statuses: {}
  }
  tally(line)
  return line
}

/** Every recorded call, into the line's counts. */
function tally(line: WikiRunLine): void {
  for (const c of calls) {
    line.retries += c.retry ? 1 : 0
    line.errors += c.error ? 1 : 0
    line.bytes += c.bytes
    line.ms += c.ms
    line.hosts[c.host] = (line.hosts[c.host] ?? 0) + 1
    const k = (line.byKind[c.kind] ??= { n: 0, bytes: 0 })
    k.n++
    k.bytes += c.bytes
    const s = String(c.status ?? 'network')
    line.statuses[s] = (line.statuses[s] ?? 0) + 1
  }
}

/** Where this process writes, or null for nowhere (off, or a test that named no file). */
export function ledgerTarget(env: NodeJS.ProcessEnv = process.env): string | null {
  const named = env.WIKI_LEDGER
  if (named === 'off') return null
  if (named) return named
  return env.NODE_TEST_CONTEXT ? null : LEDGER_PATH
}

const kb = (n: number): string => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`)

/** The summary a run prints. */
export function summaryText(l: WikiRunLine): string {
  const kinds = Object.entries(l.byKind)
    .sort((a, b) => b[1].n - a[1].n)
    .map(([k, v]) => `${k} ${v.n}`)
    .join(', ')
  return `Wiki requests this run: ${l.requests} (${l.retries} retries, ${l.errors} errors), ${kb(l.bytes)}; ${kinds}`
}

/** Print the run's summary and append its line, once. Nothing when the run sent nothing. */
export function flushWikiLedger(): WikiRunLine | null {
  if (flushed || calls.length === 0) return null
  flushed = true
  const line = wikiRunSummary()
  const target = ledgerTarget()
  if (target === null && process.env.NODE_TEST_CONTEXT) return line
  console.log(summaryText(line))
  if (target === null) return line
  try {
    mkdirSync(dirname(target), { recursive: true })
    appendFileSync(target, JSON.stringify(line) + '\n', 'utf8')
    console.log(`  (ledger: ${target})`)
  } catch (err) {
    console.warn(`wiki ledger: could not write ${target}: ${String(err)}`)
  }
  return line
}

/** Tests: forget everything recorded. */
export function resetWikiLedger(): void {
  calls.length = 0
  run.started = ''
  run.script = ''
  run.reason = undefined
  flushed = false
}
