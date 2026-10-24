// GlobalPaste — a picture pasted or dropped anywhere in the main window, or put in the picture inbox
// (owner, 2026-10-23: "I should be able to paste quest images in ANYWHERE"; "i don't want to have to
// REPASTE the images I already gave you"). Mounted once, beside the Gaps overlay feed; a row's own paste
// box, when one is open, keeps its paste. Where pictures come from is usePictures.ts, reading and routing
// pictureIntake.ts; this draws the note: where it went, Undo, Move, a nameplate's Save, Unsorted.

import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import { Button, Menu, MenuItem, Snackbar } from '@mui/material'
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
    </>
  )
}

export default function GlobalPaste(): JSX.Element {
  const [note, setNote] = useState<Outcome | null>(null)
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const journals = useQuestJournals()
  const journalsRef = useRef(journals)
  useEffect(() => {
    journalsRef.current = journals
  }, [journals])
  const show = useCallback((o: Outcome | null) => setNote(o), [])
  const enqueue = usePictureQueue(journalsRef, show)
  usePictureInbox(enqueue)
  usePasteAndDrop(enqueue)
  useReroute(journalsRef)

  const move = note?.move
  const sticky = note?.kind === 'unsorted' || note?.kind === 'nameplate'
  return (
    <>
      <Snackbar
        open={note !== null}
        message={note?.text}
        action={<NoteActions note={note} unsorted={journals[UNSORTED]?.popups?.length ?? 0} onMove={setMenu} onNote={show} />}
        autoHideDuration={sticky ? null : 8000}
        onClose={(_e, why) => why !== 'clickaway' && setNote(null)}
        data-testid="paste-note"
      />
      <Menu open={menu !== null} anchorEl={menu} onClose={() => setMenu(null)}>
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
