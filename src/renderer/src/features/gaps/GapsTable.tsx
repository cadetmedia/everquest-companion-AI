// The Gaps tab's table: one row per unknown name, most mentioned first until a header is clicked
// (every column sorts; the order itself is `sortGaps`, shared/gaps.ts). A click opens the row's details in a pane ABOVE the table (GapDetailsPanel), as the
// Bazaar's picked panel sits above its list; a second click closes it.
//
// WINDOWED THE LOOT LEDGER'S WAY (owner ask, 2026-10-11: no lag anywhere). A domain can fill its
// 500-row cap, and an unwindowed table of memo-less rows is the shape that read 293 ms a keystroke
// at that size elsewhere. So `useWindowedRows` mounts a screenful plus overscan between two pad
// rows, every row is a fixed height with its cells on one line, and the row component is memoized
// on stable props: the row, whether it is the open one, its verdict, and one `onToggle(name)`
// callback. The details pane lives OUTSIDE the window, so an open row never changes a row's height.
//
// ONE SCROLLER (owner feedback, 2026-10-12: "no scroll bar inside scroll bar"). The scroll box is
// the page's only scroller: it grows to the room the view's column leaves (`flexGrow: 1`) and may
// shrink below its content (`minHeight: 0`), exactly as the Loot ledger bounds its box, instead of
// a viewport-arithmetic cap that left the page scrolling beside it. The pane above it caps its own
// height modestly so the list keeps room on a short screen.

import { type JSX, memo, useCallback, useMemo, useRef, useState } from 'react'
import { Box, Button, Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TableSortLabel, Typography } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import NoteAddIcon from '@mui/icons-material/NoteAdd'
import {
  charactersOff,
  doneKey,
  factionOf,
  gapZone,
  mobPageOf,
  wikiEditUrl,
  logSaysText,
  pageSaysText,
  onMobPage,
  type GapActionContext,
  type GapRow,
  type GapSort,
  type GapSortKey,
  type GapSuggest,
  type GapVerdict,
  type GapVerdicts
} from '@shared/gaps'
import { unfoldedEntries, type GapEntry } from '@shared/gapGroups'
import { seenByKey } from '@shared/gapsAllCharacters'
import { gapHeld, heldChipLabel, heldLine, heldTitle, type GapHeld, type HeldIndex } from '@shared/gapHeld'
import { wikiPageUrl } from '@shared/wiki'
import { copyText } from '../../lib/clipboard'
import { Tooltip } from '../../lib/Tooltip'
import { useWindowedRows } from '../../lib/useWindowedRows'
import GapActionChips from './GapActionChips'
import GapDetailsPanel from './GapDetailsPanel'
import GapRowButtons from './GapRowButtons'

/** One line of small cells with a small chip: 6px padding above and below a 24px chip, plus the border. */
const ROW_HEIGHT = 37
const COLUMNS = 8

/** Beside the name: the one known name within reach, linked to its page so the owner can fix it. */
function SuggestCaption({ s }: { s: GapSuggest }): JSX.Element {
  return (
    <Typography variant="caption" color="text.secondary" component="span" sx={{ ml: 1, fontWeight: 400 }} data-testid="gaps-suggest">
      Probably{' '}
      <Box
        component="a"
        href={wikiPageUrl(s.page)}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        sx={{ color: 'inherit', textDecoration: 'underline dotted' }}
      >
        {s.name}
      </Box>{' '}
      ({charactersOff(s.distance)}). The wiki page may be misspelled.
    </Typography>
  )
}

/** The spacer rows that reserve the full scroll height, so only a screenful of rows is mounted. */
function PadRow({ height }: { height: number }): JSX.Element | null {
  if (height <= 0) return null
  return (
    <TableRow style={{ height }}>
      <TableCell colSpan={COLUMNS} sx={{ p: 0, border: 0 }} />
    </TableRow>
  )
}

/** Beside an Items row's name: who holds it right now (review C6), the counts and places in the tooltip. */
function HeldChip({ held }: { held: readonly GapHeld[] }): JSX.Element {
  return (
    <Tooltip title={heldTitle(held)}>
      <Chip label={heldChipLabel(held)} size="small" color="success" variant="outlined" sx={{ ml: 1 }} data-testid="gaps-held" />
    </Tooltip>
  )
}

