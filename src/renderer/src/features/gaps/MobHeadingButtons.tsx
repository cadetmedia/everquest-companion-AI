// A mob heading's work buttons in the grouped Gaps list, in the order a row's icons read: Copy lines
// (every missing line under it, for one edit of the page), Search wiki, Edit mob page, and Done for
// every row under it (owner ask, 2026-10-21: "put the search and mark DONE on the parent mob line
// here so I don't have to expand the mob to mark it done if I copied all items at once from the mob
// level"). Copy lines and Edit mob page show only over a page's own lines (drops, factions); Search
// and Done show on every mob heading.
//
// A heading click folds it, so every button stops its click there.

import { type JSX, type MouseEvent, useState } from 'react'
import { Box, Button } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DoneIcon from '@mui/icons-material/Done'
import NoteAddIcon from '@mui/icons-material/NoteAdd'
import SearchIcon from '@mui/icons-material/Search'
import UndoIcon from '@mui/icons-material/Undo'
import { allDone, mobPageOf, onMobPage, wikiEditUrl, wikiSearchUrl, type GapRow } from '@shared/gaps'
import { copyText } from '../../lib/clipboard'
import { Tooltip } from '../../lib/Tooltip'

const stop = (e: MouseEvent): void => e.stopPropagation()
const BUTTON_SX = { ml: 1, py: 0 } as const

/** A mob heading's one copy of every missing line under it, for one edit of that page (owner ask, 2026-10-18). */
function CopyLinesButton({ text }: { text: () => string }): JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      size="small"
      startIcon={<ContentCopyIcon />}
      onClick={(e) => {
        stop(e)
        void copyText(text()).then(setCopied)
      }}
      sx={BUTTON_SX}
      data-testid="gaps-copy-lines"
    >
      {copied ? 'Copied' : 'Copy lines'}
    </Button>
  )
}

/** A link button to the wiki, in a new window. */
function WikiButton({ href, tip, label, icon, testId }: { href: string; tip: string; label: string; icon: JSX.Element; testId: string }): JSX.Element {
  return (
    <Tooltip title={tip}>
      <Button size="small" startIcon={icon} href={href} target="_blank" rel="noreferrer" onClick={stop} sx={BUTTON_SX} data-testid={testId}>
        {label}
      </Button>
    </Tooltip>
  )
}

/** Every row under the mob marked done, or, when every one already is, every mark cleared. */
function DoneAllButton({ mob, rows, done, onDoneAll }: { mob: string; rows: readonly GapRow[]; done: ReadonlySet<string>; onDoneAll: (rows: readonly GapRow[], on: boolean) => void }): JSX.Element {
  const every = allDone(rows, done)
  const tip = every ? `Show every line under ${mob} with the open rows again.` : `Mark every line under ${mob} done; "Show done" brings them back.`
  return (
    <Tooltip title={tip}>
      <Button
        size="small"
        startIcon={every ? <UndoIcon /> : <DoneIcon />}
        onClick={(e) => {
          stop(e)
          onDoneAll(rows, !every)
        }}
        sx={BUTTON_SX}
        data-testid="gaps-mob-done"
      >
        {every ? 'Not done' : 'Done'}
      </Button>
    </Tooltip>
  )
}

export default function MobHeadingButtons({
  mob,
  rows,
  pageText,
  done,
  onDoneAll
}: {
  mob: string
  rows: readonly GapRow[]
  pageText: (row: GapRow) => string
  done: ReadonlySet<string>
  onDoneAll: (rows: readonly GapRow[], on: boolean) => void
}): JSX.Element {
  const lines = rows.length > 0 && rows.every(onMobPage) ? rows : null
  // Over a page's lines the page is the one they belong on; otherwise the mob as the log names it.
  const page = lines?.[0] !== undefined ? mobPageOf(lines[0]) : mob
  return (
    <Box component="span" sx={{ ml: 1 }}>
      {lines !== null && <CopyLinesButton text={() => lines.map(pageText).join('')} />}
      <WikiButton href={wikiSearchUrl(page)} tip={`The wiki's search for ${page}.`} label="Search wiki" icon={<SearchIcon />} testId="gaps-mob-search" />
      {lines !== null && <WikiButton href={wikiEditUrl(page)} tip={`The wiki's editor on ${page}.`} label="Edit mob page" icon={<NoteAddIcon />} testId="gaps-edit-mob-page" />}
      <DoneAllButton mob={mob} rows={rows} done={done} onDoneAll={onDoneAll} />
    </Box>
  )
}
