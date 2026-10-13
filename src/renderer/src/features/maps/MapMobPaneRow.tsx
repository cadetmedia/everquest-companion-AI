// MapMobPaneRow.tsx — the pieces of ONE sidebar row that are not the row itself: its caption
// (the facts note and the wish-list clause) and the page door wrapped around it.
//
// Split out of MapMobPane.tsx when that file reached the repo's 400-code-line factoring ceiling —
// the LootChrome precedent (JOS-160): nothing here changed in the move except where it lives.
// The seam is the one the file already had: MapMobPane owns the sections, the rows and the
// header; this file owns what a row SAYS under its name and how it opens a page. `rowCaption`
// returns a node rather than a string because the wished drop names inside it are links.

import type { JSX, ReactNode } from 'react'
import { Box, IconButton, ListItem, Stack } from '@mui/material'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import BookmarkIcon from '@mui/icons-material/Bookmark'
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder'
import { rowTarget, type MapPaneRow } from './mobPins'
import { TRACK_COLOR } from './mapTrack'
// The app's one item-name link span (dotted underline, hand only when routed) — the same node the
// gear table, the wish list and the plan draw, so a wished drop here reads and routes like theirs.
import { DonorName } from '../planner/PlannerChips'
import { Tooltip } from '../../lib/Tooltip'
import { KnownItemTooltip } from '../../lib/KnownItemTooltip'

/**
 * The one-line "and what else does this row know" text. Null when it knows nothing extra.
 *
 * The two "no pin" reasons are DIFFERENT FACTS and are said differently: a page that stated
 * nothing, and a page that stated a position but named several zones so it cannot be attributed
 * to this map. Collapsing them into one message would misreport the second as missing data.
 * The wish-list clause joins it on the same caption, but is built in `rowCaption` — its item
 * names are links, so it is a node, not a string.
 */
function rowNote(row: MapPaneRow): string | null {
  if (row.kind !== 'mob') return null
  if (row.unattributable) return `position stated, but the page lists ${String(row.zoneCount)} zones`
  if (row.pins.length === 0) return 'no location on the wiki page'
  if (row.pins.length > 1) return `${String(row.pins.length)} spawn points`
  return null
}

/**
 * The wish-list clause of a row's caption: "drops X, Y (wish list)" with each name a Loot link.
 *
 * `stopPropagation` (only when routed) so the click opens the item, not the row's pin — and
 * `pointerEvents:'auto'` because an unlocatable mob's row button is DISABLED, which turns pointer
 * events off for the whole subtree: the mob has no spot on this map, but its drop still has a page.
 * Each name hovers with the click-through item card (owner ask, 2026-10-03: no bare item names).
 */
function WishDrops({ names, onOpenLoot }: { names: readonly string[]; onOpenLoot?: ((name: string) => void) | undefined }): JSX.Element {
  return (
    <Box
      component="span"
      onClick={onOpenLoot == null ? undefined : (e) => { e.stopPropagation() }}
      sx={onOpenLoot == null ? undefined : { pointerEvents: 'auto' }}
    >
      {'drops '}
      {names.map((n, i) => (
        <Box component="span" key={n}>
          {i > 0 && ', '}
          <KnownItemTooltip name={n} clickThrough>
            <span>
              <DonorName name={n} onOpen={onOpenLoot} />
            </span>
          </KnownItemTooltip>
        </Box>
      ))}
      {' (wish list)'}
    </Box>
  )
}

/** The caption under a row's name: the facts note, the wish clause, both, or nothing. */
export function rowCaption(
  row: MapPaneRow,
  wished: readonly string[] | undefined,
  onOpenLoot: ((name: string) => void) | undefined
): ReactNode {
  const note = rowNote(row)
  const hasWish = wished != null && wished.length > 0
  if (note == null && !hasWish) return null
  return (
    <>
      {note}
      {note != null && hasWish && ' - '}
      {hasWish && <WishDrops names={wished} onOpenLoot={onOpenLoot} />}
    </>
  )
}

/** What a row's action buttons act on: copy its /waypoint, put it on the track list. */
export interface RowActions {
  tracked: boolean
  onToggleTrack: (row: MapPaneRow) => void
  onCopy: (p: { x: number; y: number; z?: number }, what?: string) => void
}

/** Where a row's copy goes: a label's own point with its elevation, a mob's first spawn point. */
function copyTarget(row: MapPaneRow): { x: number; y: number; z?: number } | null {
  if (row.kind === 'label') return { x: row.point.x, y: row.point.y, z: row.point.z }
  return rowTarget(row)
}

/** Wraps a row's button with its actions: copy /waypoint and track (map-waypoints) when the row
 *  has a spot, and the mob-page door — all OUTSIDE the button, so a row whose jump or pin is
 *  disabled (no map, no stated spot) still offers the page, which is live regardless. */
export function WithRowActions({
  row,
  actions,
  onOpen,
  children
}: {
  row: MapPaneRow
  actions: RowActions
  onOpen?: (() => void) | undefined
  children: ReactNode
}): JSX.Element {
  const target = copyTarget(row)
  if (target == null && onOpen == null) return <>{children}</>
  // The buttons sit IN the row's flex line, after the row button, never floated over it: floated,
  // they covered the level column (owner, 2026-10-13). Dimmed until the row is hovered or focused.
  return (
    <ListItem disablePadding sx={{ '&:hover .row-acts, & .row-acts:focus-within': { opacity: 1 } }}>
      <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex' }}>{children}</Box>
      <Stack direction="row" alignItems="center" className="row-acts" sx={{ flexShrink: 0, opacity: 0.45, pr: 0.5 }}>
          {target != null && (
            <Tooltip title="Copy the /waypoint command for this spot">
              <IconButton size="small" data-testid="maps-pane-copy" onClick={() => { actions.onCopy(target, row.name) }}>
                <ContentCopyIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}
          {target != null && (
            <Tooltip title={actions.tracked ? 'Stop tracking' : 'Track: ring it on the map and show it on the Map pins overlay'}>
              <IconButton
                size="small"
                data-testid="maps-pane-track"
                aria-pressed={actions.tracked}
                onClick={() => { actions.onToggleTrack(row) }}
              >
                {actions.tracked ? <BookmarkIcon sx={{ fontSize: 15, color: TRACK_COLOR }} /> : <BookmarkBorderIcon sx={{ fontSize: 15 }} />}
              </IconButton>
            </Tooltip>
          )}
          {onOpen != null && (
            <Tooltip title="Open this mob's page">
              <IconButton size="small" data-testid="maps-pane-open-mob" onClick={onOpen}>
                <OpenInNewIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Tooltip>
          )}
      </Stack>
    </ListItem>
  )
}

/** The mob-page door alone, for the cross-zone rows: a waypoint only paths inside your own zone,
 *  so a row from another map carries no copy or track. */
export function WithPageDoor({ onOpen, children }: { onOpen: () => void; children: ReactNode }): JSX.Element {
  return (
    <ListItem disablePadding secondaryAction={
      <Tooltip title="Open this mob's page">
        <IconButton size="small" edge="end" data-testid="maps-pane-open-mob" onClick={onOpen}>
          <OpenInNewIcon sx={{ fontSize: 15 }} />
        </IconButton>
      </Tooltip>
    }>
      {children}
    </ListItem>
  )
}