const GapTableRow = memo(function GapTableRow({
  row,
  open,
  verdict,
  onToggle,
  depth = 0,
  done = false,
  chipContext,
  work,
  held
}: {
  row: GapRow
  open: boolean
  verdict: GapVerdict
  onToggle: (name: string) => void
  /** marked done: shown only under "Show done", dimmed */
  done?: boolean
  chipContext?: GapActionContext
  /** the row's work buttons, as icons (GapRowButtons) */
  work: RowWork
  /** an Items row the player holds right now (shared/gapHeld.ts) */
  held?: readonly GapHeld[]
  /** grouped: 1 under a zone, 2 under a mob, bulleted and indented below its heading */
  depth?: number
}): JSX.Element {
  return (
    <TableRow hover selected={open} onClick={() => onToggle(row.name)} sx={{ cursor: 'pointer', height: ROW_HEIGHT, opacity: done ? 0.5 : 1 }} data-testid="gaps-row">
      <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap', pl: depth > 0 ? 3 + depth * 2 : undefined }}>
        {depth > 0 && (
          <Box component="span" sx={{ color: 'text.secondary', mr: 1 }}>
            •
          </Box>
        )}
        {/* Under its mob's heading a faction or drop row is the faction or item alone. */}
        {depth === 2 && onMobPage(row) ? factionOf(row) : row.name}
        {row.suggest !== undefined && <SuggestCaption s={row.suggest} />}
        {row.maybePlayer === true && <Chip label="may be a player" size="small" color="warning" variant="outlined" sx={{ ml: 1 }} data-testid="gaps-maybe-player" />}
        {held !== undefined && held.length > 0 && <HeldChip held={held} />}
      </TableCell>
      {/* Beside the name (owner, 2026-10-19): the work buttons where the eye already is. */}
      <TableCell sx={{ py: 0 }}>
        <GapRowButtons row={row} pageText={work.pageText} isDone={done} onDone={work.onDone} compact />
      </TableCell>
      <TableCell>
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'nowrap' }}>
          {row.kinds.map((k) => (
            <Chip key={k} label={k} size="small" variant="outlined" />
          ))}
        </Stack>
      </TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{gapZone(row)}</TableCell>
      <TableCell align="right">{row.count.toLocaleString()}</TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{row.first}</TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{row.last}</TableCell>
      <TableCell>
        <GapActionChips row={row} verdict={verdict} ctx={chipContext} />
      </TableCell>
    </TableRow>
  )
})

/** What a row's icon buttons need; one stable object, so the memoized rows stay memoized. */
interface RowWork {
  pageText: (row: GapRow) => string
  onDone: (row: GapRow) => void
}

/** What the open row's pane does beyond showing it: its page text, what is still needed, its Done mark. */
interface PaneActions {
  pageText: (row: GapRow) => string
  needed: (row: GapRow) => string[]
  done: ReadonlySet<string>
  onDone: (row: GapRow) => void
  /** add a "may be a player" name to the permanent players list */
  onPlayer: (name: string) => void
  /** All characters: who saw each row */
  seenBy?: ReadonlyMap<string, readonly string[]>
  /** what the player holds right now, for an Items row's held line */
  holding: HeldIndex
}

/** The open row's details, above the list: capped so the list keeps room on a short screen. */
function DetailsPane({ row, actions }: { row: GapRow; actions: PaneActions }): JSX.Element {
  const isDone = actions.done.has(doneKey(row))
  const needed = actions.needed(row)
  const seen = actions.seenBy?.get(seenByKey(row))
  const held = gapHeld(row, actions.holding)
  return (
    <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, flexShrink: 0, maxHeight: '40vh', overflow: 'auto' }} data-testid="gaps-details-pane">
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="subtitle2">{row.name}</Typography>
        <GapRowButtons row={row} pageText={actions.pageText} isDone={isDone} onDone={actions.onDone} />
        {row.maybePlayer === true && (
          <Tooltip title="A one-word name you only hailed or conned may be a player. Marking it hides it here for good.">
            <Button size="small" color="warning" onClick={() => actions.onPlayer(row.name)} data-testid="gaps-mark-player">
              Mark as player
            </Button>
          </Tooltip>
        )}
      </Stack>
      {seen !== undefined && (
        <Typography variant="caption" color="text.secondary" component="div" data-testid="gaps-seen-by">
          Seen by: {seen.join(', ')}.
        </Typography>
      )}
      {held.map((h) => (
        <Typography key={h.who ?? ''} variant="body2" color="success.main" component="div" data-testid="gaps-held-line">
          {heldLine(h)}
        </Typography>
      ))}
      {row.fix !== undefined && (
        <Typography variant="body2" color="warning.main" component="div" data-testid="gaps-fix-line">
          The page lists it as {pageSaysText(row.pageSays ?? '')}; your log: {logSaysText(row)}.
        </Typography>
      )}
      {needed.length > 0 && (
        <Typography variant="caption" color="text.secondary" data-testid="gaps-needed">
          Still needed for the page: {needed.join(', ')}.
        </Typography>
      )}
      <GapDetailsPanel details={row.details} />
    </Paper>
  )
}

