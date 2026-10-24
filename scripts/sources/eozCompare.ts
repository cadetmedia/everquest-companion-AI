// eozCompare.ts — our item and mob data against the wiki's own GitHub data pack (Maergoth/EQL-EOZ,
// branch `dataset`; owner, 2026-10-23: compare it before a delta in dev pre-release, and within 5 hours
// of a release let it stand in for the delta, losing nothing). Pure: scripts/eoz-compare.mts does I/O.
//
// THE PACK IS NEVER IMPORTED. Its rows are the wiki's own parse and lack fields ours carries
// (otherNames, drop groups, faction amounts); it is read only to say, per page, whether our copy is
// behind (`revisionId` against the revision our cache index recorded), what we lack, and where its
// parse and ours disagree on the same revision (our parser's bugs, or theirs). Quests and spells are
// not in the pack: the report says so.

import { zoneShortName, zoneShortNameFromCatalog } from '../../src/shared/zones'

/** One pack row as the compare reads it (the pack's other fields are ignored). */
export interface PackNpc {
  wikiTitle: string
  revisionId: number
  levelMin?: number
  levelMax?: number
  zone?: string
}
export interface PackItem {
  wikiTitle: string
  revisionId: number
  classes?: string[]
  slots?: string[]
  stats?: Record<string, number>
}
export interface Pack {
  meta: { generatedAt: string; version?: string }
  npcs: PackNpc[]
  items: PackItem[]
}

/** Ours, per family: the data file's pages and stamp, the cache list (title -> pageid), the revisions. */
export interface OurFamily {
  stamp: string
  /** page title -> the fields the cross-check reads */
  pages: Map<string, OurFields>
  pageids: Map<string, number>
  revs: Record<string, number>
}
export interface OurFields {
  level?: string
  zones?: string[]
  classes?: string[]
  slot?: string
  ac?: number
}

export interface Stale {
  title: string
  /** the revision our cache recorded, or undefined when none was */
  ours?: number
  wiki: number
}
export interface FieldDiff {
  title: string
  field: string
  ours: string
  pack: string
}
export interface FamilyReport {
  family: 'items' | 'mobs'
  stamp: string
  packRows: number
  ourPages: number
  /** behind the wiki: the pack's revision is newer than ours */
  stale: Stale[]
  /** no recorded revision and our stamp older than the pack: cannot tell */
  unknown: string[]
  /** in the pack, not in our data: never listed by our scrape at all */
  missingUnlisted: string[]
  /** in the pack and in our cache's page list, but not in our data (dropped by our parse or filters) */
  missingListed: string[]
  /** in our data, not in the pack */
  extra: string[]
  fieldDiffs: FieldDiff[]
}

/** A title as MediaWiki spells it: spaces, not underscores, first letter capital. */
export function wikiTitle(t: string): string {
  const s = t.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}

