/**
 * checkRustFactoring.mts — THE ENGINE'S FACTORING RATCHET (JOS-523). `npm run check:rust-factoring`.
 *
 * The TypeScript half of this tree has had hard factoring limits since 2026-08-03 — complexity 12,
 * 400 code lines per file, 100 per function — enforced by ESLint and frozen at today's debt by
 * `eslint.ratchet.mjs`. The engine had nothing playing that role: stock clippy has no lint that can
 * express a FILE length, and every lint that comes close is allow-by-default with an in-source
 * `#[allow]` as its only escape hatch. So the gate is this script, and the debt register is
 * `engine/factoring-baseline.json`.
 *
 * SAME NUMBERS, SAME COUNTING. The bars are `eslint.config.mjs`'s FACTORING_RULES verbatim — read
 * that header for why each one is what it is. How they are counted on Rust is documented in
 * `scripts/rustFactoring.mts`; the one-line version is that comments and blanks never count, so the
 * comment-pruning waves cannot move a single number here.
 *
 * ── A CEILING WITH HEADROOM (fork owner ruling, 2026-10-17) ──────────────────────────────────
 *
 *   * A NEW violation is red, and so is a recorded one that grew more than HEADROOM (10%) past its
 *     recorded number. Growth inside that room is green: a hard line count was forcing splits and
 *     comment cuts that bought nothing.
 *   * A violation that SHRANK or went away is reported and stays GREEN. The recorded number is a
 *     ceiling, not a claim to keep rewriting smaller; `--write` still records a shrink if wanted.
 *   * `--write` REFUSES while anything is new or grown. Widening the register is the integrator's
 *     call and is made by editing the JSON by hand, never by re-running a tool until it is green.
 *   * `--seed` rewrites the register wholesale, growth and all. It is the twin of `npm run
 *     lint:ratchet` and carries the same warning: it exists to SEED the file and to re-baseline
 *     after a deliberate bar change. Running it on red code silently widens the register and
 *     defeats the entire design. It is deliberately not an npm script — you have to mean it.
 *   * The engine's refactor wave (JOS-525) empties this file. Entries are deleted by making them
 *     untrue, not by deleting the line.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { measureRustSource } from './rustFactoring.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const ENGINE_DIR = join(ROOT, 'engine')
export const BASELINE_PATH = join(ENGINE_DIR, 'factoring-baseline.json')

/** Verbatim from `eslint.config.mjs`'s FACTORING_RULES. Changing one means re-running that file's
 *  measurement (`npm run lint:measure`) on BOTH languages, not editing a number here. */
export const BARS = { 'file-lines': 440, 'function-lines': 110, complexity: 13 } as const

/** How far past its recorded number a baselined violation may grow before it is red. */
export const HEADROOM = 0.1

/** A recorded value's ceiling: the number plus HEADROOM, rounded up. */
export const ceilingOf = (recorded: number): number => Math.ceil(recorded * (1 + HEADROOM))
export type Metric = keyof typeof BARS

export interface Violation {
  /** Slash-separated and relative to `engine/`, so the register reads the same on every machine. */
  file: string
  metric: Metric
  /** The qualified function name, or `''` for the whole-file metric. */
  name: string
  value: number
}

export interface Baseline {
  bars: Record<string, number>
  entries: Violation[]
}

export interface Comparison {
  added: Violation[]
  grown: { now: Violation; was: number }[]
  stale: Violation[]
  unreadable: string[]
}

const keyOf = (v: Pick<Violation, 'file' | 'metric' | 'name'>): string =>
  `${v.file}\u0000${v.metric}\u0000${v.name}`

const order = (a: Violation, b: Violation): number =>
  a.file.localeCompare(b.file) || a.metric.localeCompare(b.metric) || a.name.localeCompare(b.name)

// ── what gets measured ─────────────────────────────────────────────────────────────────────────

/**
 * Every `.rs` the ratchet has an opinion about. `target` is cargo's; a `tests` directory is a
 * crate's integration suite; `generated.rs` is written by `npm run gen:protocol` and nobody edits
 * it. The rest is code a person wrote.
 */
export function rustSources(engineDir: string): string[] {
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory() && entry.name !== 'target' && entry.name !== 'tests') walk(full)
      else if (entry.isFile() && entry.name.endsWith('.rs') && entry.name !== 'generated.rs')
        found.push(full)
    }
  }
  walk(join(engineDir, 'crates'))
  return found.sort((a, b) => a.localeCompare(b))
}

