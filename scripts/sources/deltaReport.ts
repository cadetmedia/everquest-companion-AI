// deltaReport.ts — scrape-delta.mts's run log: windows, the dry-run estimate, what moved.

import type { SpellEntry } from '../../src/shared/types'
import type { PageLogEvent } from './deltaPages'
import { nameChanges } from './deltaSpells'
import type { DeltaFile, Owner, ReadPlan, Windows } from './deltaWindow'

const BATCH = 50

/** What printWindows needs to know about the checkout. */
export interface WindowFacts {
  spells: { scrapedAt: string } | null
  spellIndex: { titles?: Record<string, string> } | null
  quests: { scrapedAt: string } | null
  questCache: { revs: Record<string, number> } | null
}

/** Each file's window, and why a file sits out. */
export function printWindows(
  db: WindowFacts,
  w: Windows,
  opts: { since: Partial<Record<DeltaFile, string>> }
): void {
  console.log('Windows (each file takes the changes since its own stamp, less an hour):')
  for (const [file, start] of Object.entries(w)) console.log(`  ${file.padEnd(6)} ${start}`)
  if (!w.spells && db.spells) {
    const why = db.spellIndex ? 'its cache index holds no page titles' : 'no spell cache here'
    console.log(`  spells not refreshed: ${why}; --spell-titles lists them (~5 requests)`)
  }
  if (!w.quests && db.quests) console.log('  quests not refreshed: no quest cache in this checkout')
  const noIndex = db.questCache && Object.keys(db.questCache.revs).length === 0
  if (w.quests && noIndex && !opts.since.quests) {
    console.log(
      '  NOTE: the quest cache has no revid index, so its text may be older than ' +
        "quests.json's scrapedAt (an offline re-derive keeps the stamp it found); pass " +
        '--since-quests=<the date that cache was scraped>'
    )
  }
}

const OWNERS: [Owner, string][] = [
  ['items', 'items.json'],
  ['mobs', 'mobs.json'],
  ['spells', 'spells.json'],
  ['quests', 'quests.json'],
  ['unknown', 'no DB yet (new, or none of these; read once and sorted by content)']
]

/** Pages that would be read, per file, and the request estimate. Fetches nothing. */
export function printDryRun(plan: ReadPlan, feedRequests: number, spellListRequests: number): void {
  console.log('Dry run: content not fetched. Pages a real run reads, by the file holding them:')
  for (const [owner, label] of OWNERS) {
    console.log(`  ${String(plan.byOwner.get(owner) ?? 0).padStart(6)}  ${label}`)
  }
  const content = Math.ceil(plan.pageids.length / BATCH) + Math.ceil(plan.titles.length / BATCH)
  const total = 1 + feedRequests + spellListRequests + content
  console.log(
    `Requests: 1 feed-age check + ${feedRequests} feed + ${spellListRequests} spell-title list + ` +
      `${content} content (${plan.pageids.length} by pageid, ${plan.titles.length} by title, 50 a ` +
      `request) = ${total}, plus a request or two for item keys that lose their holder and quest ` +
      'pages that became redirects. One a second.'
  )
}

/** Moves and deletes, for the record: their titles were re-read like any edit. */
export function printPageLogs(logs: PageLogEvent[]): void {
  if (logs.length === 0) return
  console.log(`  ${logs.length} ns0 move/delete log entries (applied by re-reading their titles):`)
  for (const l of logs) {
    console.log(`    ${l.logtype}/${l.logaction}: ${l.title}${l.target ? ` → ${l.target}` : ''}`)
  }
}

export function printRemoved(kind: string, pages: string[]): void {
  if (pages.length === 0) return
  console.log(`  ${pages.length} ${kind} pages removed (gone, a redirect, or no ${kind} page now):`)
  console.log(`    ${pages.join(' | ')}`)
}

/** The spell names the re-derive dropped or added (a page title replacing a stale |spellname). */
export function printSpellNames(before: SpellEntry[], after: SpellEntry[]): void {
  const { gone, added } = nameChanges(before, after)
  if (gone.length) console.log(`  spell names gone (${gone.length}): ${gone.join(' | ')}`)
  if (added.length) console.log(`  spell names new (${added.length}): ${added.join(' | ')}`)
}

export function printStamp(unapplied: string[]): void {
  if (unapplied.length === 0) {
    console.log('Every refreshed scrapedAt → now.')
    return
  }
  console.log(
    `scrapedAt held back (every file for an unreadable page, spells or quests alone for their ` +
      `own): ${unapplied.length} pages came back without readable content (a hidden revision?), ` +
      `so the next run covers the window again: ${unapplied.join(' | ')}`
  )
}