const nums = (s: string | undefined): number[] => (s ?? '').match(/\d+/g)?.map(Number) ?? []
const norm = (s: string): string => s.toLowerCase().replace(/[`’]/g, "'").replace(/\s+/g, ' ').trim()
const sameSet = (a: string[], b: string[]): boolean => {
  const x = new Set(a.map(norm))
  const y = new Set(b.map(norm))
  return x.size === y.size && [...x].every((v) => y.has(v))
}

function levelDiff(title: string, ours: OurFields, row: PackNpc): FieldDiff[] {
  const lv = nums(ours.level)
  if (lv.length === 0 || row.levelMin === undefined || row.levelMin <= 0) return []
  const hi = row.levelMax ?? row.levelMin
  if (Math.min(...lv) === row.levelMin && Math.max(...lv) === hi) return []
  return [{ title, field: 'level', ours: ours.level ?? '', pack: `${String(row.levelMin)}-${String(hi)}` }]
}

/** One place under two spellings: the app's zone table folds both (`Burning Woods` = `Burning Wood`). */
function sameZone(a: string, b: string): boolean {
  if (norm(a) === norm(b)) return true
  const short = (z: string): string | null => zoneShortName(z) ?? zoneShortNameFromCatalog(z)
  const s = short(a)
  return s !== null && s === short(b)
}

/** Our page's zones against the pack's (`Greater Faydark / Kelethin` is either); ours `Various` is no claim. */
function zoneDiff(title: string, ours: OurFields, row: PackNpc): FieldDiff[] {
  const pack = (row.zone ?? '').split(' / ').map((z) => z.trim()).filter(Boolean)
  const zones = (ours.zones ?? []).filter((z) => !norm(z).startsWith('various'))
  if (pack.length === 0 || zones.length === 0 || zones.some((z) => pack.some((p) => sameZone(z, p)))) return []
  return [{ title, field: 'zone', ours: zones.join(', '), pack: row.zone ?? '' }]
}

const npcDiffs = (title: string, ours: OurFields, row: PackNpc): FieldDiff[] => [...levelDiff(title, ours, row), ...zoneDiff(title, ours, row)]

/** The wiki's class tokens: `ALL` is all sixteen, `ALL except CLR PAL` all but those. */
const CLASSES = ['WAR', 'CLR', 'PAL', 'RNG', 'SHD', 'DRU', 'MNK', 'BRD', 'ROG', 'SHM', 'NEC', 'WIZ', 'MAG', 'ENC', 'BST', 'BER']
export function expandClasses(list: string[]): string[] {
  const tokens = list.join(' ').toUpperCase().split(/[\s,]+/).filter(Boolean)
  if (!tokens.includes('ALL')) return tokens
  const except = new Set(tokens.slice(tokens.indexOf('EXCEPT') + 1))
  return tokens.includes('EXCEPT') ? CLASSES.filter((c) => !except.has(c)) : CLASSES
}

/** One list field both sides state, compared as a set; nothing when either side states none. */
function setDiff(title: string, field: string, ours: string[], pack: string[] | undefined): FieldDiff[] {
  if (ours.length === 0 || !pack || pack.length === 0 || sameSet(ours, pack)) return []
  return [{ title, field, ours: ours.join(' '), pack: pack.join(' ') }]
}

function itemDiffs(title: string, ours: OurFields, row: PackItem): FieldDiff[] {
  const ac = row.stats?.AC
  const acDiff = ours.ac !== undefined && ac !== undefined && ours.ac !== ac ? [{ title, field: 'ac', ours: String(ours.ac), pack: String(ac) }] : []
  return [
    ...setDiff(title, 'classes', expandClasses(ours.classes ?? []), row.classes && expandClasses(row.classes)),
    ...setDiff(title, 'slot', (ours.slot ?? '').split(/[,\s]+/).filter(Boolean), row.slots),
    ...acDiff
  ]
}

interface Row {
  wikiTitle: string
  revisionId: number
}

/** One family: each pack row against our page of that title. */
export function compareFamily<R extends Row>(
  family: 'items' | 'mobs',
  rows: R[],
  ours: OurFamily,
  check: { packBuilt: string; diffs: (title: string, ours: OurFields, row: R) => FieldDiff[] }
): FamilyReport {
  const { packBuilt, diffs } = check
  const report: FamilyReport = {
    family, stamp: ours.stamp, packRows: rows.length, ourPages: ours.pages.size,
    stale: [], unknown: [], missingUnlisted: [], missingListed: [], extra: [], fieldDiffs: []
  }
  const byStamp = Date.parse(ours.stamp) >= Date.parse(packBuilt)
  const seen = new Set<string>()
  for (const row of rows) {
    const title = wikiTitle(row.wikiTitle)
    seen.add(title)
    const fields = ours.pages.get(title)
    const pageid = ours.pageids.get(title)
    if (fields === undefined) {
      ;(pageid === undefined ? report.missingUnlisted : report.missingListed).push(title)
      continue
    }
    const rev = pageid === undefined ? undefined : ours.revs[String(pageid)]
    if (rev !== undefined ? row.revisionId > rev : !byStamp) {
      if (rev === undefined) report.unknown.push(title)
      else report.stale.push({ title, ours: rev, wiki: row.revisionId })
      continue
    }
    report.fieldDiffs.push(...diffs(title, fields, row))
  }
  for (const title of ours.pages.keys()) if (!seen.has(title)) report.extra.push(title)
  return report
}

export interface CompareReport {
  pack: { version?: string; generatedAt: string }
  items: FamilyReport
  mobs: FamilyReport
  /** not in the pack, so not checked */
  unchecked: string[]
}

export function comparePack(pack: Pack, items: OurFamily, mobs: OurFamily): CompareReport {
  const built = pack.meta.generatedAt
  return {
    pack: { version: pack.meta.version, generatedAt: built },
    items: compareFamily('items', pack.items, items, { packBuilt: built, diffs: itemDiffs }),
    mobs: compareFamily('mobs', pack.npcs, mobs, { packBuilt: built, diffs: npcDiffs }),
    unchecked: ['quests', 'spells']
  }
}

/** The owner's rule: a pack built within 5 hours of the release stands in for the delta. */
export const RELEASE_WINDOW_MS = 5 * 3600_000

export function releaseDecision(packBuilt: string, now: string): { deltaNeeded: boolean; ageHours: number } {
  const age = Date.parse(now) - Date.parse(packBuilt)
  return { deltaNeeded: !(age >= 0 && age <= RELEASE_WINDOW_MS), ageHours: Math.round((age / 3600_000) * 10) / 10 }
}

/** Pack rows whose page we can match to a pageid, for seeding the revision index. */
export function packRevisions(rows: Row[], pageids: Map<string, number>): [number, number][] {
  const out: [number, number][] = []
  for (const r of rows) {
    const id = pageids.get(wikiTitle(r.wikiTitle))
    if (id !== undefined) out.push([id, r.revisionId])
  }
  return out
}
