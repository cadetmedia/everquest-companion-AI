// wiki-usage.mts — the audit of docs/community/wiki-usage/ledger.jsonl (owner, 2026-10-23: "i want to
// audit and make sure we are not using it more than we need to"): requests and bytes in all, by
// script, by month and by kind of request.
//
//   npx tsx scripts/wiki-usage.mts [ledger path]

import { existsSync, readFileSync } from 'fs'
import { LEDGER_PATH, type WikiRunLine } from './sources/wikiLedger'

const path = process.argv[2] ?? LEDGER_PATH
if (!existsSync(path)) {
  console.log(`No ledger at ${path}: no wiki request has been recorded yet.`)
  process.exit(0)
}

type Line = WikiRunLine & { backfilled?: boolean }
const lines: Line[] = readFileSync(path, 'utf8')
  .split('\n')
  .filter((l) => l.trim() !== '')
  .map((l) => JSON.parse(l) as Line)

interface Tally {
  runs: number
  requests: number
  bytes: number
  errors: number
}
const tally = (): Tally => ({ runs: 0, requests: 0, bytes: 0, errors: 0 })
const add = (t: Tally, l: Line): void => {
  t.runs++
  t.requests += l.requests
  t.bytes += l.bytes
  t.errors += l.errors
}
const mb = (n: number): string => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`)

const all = tally()
const byScript = new Map<string, Tally>()
const byMonth = new Map<string, Tally>()
const byKind = new Map<string, { n: number; bytes: number }>()
for (const l of lines) {
  add(all, l)
  const s = byScript.get(l.script) ?? tally()
  add(s, l)
  byScript.set(l.script, s)
  const m = byMonth.get(l.at.slice(0, 7)) ?? tally()
  add(m, l)
  byMonth.set(l.at.slice(0, 7), m)
  for (const [k, v] of Object.entries(l.byKind)) {
    const t = byKind.get(k) ?? { n: 0, bytes: 0 }
    t.n += v.n
    t.bytes += v.bytes
    byKind.set(k, t)
  }
}

const row = (name: string, t: Tally): string =>
  `  ${name.padEnd(28)} ${String(t.runs).padStart(5)} runs ${String(t.requests).padStart(7)} requests ${mb(t.bytes).padStart(11)} ${t.errors ? `${t.errors} errors` : ''}`
console.log(`Wiki requests recorded: ${all.requests} in ${all.runs} runs, ${mb(all.bytes)}${all.errors ? `, ${all.errors} errors` : ''}`)
console.log(`  (${lines.filter((l) => l.backfilled).length} lines backfilled by hand; first ${lines[0]?.at ?? '-'}, last ${lines.at(-1)?.at ?? '-'})`)
console.log('\nBy script:')
for (const [k, t] of [...byScript].sort((a, b) => b[1].requests - a[1].requests)) console.log(row(k, t))
console.log('\nBy month:')
for (const [k, t] of [...byMonth].sort()) console.log(row(k, t))
console.log('\nBy kind of request:')
for (const [k, t] of [...byKind].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${k.padEnd(28)} ${String(t.n).padStart(7)} requests ${mb(t.bytes).padStart(11)}`)