/** The table's columns: header text, the sort key, and which side the cell aligns to. */
const HEADERS: readonly (readonly [string, GapSortKey, 'left' | 'right'])[] = [
  ['Name', 'name', 'left'],
  ['Seen as', 'kinds', 'left'],
  ['Zone', 'zone', 'left'],
  ['Times', 'count', 'right'],
  ['First', 'first', 'left'],
  ['Last', 'last', 'left'],
  ['To do', 'todo', 'left']
]

/** Every header sorts (owner asks, 2026-10-13 and, for Zone, 2026-10-17): a click picks the column, a second flips it. */
function SortHeader({ sort, onSort }: { sort: GapSort; onSort: (key: GapSortKey) => void }): JSX.Element {
  return (
    <TableHead>
      <TableRow>
        {HEADERS.map(([label, key, align], i) => [
          <TableCell key={key} align={align} sortDirection={sort.key === key ? sort.dir : false}>
            <TableSortLabel
              active={sort.key === key}
              direction={sort.key === key ? sort.dir : 'asc'}
              onClick={() => {
                onSort(key)
              }}
              data-testid={`gaps-sort-${key}`}
            >
              {label}
            </TableSortLabel>
          </TableCell>,
          // The Work column sits right after Name, as the row's buttons do.
          i === 0 ? (
            <TableCell key="work" sx={{ whiteSpace: 'nowrap' }}>
              Work
            </TableCell>
          ) : null
        ])}
      </TableRow>
    </TableHead>
  )
}

/** A mob heading's one copy of every missing line under it, for one edit of that page (owner ask, 2026-10-18). */
function CopyLinesButton({ text }: { text: () => string }): JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      size="small"
      startIcon={<ContentCopyIcon />}
      onClick={(e) => {
        e.stopPropagation()
        void copyText(text()).then(setCopied)
      }}
      sx={{ ml: 2, py: 0 }}
      data-testid="gaps-copy-lines"
    >
      {copied ? 'Copied' : 'Copy lines'}
    </Button>
  )
}

/** Beside Copy lines: the wiki's editor on the mob's page, to paste them in (owner, 2026-10-20). */
function EditPageButton({ page }: { page: string }): JSX.Element {
  return (
    <Tooltip title={`The wiki's editor on ${page}.`}>
      <Button
        size="small"
        startIcon={<NoteAddIcon />}
        href={wikiEditUrl(page)}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        sx={{ ml: 1, py: 0 }}
        data-testid="gaps-edit-mob-page"
      >
        Edit mob page
      </Button>
    </Tooltip>
  )
}

/** A zone or mob heading of the grouped list (shared/gapGroups.ts), one row high like the rest; a
 *  click folds what is under it (owner ask, 2026-10-18). A mob heading over a page's missing drops or
 *  factions copies all their lines at once. */
