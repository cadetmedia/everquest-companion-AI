// The EverQuest Legends Compendium (a community guide sheet by brutallstatic) as searchable
// passages for the AI tools. Electron-free: unit tests import it. The data is written by
// scripts/scrape-compendium.mts and refreshed with the weekly wiki delta.

import compendiumJson from '../data/compendium.json'

export interface CompendiumFile {
  title: string
  author: string
  /** The published sheet: what an answer cites. */
  url: string
  fetchedAt: string
  /** Each tab's non-empty rows, cells joined with ` | `. */
  tabs: { name: string; rows: string[] }[]
}

export interface CompendiumPassage {
  tab: string
  text: string
}

export interface CompendiumHit extends CompendiumPassage {
  score: number
}

export const COMPENDIUM_HIT_CAP = 4
const PASSAGE_CHARS = 1200
const HEADING_CHARS = 90

const STOP = new Set(
  'a an and are at be best by can do does for from get go how i in is it me my of on or should the to what when where which who why with you your'.split(
    ' '
  )
)

export const compendium: CompendiumFile = compendiumJson

/** A short one-cell row that does not end a sentence: a question or a section title. */
function isHeading(row: string): boolean {
  return row.length <= HEADING_CHARS && !row.includes(' | ') && !/[.!]$/.test(row)
}

/** A tab cut into passages that start at a heading, so a question travels with its answer. */
export function passagesOf(tab: { name: string; rows: readonly string[] }): CompendiumPassage[] {
  const out: CompendiumPassage[] = []
  let cur: string[] = []
  let size = 0
  const flush = (): void => {
    if (cur.length) out.push({ tab: tab.name, text: cur.join('\n') })
    cur = []
    size = 0
  }
  for (const row of tab.rows) {
    if (size > 0 && (size + row.length > PASSAGE_CHARS || (isHeading(row) && size > 300))) flush()
    cur.push(row)
    size += row.length + 1
  }
  flush()
  return out
}

/** Query words worth matching, lower-cased, a plural `s` dropped so "motes" finds "mote". */
export function queryTerms(query: string): string[] {
  const words = query
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !STOP.has(w))
  return [...new Set(words.map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)))]
}

function count(hay: string, needle: string): number {
  let n = 0
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) n++
  return n
}

interface Indexed extends CompendiumPassage {
  lower: string
  tabLower: string
}

function scored(p: Indexed, terms: readonly string[]): CompendiumHit | null {
  let score = 0
  let matched = 0
  for (const t of terms) {
    const inText = Math.min(count(p.lower, t), 3)
    const inTab = p.tabLower.includes(t) ? 4 : 0
    if (inText + inTab > 0) matched++
    score += inText + inTab
  }
  if (matched < Math.max(1, Math.ceil(terms.length / 2))) return null
  if (matched === terms.length) score += 5
  return { tab: p.tab, text: p.text, score }
}

export function searchPassages(passages: readonly CompendiumPassage[], query: string): CompendiumHit[] {
  const terms = queryTerms(query)
  if (terms.length === 0) return []
  const hits: CompendiumHit[] = []
  for (const p of passages) {
    const hit = scored({ ...p, lower: p.text.toLowerCase().replace(/['’]/g, ''), tabLower: p.tab.toLowerCase() }, terms)
    if (hit) hits.push(hit)
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, COMPENDIUM_HIT_CAP)
}

let allPassages: CompendiumPassage[] | null = null

export function searchCompendium(query: string): CompendiumHit[] {
  allPassages ??= compendium.tabs.flatMap(passagesOf)
  return searchPassages(allPassages, query)
}

/** The search_guides tool's result: the hits, named by source so the answer can credit it. */
export function guidesToolResult(query: string): string {
  const hits = searchCompendium(query).map(({ tab, text }) => ({ tab, text }))
  if (hits.length === 0) return JSON.stringify({ hits: [], message: `Nothing about ${JSON.stringify(query)} in the Compendium.` })
  return JSON.stringify({ source: `${compendium.title} by ${compendium.author}`, hits })
}
