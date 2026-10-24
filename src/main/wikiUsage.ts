// wikiUsage.ts — every wiki request the app itself sends, counted (owner, 2026-10-23: "track how many
// API calls we make to the eqlwiki ... Tie any and all API calls into that"). The scrapers' runs go
// to the repo's ledger (scripts/sources/wikiLedger.ts); the app runs on players' machines, so its
// requests go to a per-machine ledger in userData, `wiki-requests.jsonl`, one line a request, kept
// under MAX_BYTES by rotating to `.1`, and the session's total is logged at quit. Electron-free.
//
// WIKI_UA is the one identity every app request to a wiki sends: it names the fork (owner, same day:
// "make sure all our api calls always indicate they are coming from our github project").

import { appendFileSync, renameSync, statSync } from 'fs'

export const WIKI_UA = 'everquest-companion/0.1 (+https://github.com/kaltinril/everquest-companion)'

/** The ledger's size before it rotates to `<file>.1` (one older copy is kept). */
const MAX_BYTES = 2 * 1024 * 1024

export interface AppWikiCall {
  /** Which part of the app asked: `item lookup`, `mob lookup`, `quest copy`, `images`. */
  feature: string
  /** `parse/wikitext`, `query/search`, `file`. */
  kind: string
  url: string
  /** null: the network failed before an answer. */
  status: number | null
  bytes: number
  ms: number
}

let file: string | null = null
const session = { requests: 0, bytes: 0, errors: 0, byFeature: new Map<string, number>() }

/** Where this process keeps its ledger; null keeps counts in memory only (tests, before startup). */
export function setWikiUsageFile(path: string | null): void {
  file = path
}

/** `parse/wikitext` from a request's parameters. */
export function wikiKindOf(params: Record<string, string>): string {
  const sub = params.list ?? params.prop ?? params.meta
  return sub ? `${params.action ?? '?'}/${sub}` : (params.action ?? '?')
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return '?'
  }
}

function append(line: string): void {
  if (file === null) return
  try {
    if ((statSync(file, { throwIfNoEntry: false })?.size ?? 0) > MAX_BYTES) renameSync(file, `${file}.1`)
    appendFileSync(file, line + '\n', 'utf8')
  } catch {
    // A ledger that cannot be written must never break a lookup.
  }
}

/** One request, counted for the session and written to this machine's ledger. */
export function recordAppWikiCall(c: AppWikiCall): void {
  const error = c.status === null || c.status >= 400
  session.requests++
  session.bytes += c.bytes
  session.errors += error ? 1 : 0
  session.byFeature.set(c.feature, (session.byFeature.get(c.feature) ?? 0) + 1)
  const { url, ...rest } = c
  append(JSON.stringify({ at: new Date().toISOString(), host: hostOf(url), ...rest, error }))
}

/** The session's wiki requests in one line, or null when there were none. */
export function wikiUsageSummary(): string | null {
  if (session.requests === 0) return null
  const by = [...session.byFeature].map(([f, n]) => `${f} ${n}`).join(', ')
  const kb = (session.bytes / 1024).toFixed(1)
  return `[everquest-companion] wiki requests this session: ${session.requests} (${kb} KB${session.errors ? `, ${session.errors} errors` : ''}): ${by}`
}

/** Tests: forget the session. */
export function resetWikiUsage(): void {
  session.requests = 0
  session.bytes = 0
  session.errors = 0
  session.byFeature.clear()
}
