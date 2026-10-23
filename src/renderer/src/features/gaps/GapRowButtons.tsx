// A row's work buttons: copy its page, search the wiki, create (or edit) its page, mark it done. The
// details pane shows them with their words; each row shows the same buttons as icons alone, so an item
// can be worked without opening its details (owner ask, 2026-10-19). One component per action serves
// both, so the two never disagree on a label, a link or a tooltip.
//
// A row click opens the details, so every compact button stops its click there.

import { type JSX, type MouseEvent, type ReactNode, useState } from 'react'
import { Button, IconButton, Stack } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DoneIcon from '@mui/icons-material/Done'
import UndoIcon from '@mui/icons-material/Undo'
import NoteAddIcon from '@mui/icons-material/NoteAdd'
import SearchIcon from '@mui/icons-material/Search'
import { GAP_CAPTURE, mobPageOf, onMobPage, wikiCreateUrl, wikiEditUrl, wikiSearchUrl, type GapRow } from '@shared/gaps'
import { copyText } from '../../lib/clipboard'
import { Tooltip } from '../../lib/Tooltip'

const stop = (e: MouseEvent): void => e.stopPropagation()

/** One action as a worded button (details pane) or an icon with its words in the tooltip (row). */
function ActionButton({
  compact,
  label,
  tip,
  icon,
  href,
  onClick,
  testId
}: {
  compact: boolean
  label: string
  tip: string
  icon: ReactNode
  href?: string
  onClick?: () => void
  testId: string
}): JSX.Element {
  const link = href === undefined ? {} : { href, target: '_blank', rel: 'noreferrer' }
  if (!compact) {
    return (
      <Tooltip title={tip}>
        <Button size="small" startIcon={icon} onClick={onClick} {...link} data-testid={testId}>
          {label}
        </Button>
      </Tooltip>
    )
  }
  return (
    <Tooltip title={`${label}: ${tip}`}>
      <IconButton
        size="small"
        aria-label={label}
        sx={{ p: 0.25 }}
        onClick={(e) => {
          stop(e)
          onClick?.()
        }}
        {...link}
        data-testid={`${testId}-icon`}
      >
        {icon}
      </IconButton>
    </Tooltip>
  )
}

/** A new wiki page for the row, built from what the log saw (shared/wikiPage.ts), onto the clipboard. */
function CopyPageButton({ text, row, compact }: { text: () => string; row: GapRow; compact: boolean }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const redirect = row.suggest !== undefined && (row.domain === 'item' || row.domain === 'spell')
  const notice = row.domain === 'notice'
  const tip = redirect
    ? `A redirect from the game's spelling to ${row.suggest?.page ?? ''}, so both spellings reach one page.`
    : notice
      ? 'What your log proves (how often, when, where, the lines), for the talk page or the edit summary.'
      : `Wiki markup from what your log saw. ${GAP_CAPTURE[row.domain]}`
  const label = copied ? 'Copied' : redirect ? 'Copy redirect' : notice ? 'Copy proof' : 'Copy wiki page'
  const icon = copied && compact ? <DoneIcon fontSize="small" color="success" /> : <ContentCopyIcon fontSize="small" />
  return <ActionButton compact={compact} label={label} tip={tip} icon={icon} onClick={() => void copyText(text()).then(setCopied)} testId="gaps-copy-page" />
}

/**
 * Into the wiki in one click: its search, and its editor on a new page of this name; for a faction
 * row, the editor on the mob page the faction belongs on.
 */
function WikiLinks({ row, compact }: { row: GapRow; compact: boolean }): JSX.Element {
  // A notice row's page exists: it is edited, the notice off (owner, 2026-10-22).
  const notice = row.domain === 'notice'
  const faction = onMobPage(row) || notice
  const target = notice ? (row.page ?? row.name) : faction ? mobPageOf(row) : row.name
  const redirect = !faction && row.suggest !== undefined
  const create = notice ? 'Edit page' : faction ? 'Edit mob page' : redirect ? 'Create redirect' : 'Create page'
  return (
    <>
      <ActionButton compact={compact} label="Search wiki" tip={`The wiki's search for ${target}.`} icon={<SearchIcon fontSize="small" />} href={wikiSearchUrl(target)} testId="gaps-wiki-search" />
      <ActionButton
        compact={compact}
        label={create}
        tip={faction ? `The wiki's editor on ${target}.` : `The wiki's editor on a new page named ${target}.`}
        icon={<NoteAddIcon fontSize="small" />}
        href={faction ? wikiEditUrl(target) : wikiCreateUrl(target)}
        testId="gaps-wiki-create"
      />
    </>
  )
}

function DoneButton({ isDone, onDone, compact }: { isDone: boolean; onDone: () => void; compact: boolean }): JSX.Element {
  return (
    <ActionButton
      compact={compact}
      label={isDone ? 'Not done' : 'Done'}
      tip={isDone ? 'Show it with the open rows again.' : 'Hide it until the wiki data catches up; "Show done" brings it back.'}
      icon={isDone ? <UndoIcon fontSize="small" /> : <DoneIcon fontSize="small" />}
      onClick={onDone}
      testId="gaps-done"
    />
  )
}

/** The four work buttons, worded in the details pane, icons on a row. */
export default function GapRowButtons({
  row,
  pageText,
  isDone,
  onDone,
  compact = false
}: {
  row: GapRow
  pageText: (row: GapRow) => string
  isDone: boolean
  onDone: (row: GapRow) => void
  compact?: boolean
}): JSX.Element {
  const buttons = (
    <>
      <CopyPageButton key={row.name} text={() => pageText(row)} row={row} compact={compact} />
      <WikiLinks row={row} compact={compact} />
      <DoneButton isDone={isDone} onDone={() => onDone(row)} compact={compact} />
    </>
  )
  if (!compact) return buttons
  return (
    <Stack direction="row" sx={{ flexWrap: 'nowrap' }} data-testid="gaps-row-buttons">
      {buttons}
    </Stack>
  )
}
