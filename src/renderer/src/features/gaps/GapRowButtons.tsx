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
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { removeCapturedItem } from './capturedItemsStore'
import NoteAddIcon from '@mui/icons-material/NoteAdd'
import SearchIcon from '@mui/icons-material/Search'
import { GAP_CAPTURE, mobPageOf, onMobPage, wikiCreateUrl, wikiEditUrl, wikiSearchUrl, type GapRow } from '@shared/gaps'
import { forageButtons } from '@shared/gapForage'
import { copyText } from '../../lib/clipboard'
import { Tooltip } from '../../lib/Tooltip'
import { existingEditor } from '@shared/gapExistingPage'
import { wikiPageUrl } from '@shared/gapUrls'
import { questPageTitle } from '@shared/gapQuests'
import { readGapVerdict } from '../../lib/gapVerdicts'

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

/**
 * Whether the wiki already has the row's page, so its text is a draft to take fields from, never one to
 * paste over the page (pre-release review, 2026-10-23). A forage row (another branch) copies only the
 * lines to add, so it is no draft.
 */
function pageExists(row: GapRow): boolean {
  if ((row as { forageUpdate?: unknown }).forageUpdate !== undefined) return false
  return existingEditor(row, readGapVerdict(row.domain, row.name)) !== undefined
}

/** The Copy button's words and tip for a row. */
function copyWords(row: GapRow): { label: string; tip: string } {
  if (row.forageUpdate !== undefined) return { label: 'Copy wiki page', tip: forageButtons(row.forageUpdate).copyTip }
  if (row.suggest !== undefined && (row.domain === 'item' || row.domain === 'spell')) {
    return { label: 'Copy redirect', tip: `A redirect from the game's spelling to ${row.suggest.page}, so both spellings reach one page.` }
  }
  if (row.domain === 'notice') return { label: 'Copy proof', tip: 'What your log proves (how often, when, where, the lines), for the talk page or the edit summary.' }
  const tip = `Wiki markup from what your log saw. ${GAP_CAPTURE[row.domain]}`
  if (!pageExists(row)) return { label: 'Copy wiki page', tip }
  return { label: 'Copy draft (page exists)', tip: `The wiki already has this page: copy only the fields it lacks from this draft. Pasting all of it replaces what people wrote there. ${tip}` }
}

/** A new wiki page for the row, built from what the log saw (shared/wikiPage.ts), onto the clipboard. */
function CopyPageButton({ text, row, compact }: { text: () => string; row: GapRow; compact: boolean }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const words = copyWords(row)
  const icon = copied && compact ? <DoneIcon fontSize="small" color="success" /> : <ContentCopyIcon fontSize="small" />
  return <ActionButton compact={compact} label={copied ? 'Copied' : words.label} tip={words.tip} icon={icon} onClick={() => void copyText(text()).then(setCopied)} testId="gaps-copy-page" />
}

/** The page the editor opens and its button's words: a page that exists, or a new one. */
function editorOf(row: GapRow): { target: string; create: string; existing: boolean; view?: boolean } {
  if (row.forageUpdate !== undefined) {
    const f = forageButtons(row.forageUpdate)
    return { target: f.page, create: f.edit, existing: true }
  }
  // A notice row's page exists: it is edited, the notice off (owner, 2026-10-22).
  if (row.domain === 'notice') return { target: row.page ?? row.name, create: 'Edit page', existing: true }
  if (onMobPage(row)) return { target: mobPageOf(row), create: 'Edit mob page', existing: true }
  // A quest: its page from the catalog when the wiki has one, else a new page under the wiki's spelling.
  if (row.domain === 'quest') return row.page === undefined ? { target: questPageTitle(row.name), create: 'Create page', existing: false } : { target: row.page, create: 'Edit page', existing: true }
  // A page the lookup found under other capitals or as free text is edited, never made twice
  // (owner, 2026-10-22: Drake lava powder; gapExistingPage.ts).
  const found = existingEditor(row, readGapVerdict(row.domain, row.name))
  if (found !== undefined) return found
  return { target: row.name, create: row.suggest !== undefined ? 'Create redirect' : 'Create page', existing: false }
}

/**
 * Into the wiki in one click: its search, and its editor on a new page of this name; for a faction
 * row, the editor on the mob page the faction belongs on; for a forage update, the item's own page.
 */
function WikiLinks({ row, compact }: { row: GapRow; compact: boolean }): JSX.Element {
  const { target, create, existing, view = false } = editorOf(row)
  return (
    <>
      <ActionButton compact={compact} label="Search wiki" tip={`The wiki's search for ${target}.`} icon={<SearchIcon fontSize="small" />} href={wikiSearchUrl(target)} testId="gaps-wiki-search" />
      <ActionButton
        compact={compact}
        label={create}
        tip={view ? `The wiki's page ${target}: it exists, so add to it from its Edit tab.` : existing ? `The wiki's editor on ${target}.` : `The wiki's editor on a new page named ${target}.`}
        icon={<NoteAddIcon fontSize="small" />}
        href={view ? wikiPageUrl(target) : existing ? wikiEditUrl(target) : wikiCreateUrl(target)}
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

/**
 * A captured item's Remove, in the details pane only (owner, 2026-10-23): a capture that misread the
 * name made a row of its own. The log's and the export's rows for the item stay.
 */
function RemoveCaptureButton({ row }: { row: GapRow }): JSX.Element | null {
  if (!row.kinds.includes('captured')) return null
  return (
    <ActionButton
      compact={false}
      label="Remove capture"
      tip="Forget this capture (a misread name, say). The item's log and inventory rows stay."
      icon={<DeleteOutlineIcon fontSize="small" />}
      onClick={() => removeCapturedItem(row.name)}
      testId="gaps-remove-capture"
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
      {!compact && <RemoveCaptureButton row={row} />}
    </>
  )
  if (!compact) return buttons
  return (
    <Stack direction="row" sx={{ flexWrap: 'nowrap' }} data-testid="gaps-row-buttons">
      {buttons}
    </Stack>
  )
}
