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
// FIXED LAYOUT (Malkil, 2026-10-20: the list "rapidly flashes between two spots on the scrollbar").
// An auto-layout table sizes its columns from the widest cell it can SEE, and a windowed table only
// sees a screenful. Scrolling a row with a long name cell (a "Probably ..." caption) into the
// overscan widened the table past its box, the horizontal scrollbar that appeared shortened the
// viewport, the shorter window dropped that row again, the scrollbar went, and the two layouts
// swapped every frame. `tableLayout: fixed` takes the widths from the header alone (`HEADERS`), as
// the Loot ledger and Gear tables do, every cell clips to one line, and a narrow window scrolls
// sideways against a stated `minWidth` that no row can change.
//
// ONE SCROLLER (owner feedback, 2026-10-12: "no scroll bar inside scroll bar"). The scroll box is
// the page's only scroller: it grows to the room the view's column leaves (`flexGrow: 1`) and may
// shrink below its content (`minHeight: 0`), exactly as the Loot ledger bounds its box, instead of
// a viewport-arithmetic cap that left the page scrolling beside it. The pane above it caps its own
// height modestly so the list keeps room on a short screen.

import { type JSX, type ReactNode, memo, useCallback, useMemo, useRef, useState } from 'react'
import { Box, Button, Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TableSortLabel, Typography } from '@mui/material'
import {
  charactersOff,
  doneKey,
  factionOf,
  gapZone,
  mobPageOf,
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
import { GAP_JOB_LABEL, GAP_JOB_TIP, gapJob, type GapJob } from '@shared/gapJob'
import { wikiPageUrl } from '@shared/wiki'
import { Tooltip } from '../../lib/Tooltip'
import { useWindowedRows } from '../../lib/useWindowedRows'
import GapActionChips from './GapActionChips'
import GapDetailsPanel from './GapDetailsPanel'
import GapRowButtons from './GapRowButtons'
import MobHeadingButtons from './MobHeadingButtons'

/** One line of small cells with a small chip: 6px padding above and below a 24px chip, plus the border. */
const ROW_HEIGHT = 37
const COLUMNS = 8
/** Below this the table scrolls sideways instead of squeezing Name to nothing; no row moves it. */
const TABLE_MIN_WIDTH = 1100
/** Every body cell: one line, clipped at its column's edge, so a cell can never widen the table. */
const CLIP = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const

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

/** The theme colour of each job's tag: two that no other chip on a row wears. */
const JOB_COLOR: Record<GapJob, 'secondary' | 'primary'> = { new: 'secondary', update: 'primary' }

/** Before the name (owner, 2026-10-21): "New page" or "Update page", the row's job (shared/gapJob.ts). */
function JobChip({ job }: { job: GapJob }): JSX.Element {
  return (
    <Tooltip title={GAP_JOB_TIP[job]}>
      <Chip label={GAP_JOB_LABEL[job]} size="small" color={JOB_COLOR[job]} variant="outlined" sx={{ mr: 1, height: 20 }} data-testid={`gaps-job-${job}`} />
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
      <TableCell sx={{ ...CLIP, fontWeight: 600, pl: depth > 0 ? 3 + depth * 2 : undefined }}>
        {depth > 0 && (
          <Box component="span" sx={{ color: 'text.secondary', mr: 1 }}>
            •
          </Box>
        )}
        <JobChip job={gapJob(row, chipContext)} />
        {/* Under its mob's heading a faction or drop row is the faction or item alone. */}
        {depth === 2 && onMobPage(row) ? factionOf(row) : row.name}
        {row.suggest !== undefined && <SuggestCaption s={row.suggest} />}
        {row.maybePlayer === true && <Chip label="may be a player" size="small" color="warning" variant="outlined" sx={{ ml: 1 }} data-testid="gaps-maybe-player" />}
        {held !== undefined && held.length > 0 && <HeldChip held={held} />}
      </TableCell>
      {/* Beside the name (owner, 2026-10-19): the work buttons where the eye already is. */}
      <TableCell sx={{ ...CLIP, py: 0 }}>
        <GapRowButtons row={row} pageText={work.pageText} isDone={done} onDone={work.onDone} compact />
      </TableCell>
      <TableCell sx={CLIP}>
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'nowrap' }}>
          {row.kinds.map((k) => (
            <Chip key={k} label={k} size="small" variant="outlined" />
          ))}
        </Stack>
      </TableCell>
      <TableCell sx={{ ...CLIP, color: 'text.secondary' }}>{gapZone(row)}</TableCell>
      <TableCell align="right" sx={CLIP}>{row.count.toLocaleString()}</TableCell>
      <TableCell sx={{ ...CLIP, color: 'text.secondary' }}>{row.first}</TableCell>
      <TableCell sx={{ ...CLIP, color: 'text.secondary' }}>{row.last}</TableCell>
      <TableCell sx={CLIP}>
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
      {row.suggest !== undefined && (
        <Typography variant="body2" color="text.secondary" component="div" data-testid="gaps-suggest-line">
          <SuggestCaption s={row.suggest} />
        </Typography>
      )}
      {row.noPage === true && (
        <Typography variant="body2" color="warning.main" component="div" data-testid="gaps-no-page-line">
          The wiki data has no page for {mobPageOf(row)}: a newer page may already list this. Check it before adding the line.
        </Typography>
      )}
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

/**
 * The table's columns: header text, the sort key, which side the cell aligns to, and its width (see
 * FIXED LAYOUT above). Pixels where the content is a known size (the dates, the count), percentages
 * where it varies; Name states none and takes what is left.
 */
const HEADERS: readonly (readonly [string, GapSortKey, 'left' | 'right', number | string | undefined])[] = [
  ['Name', 'name', 'left', undefined],
  ['Seen as', 'kinds', 'left', '10%'],
  ['Zone', 'zone', 'left', '20%'],
  ['Times', 'count', 'right', 80],
  ['First', 'first', 'left', 175],
  ['Last', 'last', 'left', 175],
  ['To do', 'todo', 'left', '15%']
]
/** Four 24 px icon buttons and the cell's padding. */
const WORK_WIDTH = 136

/** Every header sorts (owner asks, 2026-10-13 and, for Zone, 2026-10-17): a click picks the column, a second flips it. */
function SortHeader({ sort, onSort, nameLead }: { sort: GapSort; onSort: (key: GapSortKey) => void; nameLead?: ReactNode }): JSX.Element {
  return (
    <TableHead>
      <TableRow>
        {HEADERS.map(([label, key, align, width], i) => [
          <TableCell key={key} align={align} sortDirection={sort.key === key ? sort.dir : false} sx={{ width, whiteSpace: 'nowrap' }}>
            {i === 0 && nameLead}
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
            <TableCell key="work" sx={{ width: WORK_WIDTH, whiteSpace: 'nowrap' }}>
              Work
            </TableCell>
          ) : null
        ])}
      </TableRow>
    </TableHead>
  )
}

