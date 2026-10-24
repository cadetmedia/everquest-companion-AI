// revIndex.ts — which wiki revision each cached item and mob page holds (owner, 2026-10-23: know, per
// page, whether we are missing a revision and from which one to continue). The same `index.json`
// shape the quest and spell caches keep: `{ revs: { <pageid>: <revid> } }`, beside the family's page
// list in its gitignored cache dir. The delta writes the revid of every page it reads; a page it
// skips because its newest revision is the text we hold gets that revision too.
//
// `seeded` lists pageids whose revid came from the wiki's GitHub data pack (scripts/eoz-compare.mts
// --seed-revs), not from a read: a lower bound, never more (see `seedRevs`). A real read replaces it.

import { createHash } from 'crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface RevIndex {
  updatedAt?: string
  revs: Record<string, number>
  /** pageids whose revid is the pack's, not a read's */
  seeded?: number[]
}

export const REV_INDEX = 'index.json'

/** MediaWiki's revision sha1, as the API returns it: hex SHA-1 of the UTF-8 text. */
export const sha1Hex = (text: string): string => createHash('sha1').update(text, 'utf8').digest('hex')

export function readRevIndex(dir: string): RevIndex {
  const path = join(dir, REV_INDEX)
  if (!existsSync(path)) return { revs: {} }
  const j = JSON.parse(readFileSync(path, 'utf8')) as Partial<RevIndex>
  return { ...j, revs: j.revs ?? {} }
}

export function writeRevIndex(dir: string, idx: RevIndex, now: string): void {
  const revs = Object.fromEntries(Object.entries(idx.revs).sort((a, b) => Number(a[0]) - Number(b[0])))
  const out: RevIndex = { updatedAt: now, revs, ...(idx.seeded?.length ? { seeded: [...idx.seeded].sort((a, b) => a - b) } : {}) }
  const path = join(dir, REV_INDEX)
  writeFileSync(`${path}.tmp`, JSON.stringify(out, null, 2) + '\n', 'utf8')
  renameSync(`${path}.tmp`, path)
}

/** Revisions read (or proven current): each replaces what the index held, seeded or not. */
export function recordRevs(idx: RevIndex, read: Iterable<[number, number]>, gone: Iterable<number> = []): number {
  const seeded = new Set(idx.seeded ?? [])
  let n = 0
  for (const [pageid, revid] of read) {
    if (idx.revs[String(pageid)] !== revid) n++
    idx.revs[String(pageid)] = revid
    seeded.delete(pageid)
  }
  const goneList = [...gone]
  const goneKeys = new Set(goneList.map(String))
  const before = Object.keys(idx.revs).length
  idx.revs = Object.fromEntries(Object.entries(idx.revs).filter(([k]) => !goneKeys.has(k)))
  n += before - Object.keys(idx.revs).length
  for (const pageid of goneList) seeded.delete(pageid)
  idx.seeded = [...seeded]
  return n
}

/**
 * The pack's revisions, for pages the index has no entry for, ONLY when our files were stamped after
 * the pack was built: every edit up to our stamp is in our data, so each page holds the pack's
 * revision or a later one. The seed is therefore a lower bound: a later pack can at worst flag a page
 * stale that is not (a re-read we did not need), never hide a change. An entry a read wrote stays.
 */
export function seedRevs(idx: RevIndex, pack: Iterable<[number, number]>, ourStamp: string, packBuilt: string): number {
  if (!(Date.parse(ourStamp) > Date.parse(packBuilt))) return 0
  const seeded = new Set(idx.seeded ?? [])
  let n = 0
  for (const [pageid, revid] of pack) {
    if (String(pageid) in idx.revs) continue
    idx.revs[String(pageid)] = revid
    seeded.add(pageid)
    n++
  }
  idx.seeded = [...seeded]
  return n
}
