// shared/gapFieldActions.ts — the chips of the domains whose row is one field of a mob page: a
// picture (gapImages.ts) and a respawn (gapRespawns.ts). Out of gaps.ts, which sits at the factoring
// ceiling (eslint max-lines).

import type { GapAction, GapDomain, GapRow } from './gaps'
import { respawnAction } from './gapRespawns'
import { wikiUploadUrl } from './gapUrls'

/** An image row's chip: upload the file; the page's imagefilename line added, or fixed when it names another file. */
function imageAction(row: GapRow, file = row.image ?? ''): GapAction {
  const fix = row.pageImage === undefined ? 'add an imagefilename line if the page has none' : `the page's imagefilename says ${row.pageImage}: change it to ${file}`
  return { kind: 'addToWiki', label: 'Upload image', why: `Upload a screenshot as ${file}; ${fix}.`, href: wikiUploadUrl(file) }
}

const FIELD_ACTION: Partial<Record<GapDomain, (row: GapRow) => GapAction>> = {
  image: (row) => imageAction(row),
  respawn: (row) => respawnAction(row)
}

/** The row's one chip when its domain is one field of a mob page; undefined otherwise. */
export function fieldAction(row: GapRow): GapAction | undefined {
  return FIELD_ACTION[row.domain]?.(row)
}
