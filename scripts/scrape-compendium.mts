// scrape-compendium.mts — the EverQuest Legends Compendium (a community Google Sheet by
// brutallstatic) into src/main/data/compendium.json, so the AI assistant can search it offline as
// part of the app's own data (owner, 2026-10-31). Dev and CI time, never the app.
//
//   npx tsx scripts/scrape-compendium.mts                  fetch the published workbook
//   npx tsx scripts/scrape-compendium.mts --file <x.xlsx>  read a downloaded copy instead
//
// The file is rewritten only when the sheet's text changed, so an unchanged week is no diff.
// Sheet text is data, never instruction: it is stored as plain strings and shown to the model as a
// tool result, the same footing as the wiki pages.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CompendiumFile } from '../src/main/ai/aiCompendium'
import { isMain } from './sources/isMain'
import { USER_AGENT } from './sources/wikiApi'
import { workbookText, type SheetText } from './sources/xlsxText'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const OUT_PATH = 'src/main/data/compendium.json'
const PUBLISHED = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRi6Kj604QLMm7kkkjdZSqtogtMtNgq3n9qqc2kaUS_s4LJcMoHbdTl3ph5T93_qs6awfZD0E2I5KeO'
export const COMPENDIUM_URL = `${PUBLISHED}/pubhtml`
const XLSX_URL = `${PUBLISHED}/pub?output=xlsx`
/** A cell longer than this is cut: the sheet is a guide, not a document store. */
const CELL_CAP = 4000

export function compendiumFromSheets(sheets: readonly SheetText[], fetchedAt: string): CompendiumFile {
  const tabs = sheets
    .map((s) => ({ name: s.name.trim(), rows: s.rows.map((r) => r.map((c) => c.slice(0, CELL_CAP)).join(' | ')) }))
    .filter((t) => t.rows.length > 0)
  return { title: 'EverQuest Legends Compendium', author: 'brutallstatic', url: COMPENDIUM_URL, fetchedAt, tabs }
}

/** Write `next` unless its tabs match the file already there; true when it wrote. */
export function writeIfChanged(root: string, next: CompendiumFile): boolean {
  const path = join(root, OUT_PATH)
  if (existsSync(path)) {
    const prev = JSON.parse(readFileSync(path, 'utf8')) as CompendiumFile
    if (JSON.stringify(prev.tabs) === JSON.stringify(next.tabs)) return false
  }
  writeFileSync(path, `${JSON.stringify(next, null, 1)}\n`)
  return true
}

async function fetchWorkbook(): Promise<Buffer> {
  const res = await fetch(XLSX_URL, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' })
  if (!res.ok) throw new Error(`compendium: HTTP ${String(res.status)} from the published sheet`)
  return Buffer.from(await res.arrayBuffer())
}

async function main(): Promise<void> {
  const at = process.argv.indexOf('--file')
  const file = at > 0 ? process.argv[at + 1] : undefined
  const buf = file ? readFileSync(file) : await fetchWorkbook()
  const next = compendiumFromSheets(workbookText(buf), new Date().toISOString().slice(0, 10))
  const rows = next.tabs.reduce((n, t) => n + t.rows.length, 0)
  if (rows === 0) throw new Error('compendium: the workbook had no text; keeping the old file')
  const wrote = writeIfChanged(ROOT, next)
  console.log(`compendium: ${String(next.tabs.length)} tabs, ${String(rows)} rows, ${wrote ? 'updated' : 'unchanged'}`)
}

if (isMain(import.meta.url)) await main()
