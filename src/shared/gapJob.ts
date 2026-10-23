// shared/gapJob.ts — what job a Gaps row is (owner, 2026-10-21: "we just need to somehow indicate to
// the person it's a small update needed vs a missing item"): a NEW page, where the wiki has no page
// for the name, or an UPDATE to a page that exists and lacks something (a drop, a faction, a
// picture). One rule, read by the row's tag, the domain counts, the Show picker and the overlay.

import { gapsCaption, visibleGaps, type GapActionContext, type GapDomain, type GapRow, type GapsSnap } from './gaps'

export type GapJob = 'new' | 'update'
/** The Show picker's choice: every row, or one job. */
export type GapShow = 'all' | GapJob

/** The domains whose every row is a change to a page that exists: a faction, a drop, a picture, a notice. */
const UPDATE_DOMAINS: ReadonlySet<GapDomain> = new Set<GapDomain>(['faction', 'drop', 'image', 'notice'])

/**
 * A row's job. A faction row whose mob the data has no page for stays an update: its chip asks to
 * check the page, and the mob's own row, if the wiki lacks it, is the new page. A trader the catalog
 * has as a mob (`ctx.isMob`) has a page that only lacks the merchant layout.
 */
export function gapJob(row: GapRow, ctx: GapActionContext = {}): GapJob {
  if (UPDATE_DOMAINS.has(row.domain)) return 'update'
  if (row.domain === 'merchant' && ctx.isMob?.(row.name) === true) return 'update'
  return 'new'
}

export const GAP_JOB_LABEL: Record<GapJob, string> = { new: 'New page', update: 'Update page' }
export const GAP_JOB_TIP: Record<GapJob, string> = {
  new: 'The wiki has no page for this: Copy wiki page gives a new page.',
  update: 'The wiki has a page that lacks this: a small edit to that page.'
}

/** The rows the Show picker keeps; all of them, the same array, for `all`. */
export function onlyJob(rows: readonly GapRow[], show: GapShow, ctx: GapActionContext = {}): readonly GapRow[] {
  return show === 'all' ? rows : rows.filter((r) => gapJob(r, ctx) === show)
}

const SHOWS: readonly GapShow[] = ['all', 'new', 'update']

/** The stored Show choice; All when absent or unreadable. */
export function gapShowOf(raw: string | null): GapShow {
  return SHOWS.find((s) => s === raw) ?? 'all'
}

/** What the shown-count line adds for a Show choice. */
export const GAP_SHOW_WORDS: Record<GapShow, string> = { all: '', new: ', new pages only', update: ', updates only' }

/** What a caption counts: the rows in the zone when one is given, less the hidden ones. */
export interface CaptionFilter {
  zone: string | null
  hidden: (row: GapRow) => boolean
}

/**
 * A domain's toggle caption, split when it holds both jobs: `53 missing · 6 to update` (owner,
 * 2026-10-21), `2 missing here · 1 to update` with Zone I'm in on. A domain of one job keeps
 * `gapsCaption`'s `76 unknown`. Hidden rows are left out of both counts.
 */
export function jobCaption(snap: GapsSnap, domain: GapDomain, filter: CaptionFilter, ctx: GapActionContext = {}): string {
  const { zone, hidden } = filter
  const plain = gapsCaption(snap, domain, zone, hidden)
  if (UPDATE_DOMAINS.has(domain)) return plain
  const inDomain = zone === null ? snap.rows.filter((r) => r.domain === domain) : visibleGaps(snap.rows, domain, '', zone)
  const updates = inDomain.filter((r) => !hidden(r) && gapJob(r, ctx) === 'update').length
  if (updates === 0) return plain
  // The engine serves the first 500 unknown names and counts the rest: the total is the count, less hidden rows.
  const all = zone === null ? Math.max(0, (snap.totals[domain] ?? 0) - inDomain.filter(hidden).length) : inDomain.filter((r) => !hidden(r)).length
  return `${Math.max(0, all - updates).toLocaleString()} missing${zone === null ? '' : ' here'} · ${updates.toLocaleString()} to update`
}
