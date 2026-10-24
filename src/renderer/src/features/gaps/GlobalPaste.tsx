// GlobalPaste — a picture pasted or dropped anywhere in the main window, or put in the picture inbox
// (owner, 2026-10-23: "I should be able to paste quest images in ANYWHERE"; "i don't want to have to
// REPASTE the images I already gave you"). Mounted once, beside the Gaps overlay feed; a row's own paste
// box, when one is open, keeps its paste. Where pictures come from is usePictures.ts, reading and routing
// pictureIntake.ts; this draws the note: where it went, Undo, Move, a nameplate's Save, Unsorted.
// Owner, 2026-10-23: "the popup blocks me from seeing stuff under it and it never goes away". The note
// is small, bottom right off the rows, and always goes: after a few seconds (held while the pointer is
// on it), on its ✕, on Escape or on a click elsewhere. What it said stays reachable: Unsorted pictures
// from the Quests tab's line (UnsortedPictures.tsx), every picture in the dev log.

import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import { Button, IconButton, Menu, MenuItem, Snackbar } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { useQuestJournals } from './itemShotsStore'
import { movePopup, UNSORTED, where, type Outcome } from './pictureIntake'
import { usePasteAndDrop, usePictureInbox, usePictureQueue, useReroute } from './usePictures'
import UnsortedPictures, { openUnsorted } from './UnsortedPictures'

/** The note's buttons: a nameplate's Save (the player's click is the only save), Undo, Move, Unsorted. */
function NoteActions({ note, unsorted, onMove, onNote }: { note: Outcome | null; unsorted: number; onMove: (at: HTMLElement) => void; onNote: (o: Outcome | null) => void }): JSX.Element {
  const save = note?.save
  return (
    <>
      {save !== undefined && (
        <Button size="small" onClick={() => void save.run().then((text) => onNote({ kind: 'nameplate', text }))} data-testid="paste-save">
          {save.label}
        </Button>
      )}
      {note?.undo !== undefined && (
        <Button
          size="small"
          onClick={() => {
            note.undo?.()
            onNote(null)
          }}
          data-testid="paste-undo"
        >
          Undo
        </Button>
      )}
      {note?.move !== undefined && note.move.picks.length > 0 && (
        <Button size="small" onClick={(e) => onMove(e.currentTarget)} data-testid="paste-move">
          Move
        </Button>
      )}
      {note?.kind === 'unsorted' && unsorted > 0 && (
        <Button size="small" onClick={openUnsorted} data-testid="paste-unsorted">
          Unsorted ({unsorted})
        </Button>
      )}
      <IconButton size="small" aria-label="Close" onClick={() => onNote(null)} data-testid="paste-close">
        <CloseIcon fontSize="small" />
      </IconButton>
    </>
  )
}

/** How long a note stays: long enough to reach Undo or Save, never for good. */
const NOTE_MS = 8000

export default function GlobalPaste(): JSX.Element {
  const [note, setNote] = useState<Outcome | null>(null)
  // The Move menu keeps its own popup: a click on it closes the note (a click elsewhere).
  const [menu, setMenu] = useState<{ at: HTMLElement; move: NonNullable<Outcome['move']> } | null>(null)
  const closed = useRef(false)
  const journals = useQuestJournals()
  const journalsRef = useRef(journals)
  useEffect(() => {
    journalsRef.current = journals
  }, [journals])
  const show = useCallback((o: Outcome | null) => {
    if (o?.progress === true && closed.current) return
    if (o !== null && o.progress !== true) closed.current = false
    setNote(o)
  }, [])
  const enqueue = usePictureQueue(journalsRef, show)
  usePictureInbox(enqueue)
  usePasteAndDrop(enqueue)
  useReroute(journalsRef)

  const move = menu?.move
  return (
    <>
      <Snackbar
        open={note !== null}
        message={note?.text}
        action={<NoteActions note={note} unsorted={journals[UNSORTED]?.popups?.length ?? 0} onMove={(at) => note?.move !== undefined && setMenu({ at, move: note.move })} onNote={show} />}
        autoHideDuration={NOTE_MS}
        onClose={() => {
          closed.current = true
          setNote(null)
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        slotProps={{ content: { sx: { maxWidth: 420, py: 0, typography: 'body2' } } }}
        data-testid="paste-note"
      />
      <Menu open={menu !== null} anchorEl={menu?.at} onClose={() => setMenu(null)}>
        {(move?.picks ?? []).map((h) => (
          <MenuItem
            key={h.key}
            onClick={() => {
              if (move !== undefined) movePopup(move.popup, move.from, h)
              setMenu(null)
              setNote({ kind: 'quest', text: `Popup '${move?.popup.title ?? ''}' → ${where(h)}.` })
            }}
          >
            {where(h)}
          </MenuItem>
        ))}
      </Menu>
      <UnsortedPictures />
    </>
  )
}