/** Measure the tree. `unreadable` names files the lexer lost the thread on — see RustFileMetrics. */
export function measureTree(engineDir: string): { violations: Violation[]; unreadable: string[] } {
  const violations: Violation[] = []
  const unreadable: string[] = []
  for (const path of rustSources(engineDir)) {
    const file = relative(engineDir, path).split('\\').join('/')
    const m = measureRustSource(readFileSync(path, 'utf8'))
    if (m.unbalanced) unreadable.push(file)
    if (m.lines > BARS['file-lines'])
      violations.push({ file, metric: 'file-lines', name: '', value: m.lines })
    for (const fn of m.functions) {
      if (fn.lines > BARS['function-lines'])
        violations.push({ file, metric: 'function-lines', name: fn.name, value: fn.lines })
      if (fn.complexity > BARS.complexity)
        violations.push({ file, metric: 'complexity', name: fn.name, value: fn.complexity })
    }
  }
  return { violations: violations.sort(order), unreadable }
}

// ── the ratchet ────────────────────────────────────────────────────────────────────────────────

export function compare(now: Violation[], baseline: Baseline, unreadable: string[]): Comparison {
  const before = new Map(baseline.entries.map((e) => [keyOf(e), e]))
  const out: Comparison = { added: [], grown: [], stale: [], unreadable }
  const live = new Set<string>()
  for (const v of now) {
    live.add(keyOf(v))
    const prev = before.get(keyOf(v))
    if (prev === undefined) out.added.push(v)
    else if (v.value > ceilingOf(prev.value)) out.grown.push({ now: v, was: prev.value })
    else if (v.value < prev.value) out.stale.push(prev)
  }
  for (const e of baseline.entries) if (!live.has(keyOf(e))) out.stale.push(e)
  return out
}

/** Green unless something is new, grew past its headroom, or could not be read. A shrink is fine. */
export const isClean = (c: Comparison): boolean =>
  c.added.length === 0 && c.grown.length === 0 && c.unreadable.length === 0

export function readBaseline(path: string): Baseline {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  const b = parsed as Baseline
  // A register measured against a LOWER bar is still a true list of ceilings under a raised one;
  // only a stricter bar than the register's would hide violations it never recorded.
  for (const [metric, bar] of Object.entries(BARS))
    if (b.bars[metric] > bar)
      throw new Error(
        `${path} was measured against ${metric} ${String(b.bars[metric])}, the bar is now ` +
          `${String(bar)}. A bar change means re-baselining the whole register on purpose.`
      )
  return b
}

const PREAMBLE = [
  'GENERATED debt register — engine factoring ratchet (JOS-523). Each value is a ceiling, with 10% headroom.',
  'Every entry is a file or function that broke a bar when recorded. A shrink stays green;',
  '`npm run check:rust-factoring -- --write` records one if wanted.',
  'Adding or widening an entry is the integrator call, made by hand. Never by re-running a tool.',
]

export function writeBaseline(path: string, violations: Violation[]): void {
  const body = {
    $comment: PREAMBLE,
    bars: { ...BARS },
    entries: violations,
  }
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, 'utf8')
}

// ── the report ─────────────────────────────────────────────────────────────────────────────────

const label = (v: Violation): string =>
  v.name === '' ? `${v.file} (whole file)` : `${v.file} — ${v.name}`

function report(c: Comparison): string[] {
  const lines: string[] = []
  for (const f of c.unreadable) lines.push(`  UNREADABLE  ${f} — braces never balanced`)
  for (const v of c.added) lines.push(`  NEW    ${v.metric} ${String(v.value)}  ${label(v)}`)
  for (const g of c.grown)
    lines.push(
      `  GREW   ${g.now.metric} ${String(g.was)} → ${String(g.now.value)}  ${label(g.now)}`
    )
  for (const v of c.stale) lines.push(`  SHRANK ${v.metric} was ${String(v.value)}  ${label(v)} (fine)`)
  return lines
}

function main(): void {
  const write = process.argv.includes('--write')
  const { violations, unreadable } = measureTree(ENGINE_DIR)
  if (process.argv.includes('--seed')) {
    writeBaseline(BASELINE_PATH, violations)
    console.log(`rust factoring: SEEDED with ${String(violations.length)} violations.`)
    return
  }
  const comparison = compare(violations, readBaseline(BASELINE_PATH), unreadable)
  console.log(report(comparison).join('\n'))
  if (isClean(comparison) && !write) {
    console.log(
      `rust factoring: green — ${String(violations.length)} baselined violations, none new, none grown past headroom.`
    )
    return
  }
  const blocked = comparison.added.length + comparison.grown.length + comparison.unreadable.length
  if (write && blocked === 0) {
    writeBaseline(BASELINE_PATH, violations)
    console.log(`rust factoring: register rewritten with ${String(violations.length)} violations.`)
    return
  }
  console.log(
    write
      ? '\nrust factoring: REFUSING to write — this run has new or grown violations.'
      : '\nrust factoring: RED — a new violation, or growth past the 10% headroom.'
  )
  process.exitCode = 1
}

if ((process.argv[1] ?? '').endsWith('checkRustFactoring.mts')) main()
