// QuestCopyDialog — Copy on a Quests row (owner, 2026-10-23: "implement the diff idea"). The click
// reads the quest's page off the wiki once; this shows that page with what the log adds marked, what
// was added in words, and anything the log says otherwise (shown, never changed), then copies it.
// No page on the wiki: the new-page draft. The read failed: the offline text, said so.

import { createContext, useCallback, useContext, useMemo, useState, type JSX, type ReactNode } from 'react'
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'
import type { GapRow } from '@shared/gaps'
import { questRowLiveCopy, type LiveQuestPage, type QuestLiveCopy } from '@shared/gapQuestMerge'
import type { RowFactContext } from '@shared/gapQuestPage'
import { questPageTitle } from '@shared/gapQuests'
import { wikiCreateUrl, wikiEditUrl } from '@shared/gapUrls'
import { copyText } from '../../lib/clipboard'
import { applyEditText } from '@shared/gapEdits'
import { noteQuestPage } from '../../lib/questLivePages'
import { useOwnCharacterNames } from './useOwnCharacters'

/** The page writers' merge for a row, from GapsView (its context: catalog, journal, the player's names). */
export type QuestCopyFn = (row: GapRow, live: LiveQuestPage | null) => QuestLiveCopy
export const QuestCopyContext = createContext<QuestCopyFn | null>(null)

/** The merge every quest Copy under it uses: the tab's page context, the player's names as Soandso. */
export function QuestCopyScope({ extras, children }: { extras: RowFactContext; children: ReactNode }): JSX.Element {
  const players = useOwnCharacterNames()
  const merge = useCallback<QuestCopyFn>((row, live) => questRowLiveCopy(row, live, { ...extras, players }), [extras, players])
  return <QuestCopyContext.Provider value={merge}>{children}</QuestCopyContext.Provider>
}

/** What the dialog is showing: still reading, or the wiki's answer (null: it could not be read). */
export type QuestRead = { state: 'reading' } | { state: 'read'; live: LiveQuestPage | null }

/** The one read, on the click: the row's page title, or the title a new page would take. */
export function readQuestPage(row: GapRow, onRead: (r: QuestRead) => void): void {
  onRead({ state: 'reading' })
  window.eq
    .gapQuestPage(row.page ?? questPageTitle(row.name))
    .then((live) => {
      if (live !== null && live.text.trim() !== '') noteQuestPage(row.name, live.title)
      onRead({ state: 'read', live })
    })
    .catch(() => onRead({ state: 'read', live: null }))
}

const LEAD: Record<QuestLiveCopy['kind'], (c: QuestLiveCopy) => string> = {
  merged: (c) => (c.changes.length === 0 ? 'The wiki page already has everything your log saw.' : 'The wiki page, plus what your log adds (green). Nothing removed.'),
  draft: () => 'The wiki has no page yet: a new page from your log.',
  offline: () => "Couldn't read the wiki: the copy from your log alone."
}

function PageText({ copy }: { copy: QuestLiveCopy }): JSX.Element {
  return (
    <Box component="pre" data-testid="quest-copy-text" sx={{ m: 0, p: 1, maxHeight: '50vh', overflow: 'auto', fontSize: 12, bgcolor: 'background.default', borderRadius: 1 }}>
      {copy.text.split('\n').map((line, i) => (
        <Box
          key={i}
          component="span"
          data-added={copy.added[i] ? 'true' : undefined}
          sx={{ display: 'block', minHeight: '1.2em', whiteSpace: 'pre-wrap', ...(copy.added[i] ? { bgcolor: 'rgba(76, 175, 80, 0.22)' } : {}) }}
        >
          {/* An empty line holds a no-break space so it reads (and selects) as the blank line the page has. */}
          {line === '' ? ' ' : line}
        </Box>
      ))}
    </Box>
  )
}

function Summary({ copy }: { copy: QuestLiveCopy }): JSX.Element {
  return (
    <Stack spacing={0.5} sx={{ mb: 1 }}>
      <Typography variant="body2">{LEAD[copy.kind](copy)}</Typography>
      {copy.changes.map((c) => (
        <Typography key={c} variant="caption" color="success.main" data-testid="quest-copy-change">
          + {c}
        </Typography>
      ))}
      {copy.notes.map((n) => (
        <Typography key={n} variant="caption" color="warning.main" data-testid="quest-copy-note">
          Check: {n}
        </Typography>
      ))}
    </Stack>
  )
}

export function QuestCopyDialog({ row, read, offline, onClose }: { row: GapRow; read: QuestRead; offline: () => string; onClose: () => void }): JSX.Element {
  const merge = useContext(QuestCopyContext)
  const [copied, setCopied] = useState(false)
  // Merged once per answer, not on every render (the Copied flag re-renders it).
  const copy = useMemo<QuestLiveCopy | undefined>(
    () => {
      if (read.state === 'reading') return undefined
      const made: QuestLiveCopy = merge !== null ? merge(row, read.live) : { kind: 'offline', title: row.name, text: offline(), added: [], changes: [], notes: [] }
      // The player's own corrections, written into what is shown and copied (shared/gapEdits.ts).
      return { ...made, text: applyEditText(made.text, row) }
    },
    [read, merge, row, offline]
  )
  const exists = copy?.kind === 'merged'
  const title = copy?.title ?? row.page ?? questPageTitle(row.name)
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth data-testid="quest-copy-dialog" onClick={(e) => e.stopPropagation()}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {copy === undefined ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <CircularProgress size={16} />
            <Typography variant="body2">Reading the wiki page…</Typography>
          </Stack>
        ) : (
          <>
            <Summary copy={copy} />
            <PageText copy={copy} />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button href={exists ? wikiEditUrl(title) : wikiCreateUrl(title)} target="_blank" rel="noreferrer" disabled={copy === undefined}>
          {exists ? 'Edit page' : 'Create page'}
        </Button>
        <Button
          variant="contained"
          disabled={copy === undefined}
          data-testid="quest-copy-copy"
          onClick={() => {
            if (copy !== undefined) void copyText(copy.text).then(setCopied)
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