/** What a mob heading's buttons need (MobHeadingButtons): the page text, the Done marks and their setter. */
interface HeadingWork {
  pageText: (row: GapRow) => string
  done: ReadonlySet<string>
  onDoneAll: (rows: readonly GapRow[], on: boolean) => void
}

/** A zone or mob heading of the grouped list (shared/gapGroups.ts), one row high like the rest; a
 *  click folds what is under it (owner ask, 2026-10-18). A mob heading carries its work buttons:
 *  copy all its page lines, search, edit, Done for all (MobHeadingButtons). */
function GroupRow({
  entry,
  folded,
  onFold,
  work
}: {
  entry: Exclude<GapEntry, { kind: 'row' }>
  folded: boolean
  onFold: (key: string) => void
  work: HeadingWork
}): JSX.Element {
  const zone = entry.kind === 'zone'
  return (
    <TableRow
      onClick={() => onFold(entry.key)}
      sx={{ height: ROW_HEIGHT, cursor: 'pointer', bgcolor: zone ? 'action.selected' : 'action.hover' }}
      data-testid={`gaps-group-${entry.kind}`}
    >
      <TableCell colSpan={COLUMNS} sx={{ ...CLIP, fontWeight: zone ? 700 : 600, pl: zone ? 1 : 4 }}>
        <Box component="span" sx={{ color: 'text.secondary', mr: 1 }}>
          {folded ? '▸' : '▾'}
        </Box>
        {zone ? entry.zone : entry.mob}
        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          {entry.n} missing
        </Typography>
        {entry.kind === 'mob' && <MobHeadingButtons mob={entry.mob} rows={entry.rows} pageText={work.pageText} done={work.done} onDoneAll={work.onDoneAll} />}
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
  onDoneAll,
  onPlayer,
  holding,
  chipContext,
  seenBy,
  hiddenByFilter = false,
  folded,
  onFold,
  nameLead
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
  /** every row under a mob heading marked done, or cleared */
  onDoneAll: (rows: readonly GapRow[], on: boolean) => void
  onPlayer: (name: string) => void
  /** what the player holds right now (shared/gapHeld.ts): a chip on the row, a line in its details */
  holding: HeldIndex
  /** what the chips may say beyond the row (the data date, which names are mobs) */
  chipContext: GapActionContext
  /** the domain HAS unknown names, so an empty list means the search or zone filter hid them */
  hiddenByFilter?: boolean
  /** All characters: who saw each row, named in its details */
  seenBy?: ReadonlyMap<string, readonly string[]>
  /** the folded headings' keys, held by the view so its Collapse all and Expand all reach them */
  folded: ReadonlySet<string>
  onFold: (key: string) => void
  /** before the Name header's label: the grouped list's fold-all and order controls */
  nameLead?: ReactNode
}): JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  const onToggle = useCallback((name: string) => setOpen((cur) => (cur === name ? null : name)), [])
  const shown = useMemo(() => unfoldedEntries(entries, folded), [entries, folded])
  const work = useMemo<RowWork>(() => ({ pageText, onDone }), [pageText, onDone])
  const headingWork = useMemo<HeadingWork>(() => ({ pageText, done, onDoneAll }), [pageText, done, onDoneAll])
  const scrollRef = useRef<HTMLDivElement>(null)
  const win = useWindowedRows({ count: shown.length, rowHeight: ROW_HEIGHT, scrollRef })
  if (entries.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }} data-testid="gaps-empty">
        {hiddenByFilter
          ? 'No unknown names match the search or the filters.'
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
        <Table size="small" stickyHeader sx={{ tableLayout: 'fixed', minWidth: TABLE_MIN_WIDTH }} data-testid="gaps-table">
          <SortHeader sort={sort} onSort={onSort} nameLead={nameLead} />
          <TableBody>
            <PadRow height={win.topPad} />
            {shown.slice(win.start, win.end).map((e) =>
              e.kind === 'row' ? (
                <GapTableRow key={e.key} row={e.row} open={open === e.row.name} verdict={verdicts[e.row.name] ?? 'unchecked'} onToggle={onToggle} depth={e.depth} done={done.has(doneKey(e.row))} chipContext={chipContext} work={work} held={gapHeld(e.row, holding)} />
              ) : (
                <GroupRow key={e.key} entry={e} folded={folded.has(e.key)} onFold={onFold} work={headingWork} />
              )
            )}
            <PadRow height={win.bottomPad} />
          </TableBody>
        </Table>
      </Box>
    </Stack>
  )
}
