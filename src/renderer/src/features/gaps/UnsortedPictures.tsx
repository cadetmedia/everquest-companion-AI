// UnsortedPictures — the popups no quest claimed, in one list (owner, 2026-10-23: the note alone was the
// only way to reach them). Each can be moved to a quest or suggested chain, ranked by what it names, or
// removed. Inbox pictures that could not be read are listed too, each with "Read again" (owner, same
// day: spell windows and a Lore tab sat in failed/ with no way back). Opened from the paste note
// (GlobalPaste.tsx) and the Quests tab's line.

import { type JSX, useEffect, useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Menu, MenuItem, Stack, Typography } from '@mui/material'
import { rankPopup, type RouteHit } from '@shared/pasteRoute'
import { withoutPopup, type QuestPopup } from '@shared/questPopup'
import { questJournalByKey, setQuestJournal, useQuestJournals } from './itemShotsStore'
import { movePopup, targetsNow, UNSORTED, where } from './pictureIntake'
import { useFailedPictures } from './usePictures'

function Row({ popup }: { popup: QuestPopup }): JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [picks, setPicks] = useState<RouteHit[]>([])
  const first = popup.paragraphs.at(0)?.text ?? ''
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 0.5 }} data-testid="unsorted-picture">
      {popup.thumb !== undefined && <Box component="img" src={popup.thumb} alt="" sx={{ width: 48, height: 36, objectFit: 'cover', borderRadius: 0.5 }} />}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap>
          {popup.title}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap component="div">
          {first}
        </Typography>
      </Box>
      <Button
        size="small"
        onClick={(e) => {
          const at = e.currentTarget
          void targetsNow().then(({ hits }) => {
            setPicks(rankPopup(popup, hits).slice(0, 8))
            setAnchor(at)
          })
        }}
      >
        Move
      </Button>
      <Button
        size="small"
        color="inherit"
        onClick={() => {
          const was = questJournalByKey(UNSORTED)
          if (was !== undefined) setQuestJournal(UNSORTED, { ...was, popups: withoutPopup(was.popups, popup.title) })
        }}
      >
        Remove
      </Button>
      <Menu open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)}>
        {picks.length === 0 && <MenuItem disabled>No quest or chain yet</MenuItem>}
        {picks.map((h) => (
          <MenuItem
            key={h.key}
            onClick={() => {
              movePopup(popup, UNSORTED, h)
              setAnchor(null)
            }}
          >
            {where(h)}
          </MenuItem>
        ))}
      </Menu>
    </Stack>
  )
}

/** An inbox picture no reader took: its name, and a way back into the inbox. */
function FailedRow({ name }: { name: string }): JSX.Element {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 0.5 }} data-testid="failed-picture">
      <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
        {name}
      </Typography>
      <Button size="small" onClick={() => void window.eq.pictureInboxRetry(name)}>
        Read again
      </Button>
    </Stack>
  )
}

/** Opens the list from anywhere (the paste note's button, the Quests tab's line). */
let opener: (() => void) | null = null
export const openUnsorted = (): void => opener?.()

/** The Quests tab's standing way in: "3 pictures matched no quest. Open". Nothing when none wait. */
export function UnsortedLine(): JSX.Element | null {
  const n = useQuestJournals()[UNSORTED]?.popups?.length ?? 0
  const failed = useFailedPictures().length
  if (n === 0 && failed === 0) return null
  const parts = [n > 0 ? `${String(n)} picture${n === 1 ? '' : 's'} matched no quest.` : '', failed > 0 ? `${String(failed)} could not be read.` : '']
  return (
    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }} data-testid="unsorted-line">
      {parts.filter((p) => p !== '').join(' ')}{' '}
      <Button size="small" onClick={openUnsorted}>
        Open
      </Button>
    </Typography>
  )
}

export default function UnsortedPictures(): JSX.Element {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    opener = () => setOpen(true)
    return () => {
      opener = null
    }
  }, [])
  const popups = useQuestJournals()[UNSORTED]?.popups ?? []
  const failed = useFailedPictures()
  return (
    <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth data-testid="unsorted-dialog">
      <DialogTitle>Unsorted pictures</DialogTitle>
      <DialogContent dividers>
        {popups.length === 0 && failed.length === 0 && <Typography variant="body2">Nothing waiting.</Typography>}
        {popups.map((p) => (
          <Row key={p.title} popup={p} />
        ))}
        {failed.length > 0 && (
          <Typography variant="subtitle2" sx={{ mt: popups.length > 0 ? 2 : 0 }}>
            Could not be read
          </Typography>
        )}
        {failed.map((f) => (
          <FailedRow key={f} name={f} />
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setOpen(false)}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
