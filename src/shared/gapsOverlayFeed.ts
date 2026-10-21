// gapsOverlayFeed.ts — the Wiki Gaps overlay's rows, out of the Gaps tab's list (gapsOverlay.ts has
// the arrangement). The tab's rows arrive filtered and sorted exactly as the tab draws them; this
// keeps the first ten as one line each: the name and one short detail. Grouping is not applied: the
// overlay is a flat top ten whatever the tab's "Group by zone, then mob" says.

import { GAP_DOMAIN_LABELS, doneKey, gapActions, gapZone, type GapActionContext, type GapDomain, type GapRow, type GapVerdicts } from './gaps'
import { GAPS_OVERLAY_TOP, type GapsOverlayPayload, type GapsOverlayRow } from './gapsOverlay'

/** Where the row was named most (`Befallen 4 (Refined) +2`), else its To-do chips (`Check wiki`). */
export function gapsOverlayDetail(row: GapRow, verdicts: GapVerdicts = {}, ctx: GapActionContext = {}): string {
  const zone = gapZone(row)
  if (zone !== '') return zone
  return gapActions(row, verdicts[row.name] ?? 'unchecked', ctx)
    .map((a) => a.label)
    .join(', ')
}

export function gapsOverlayRow(row: GapRow, verdicts: GapVerdicts = {}, ctx: GapActionContext = {}): GapsOverlayRow {
  return { key: doneKey(row), name: row.name, detail: gapsOverlayDetail(row, verdicts, ctx) }
}

/** The payload for `rows` — the tab's list in the tab's order, every filter already applied. */
export function gapsOverlayPayload(input: {
  loaded: boolean
  domain: GapDomain
  rows: readonly GapRow[]
  verdicts?: GapVerdicts
  ctx?: GapActionContext
}): GapsOverlayPayload {
  const { loaded, domain, rows, verdicts = {}, ctx = {} } = input
  return {
    loaded,
    label: GAP_DOMAIN_LABELS[domain],
    total: loaded ? rows.length : 0,
    rows: loaded ? rows.slice(0, GAPS_OVERLAY_TOP).map((r) => gapsOverlayRow(r, verdicts, ctx)) : []
  }
}
