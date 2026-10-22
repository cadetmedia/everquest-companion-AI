// ============================================================================
// logArchiveFightSearch.test.mts — archived fight search, pinned to the engine's (log archive, 4.8).
// ============================================================================
//
// The engine ranks the live log's fights (`engine/crates/engined/src/search.rs`); the archived ones
// are ranked app-side by `shared/logArchive/searchFights.ts`. Two copies of one rule drift unless
// something holds them together, so this suite reads `search.rs`'s OWN test fixtures and expected
// answers out of the Rust source and runs every one through the TypeScript copy. `cargo test` holds
// the Rust side to the same fixtures. An edit to either side that the other does not share fails
// here, and a fixture this parser can no longer read fails the floor below rather than passing
// quietly.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FightSearchResult, SegmentSummary } from '../src/shared/combat'
import { editBudget, MIN_FUZZY_LEN, SCORE_EXACT, SCORE_FUZZY, SCORE_PREFIX, SCORE_SUBSTRING } from '../src/shared/fuzzy'
import { DEFAULT_FIGHT_HITS, searchSummaries, withArchivedHits } from '../src/shared/logArchive/searchFights'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENGINED = join(ROOT, 'engine', 'crates', 'engined', 'src')
const SEARCH_RS = readFileSync(join(ENGINED, 'search.rs'), 'utf8').replace(/\r\n/g, '\n')
const OPS_RS = readFileSync(join(ENGINED, 'ops.rs'), 'utf8')

/** A Rust string literal's body, unescaped (the fixtures use `\t` and nothing stranger). */
function unescape(s: string): string {
  return s.replace(/\\(.)/g, (_m, c: string) => (c === 't' ? '\t' : c === 'n' ? '\n' : c))
}

const STR = '"((?:[^"\\\\]|\\\\.)*)"'

function summary(id: string, name: string, zone: string, startTs: number): SegmentSummary {
  return { id, kind: 'fight', name, zone, startTs, durationSec: 0, total: 0, dps: 0, activeSec: 0, activeDps: 0, active: false, enemyHealTotal: 0 }
}

/** One `#[test]` body's corpus: its `fight(...)` calls, and the one `(0..n).map(...)` generator. */
function corpusOf(body: string): SegmentSummary[] {
  const out: SegmentSummary[] = []
  const call = new RegExp(`fight\\(${STR}, ${STR}, ${STR}, (-?\\d+)\\)`, 'g')
  for (const m of body.matchAll(call)) out.push(summary(unescape(m[1]), unescape(m[2]), unescape(m[3]), Number(m[4])))
  const gen = new RegExp(`\\(0\\.\\.(\\d+)\\)\\s*\\.map\\(\\|i\\| fight\\(&format!\\("(\\w*)\\{i\\}"\\), ${STR}, ${STR}, i64::from\\(i\\)\\)\\)`)
  const g = gen.exec(body)
  if (g) for (let i = 0; i < Number(g[1]); i++) out.push(summary(`${g[2]}${i}`, unescape(g[3]), unescape(g[4]), i))
  return out
}

interface Case {
  test: string
  corpus: SegmentSummary[]
  query: string
  limit: number
  ids: string[]
}

function idList(s: string): string[] {
  return [...s.matchAll(new RegExp(STR, 'g'))].map((m) => unescape(m[1]))
}

/** Every `search(&corpus, q, n)` whose answer the Rust test states, with that answer. */
function casesOf(name: string, body: string): Case[] {
  const corpus = corpusOf(body)
  const cases: Case[] = []
  const direct = new RegExp(`names\\(&search\\(&corpus, ${STR}, (\\d+)\\)\\),\\s*\\[([^\\]]*)\\]`, 'g')
  for (const m of body.matchAll(direct)) cases.push({ test: name, corpus, query: unescape(m[1]), limit: Number(m[2]), ids: idList(m[3]) })
  const empty = new RegExp(`search\\(&corpus, ${STR}, (\\d+)\\)\\.is_empty\\(\\)`, 'g')
  for (const m of body.matchAll(empty)) cases.push({ test: name, corpus, query: unescape(m[1]), limit: Number(m[2]), ids: [] })
  const bound = new RegExp(`let hits = search\\(&corpus, ${STR}, (\\d+)\\);[\\s\\S]*?names\\(&hits\\),\\s*\\[([^\\]]*)\\]`)
  const b = bound.exec(body)
  if (b) cases.push({ test: name, corpus, query: unescape(b[1]), limit: Number(b[2]), ids: idList(b[3]) })
  return cases
}

