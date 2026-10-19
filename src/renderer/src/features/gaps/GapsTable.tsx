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
import SearchIcon from '@mui/icons-material/Search'
import { charactersOff, factionMob, factionOf, gapZone, onMobPage, wikiCreateUrl, wikiEditUrl, wikiSearchUrl, type GapRow, type GapSort, type GapSortKey, type GapSuggest, type GapVerdict, type GapVerdicts } from '@shared/gaps'
import { unfoldedEntries, type GapEntry } from '@shared/gapGroups'
import { wikiPageUrl } from '@shared/wiki'
import { copyText } from '../../lib/clipboard'
import { Tooltip } from '../../lib/Tooltip'
import { useWindowedRows } from '../../lib/useWindowedRows'
import GapActionChips from './GapActionChips'
import GapDetailsPanel from './GapDetailsPanel'

/** One line of small cells with a small chip: 6px padding above and below a 24px chip, plus the border. */
const ROW_HEIGHT = 37
const COLUMNS = 7

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

const GapTableRow = memo(function GapTableRow({
  row,
  open,
  verdict,
  onToggle,
  depth = 0
}: {
  row: GapRow
  open: boolean
  verdict: GapVerdict
  onToggle: (name: string) => void
  /** grouped: 1 under a zone, 2 under a mob, bulleted and indented below its heading */
  depth?: number
}): JSX.Element {
  return (
    <TableRow hover selected={open} onClick={() => onToggle(row.name)} sx={{ cursor: 'pointer', height: ROW_HEIGHT }} data-testid="gaps-row">
      <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap', pl: depth > 0 ? 3 + depth * 2 : undefined }}>
        {depth > 0 && (
          <Box component="span" sx={{ color: 'text.secondary', mr: 1 }}>
            •
          </Box>
        )}
        {/* Under its mob's heading a faction or drop row is the faction or item alone. */}
        {depth === 2 && onMobPage(row) ? factionOf(row) : row.name}
        {row.suggest !== undefined && <SuggestCaption s={row.suggest} />}
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
        <GapActionChips row={row} verdict={verdict} />
      </TableCell>
    </TableRow>
  )
})

/** A new wiki page for the row, built from what the log saw (shared/wikiPage.ts), onto the clipboard. */
function CopyPageButton({ text }: { text: () => string }): JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <Tooltip title="Wiki markup for a new page from what your log saw. Paste it into the wiki and add the stats from a screenshot.">
      <Button
        size="small"
        startIcon={<ContentCopyIcon />}
        onClick={() => void copyText(text()).then(setCopied)}
        data-testid="gaps-copy-page"
      >
        {copied ? 'Copied' : 'Copy wiki page'}
      </Button>
    </Tooltip>
  )
}

/**
 * Into the wiki in one click: its search, and its editor on a new page of this name; for a faction
 * row, the editor on the mob page the faction belongs on.
 */
function WikiLinks({ row }: { row: GapRow }): JSX.Element {
  const faction = onMobPage(row)
  const target = faction ? factionMob(row) : row.name
  return (
    <>
      <Button size="small" href={wikiSearchUrl(target)} target="_blank" rel="noreferrer" startIcon={<SearchIcon />} data-testid="gaps-wiki-search">
        Search wiki
      </Button>
      <Button
        size="small"
        href={faction ? wikiEditUrl(target) : wikiCreateUrl(target)}
        target="_blank"
        rel="noreferrer"
        startIcon={<NoteAddIcon />}
        data-testid="gaps-wiki-create"
      >
        {faction ? 'Edit mob page' : 'Create page'}
      </Button>
    </>
  )
}

/** The open row's details, above the list: capped so the list keeps room on a short screen. */
function DetailsPane({ row, pageText }: { row: GapRow; pageText: (row: GapRow) => string }): JSX.Element {
  return (
    <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, flexShrink: 0, maxHeight: '40vh', overflow: 'auto' }} data-testid="gaps-details-pane">
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="subtitle2">{row.name}</Typography>
        <CopyPageButton key={row.name} text={() => pageText(row)} />
        <WikiLinks row={row} />
      </Stack>
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
        {HEADERS.map(([label, key, align]) => (
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
          </TableCell>
        ))}
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
  hiddenByFilter = false
}: {
  /** the rows, or the grouped list with its zone and mob headings */
  entries: readonly GapEntry[]
  verdicts: GapVerdicts
  sort: GapSort
  onSort: (key: GapSortKey) => void
  /** the wiki page text for a row, for its Copy wiki page button */
  pageText: (row: GapRow) => string
  /** the domain HAS unknown names, so an empty list means the search or zone filter hid them */
  hiddenByFilter?: boolean
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
      {openedRow !== undefined && <DetailsPane row={openedRow} pageText={pageText} />}
      <Box ref={scrollRef} sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain' }} data-testid="gaps-scroll">
        <Table size="small" stickyHeader data-testid="gaps-table">
          <SortHeader sort={sort} onSort={onSort} />
          <TableBody>
            <PadRow height={win.topPad} />
            {shown.slice(win.start, win.end).map((e) =>
              e.kind === 'row' ? (
                <GapTableRow key={e.key} row={e.row} open={open === e.row.name} verdict={verdicts[e.row.name] ?? 'unchecked'} onToggle={onToggle} depth={e.depth} />
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