function GroupRow({
  entry,
  folded,
  onFold,
  pageText
}: {
  entry: Exclude<GapEntry, { kind: 'row' }>
  folded: boolean
  onFold: (key: string) => void
  pageText: (row: GapRow) => string
}): JSX.Element {
  const zone = entry.kind === 'zone'
  const lines = entry.kind === 'mob' && entry.rows.every(onMobPage) ? entry.rows : null
  return (
    <TableRow
      onClick={() => onFold(entry.key)}
      sx={{ height: ROW_HEIGHT, cursor: 'pointer', bgcolor: zone ? 'action.selected' : 'action.hover' }}
      data-testid={`gaps-group-${entry.kind}`}
    >
      <TableCell colSpan={COLUMNS} sx={{ fontWeight: zone ? 700 : 600, pl: zone ? 1 : 4, whiteSpace: 'nowrap' }}>
        <Box component="span" sx={{ color: 'text.secondary', mr: 1 }}>
          {folded ? '▸' : '▾'}
        </Box>
        {zone ? entry.zone : entry.mob}
        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          {entry.n} missing
        </Typography>
        {lines !== null && <CopyLinesButton text={() => lines.map(pageText).join('')} />}
        {lines?.[0] !== undefined && <EditPageButton page={mobPageOf(lines[0])} />}
      </TableCell>
    </TableRow>
  )
}

export default function GapsTable({
  entries,
  verdicts,
  sort,
  onSort,
  pageText,
  needed,
  done,
  onDone,
  onPlayer,
  holding,
  chipContext,
  seenBy,
  hiddenByFilter = false
}: {
  /** the rows, or the grouped list with its zone and mob headings */
  entries: readonly GapEntry[]
  verdicts: GapVerdicts
  sort: GapSort
  onSort: (key: GapSortKey) => void
  /** the wiki page text for a row, for its Copy wiki page button */
  pageText: (row: GapRow) => string
  /** the page fields the log left blank for a row */
  needed: (row: GapRow) => string[]
  /** the rows marked done, and the mark's toggle */
  done: ReadonlySet<string>
  onDone: (row: GapRow) => void
  onPlayer: (name: string) => void
  /** what the player holds right now (shared/gapHeld.ts): a chip on the row, a line in its details */
  holding: HeldIndex
  /** what the chips may say beyond the row (the data date, which names are mobs) */
  chipContext: GapActionContext
  /** the domain HAS unknown names, so an empty list means the search or zone filter hid them */
  hiddenByFilter?: boolean
  /** All characters: who saw each row, named in its details */
  seenBy?: ReadonlyMap<string, readonly string[]>
}): JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  const onToggle = useCallback((name: string) => setOpen((cur) => (cur === name ? null : name)), [])
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  const onFold = useCallback(
    (key: string) =>
      setFolded((cur) => {
        const next = new Set(cur)
        if (!next.delete(key)) next.add(key)
        return next
      }),
    []
  )
  const shown = useMemo(() => unfoldedEntries(entries, folded), [entries, folded])
  const work = useMemo<RowWork>(() => ({ pageText, onDone }), [pageText, onDone])
  const scrollRef = useRef<HTMLDivElement>(null)
  const win = useWindowedRows({ count: shown.length, rowHeight: ROW_HEIGHT, scrollRef })
  if (entries.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }} data-testid="gaps-empty">
        {hiddenByFilter
          ? 'No unknown names match the search or the zone filter.'
          : "Nothing here: every name the log mentioned in this domain is in the app's data."}
      </Typography>
    )
  }
  const opened = open === null ? undefined : entries.find((e) => e.kind === 'row' && e.row.name === open)
  const openedRow = opened?.kind === 'row' ? opened.row : undefined
  return (
    <Stack spacing={1.5} sx={{ flexGrow: 1, minHeight: 0 }}>
      {openedRow !== undefined && <DetailsPane row={openedRow} actions={{ pageText, needed, done, onDone, onPlayer, seenBy, holding }} />}
      <Box ref={scrollRef} sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain' }} data-testid="gaps-scroll">
        <Table size="small" stickyHeader data-testid="gaps-table">
          <SortHeader sort={sort} onSort={onSort} />
          <TableBody>
            <PadRow height={win.topPad} />
            {shown.slice(win.start, win.end).map((e) =>
              e.kind === 'row' ? (
                <GapTableRow key={e.key} row={e.row} open={open === e.row.name} verdict={verdicts[e.row.name] ?? 'unchecked'} onToggle={onToggle} depth={e.depth} done={done.has(doneKey(e.row))} chipContext={chipContext} work={work} held={gapHeld(e.row, holding)} />
              ) : (
                <GroupRow key={e.key} entry={e} folded={folded.has(e.key)} onFold={onFold} pageText={pageText} />
              )
            )}
            <PadRow height={win.bottomPad} />
          </TableBody>
        </Table>
      </Box>
    </Stack>
  )
}