function rustCases(): Case[] {
  const tests = SEARCH_RS.slice(SEARCH_RS.indexOf('#[cfg(test)]')).split('#[test]').slice(1)
  return tests.flatMap((t) => {
    const name = /fn (\w+)/.exec(t)?.[1] ?? '?'
    return casesOf(name, t)
  })
}

test('drift: every search.rs fixture ranks the same through the TypeScript copy', () => {
  const cases = rustCases()
  // The floor: search.rs states 9 answers today. A parser that silently reads fewer is a pass that
  // checks nothing.
  assert.ok(cases.length >= 9, `read only ${cases.length} cases out of search.rs`)
  for (const c of cases) {
    const got = searchSummaries(c.corpus, c.query, c.limit).map((h) => h.summary.id)
    assert.deepEqual(got, c.ids, `${c.test}: "${c.query}"`)
  }
})

function rustConst(name: string): number {
  const m = new RegExp(`const ${name}: \\w+ = ([\\d.]+);`).exec(SEARCH_RS)
  assert.ok(m, `search.rs no longer states ${name}`)
  return Number(m[1])
}

test('drift: the scores, the typo floor and the edit budget are the same numbers on both sides', () => {
  assert.equal(rustConst('SCORE_EXACT'), SCORE_EXACT)
  assert.equal(rustConst('SCORE_PREFIX'), SCORE_PREFIX)
  assert.equal(rustConst('SCORE_SUBSTRING'), SCORE_SUBSTRING)
  assert.equal(rustConst('SCORE_FUZZY'), SCORE_FUZZY)
  assert.equal(rustConst('MIN_FUZZY_LEN'), MIN_FUZZY_LEN)
  const budget = /fn edit_budget[\s\S]*?0\.\.=(\d+) => 0,\s*3\.\.=(\d+) => 1,\s*_ => 2,/.exec(SEARCH_RS)
  assert.ok(budget, 'search.rs edit_budget changed shape')
  for (let n = 0; n < 12; n++) {
    const rust = n <= Number(budget[1]) ? 0 : n <= Number(budget[2]) ? 1 : 2
    assert.equal(editBudget(n), rust, `budget at ${n}`)
  }
  const hits = /const DEFAULT_FIGHT_HITS: i64 = (\d+);/.exec(OPS_RS)
  assert.equal(Number(hits?.[1]), DEFAULT_FIGHT_HITS)
})

// ── the join ────────────────────────────────────────────────────────────────────────────────────

const LIVE: FightSearchResult = {
  hits: [{ summary: summary('e2', 'a sand giant', 'Oasis', 5000), score: 1 }],
  corpus: 3
}
const ROWS = [
  summary('arch:s:e1', 'a sand giant', 'Oasis', 100),
  summary('arch:s:e2', 'a sand goblin', 'Oasis', 200),
  summary('arch:s:e3', 'a bat', 'Innothule Swamp', 300)
]

test('join: nothing archived, the same object comes back', () => {
  assert.equal(withArchivedHits(LIVE, [], 'sand giant', 10), LIVE)
})

test('join: one ranking under one limit, and the archived fights counted in the corpus', () => {
  const out = withArchivedHits(LIVE, ROWS, 'sand giant', 10)
  assert.deepEqual(out.hits.map((h) => h.summary.id), ['e2', 'arch:s:e1'])
  assert.equal(out.corpus, 6)
  const one = withArchivedHits(LIVE, ROWS, 'sand', 2)
  assert.deepEqual(one.hits.map((h) => h.summary.id), ['e2', 'arch:s:e2'], 'same score, so newer first')
  const none = withArchivedHits({ hits: [], corpus: 3 }, ROWS, '  ', undefined)
  assert.deepEqual(none, { hits: [], corpus: 6 }, 'an empty query still counts what it would search')
})

test('join: no limit is the engine’s default limit', () => {
  const many = Array.from({ length: 80 }, (_, i) => summary(`arch:s:e${i}`, 'a bat', 'Oasis', i))
  assert.equal(withArchivedHits({ hits: [], corpus: 0 }, many, 'bat', undefined).hits.length, DEFAULT_FIGHT_HITS)
})
