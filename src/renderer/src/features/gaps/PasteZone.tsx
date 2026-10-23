// PasteZone — the dashed "click here and paste" box the Gaps row's screenshot panels share (owner,
// 2026-10-21): a click reads the clipboard, Ctrl+V works anywhere while the row is open, a file can be
// dropped on it.

import { type JSX, type ReactNode, useCallback, useEffect, useState } from 'react'
import { Button, ButtonBase, CircularProgress, Stack, Typography } from '@mui/material'

/** The picture on the clipboard event or in the dropped files, as PNG/JPEG bytes. */
async function pictureFrom(items: DataTransferItemList | null, files: FileList | null): Promise<Uint8Array | null> {
  const file = [...(items ?? [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile() ?? [...(files ?? [])].find((f) => f.type.startsWith('image/'))
  return file === undefined || file === null ? null : new Uint8Array(await file.arrayBuffer())
}

/** Why a drop gave nothing to read, in the player's words. */
const DROPPED_NONE = 'What was dropped is not a picture file: drop a PNG or JPEG, or snip with Win+Shift+S and click here.'
const DROPPED_LINK = 'A picture dragged from a web page arrives as a link, not the picture: save it and drop the file, or copy the image and click here.'

/** A paste in a text box is the player's typing, not a screenshot. */
const typingIn = (t: EventTarget | null): boolean => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA'].includes(t.tagName))

/** The dashed box: click reads the clipboard, Ctrl+V anywhere while the row is open, or a drop. */
export function PasteZone({ label, busy, onPicture }: { label: string; busy: boolean; onPicture: (png: Uint8Array) => void }): JSX.Element {
  const [note, setNote] = useState<string | null>(null)
  const take = useCallback(
    (png: Uint8Array | null) => {
      // A paste while the last one is still being read is ignored (review, 2026-10-21: a window paste
      // then a Lore paste inside the OCR time lost one of them).
      if (busy) return
      setNote(png === null ? 'No image on the clipboard: snip one with Win+Shift+S first.' : null)
      if (png !== null) onPicture(png)
    },
    [onPicture, busy]
  )
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      if (typingIn(e.target)) return
      void pictureFrom(e.clipboardData?.items ?? null, null).then((png) => png !== null && take(png))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [take])
  return (
    <ButtonBase
      onClick={() => void window.eq.shotClipboard().then(take).catch(() => setNote('Could not read the clipboard.'))}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const fromPage = e.dataTransfer.types.includes('text/uri-list')
        void pictureFrom(e.dataTransfer.items, e.dataTransfer.files).then((png) => {
          if (png !== null) take(png)
          else if (!busy) setNote(fromPage ? DROPPED_LINK : DROPPED_NONE)
        })
      }}
      disabled={busy}
      sx={{ display: 'block', width: '100%', textAlign: 'left', border: '1px dashed', borderColor: 'warning.main', borderRadius: 1, px: 1.5, py: 0.75 }}
      data-testid="gaps-shot-zone"
    >
      <Stack direction="row" spacing={1} alignItems="center">
        {busy && <CircularProgress size={14} />}
        <Typography variant="body2">{busy ? 'Reading…' : label}</Typography>
        <Typography variant="caption" color="text.secondary">
          (snip: Win+Shift+S)
        </Typography>
      </Stack>
      {note !== null && (
        <Typography variant="caption" color="warning.main" component="div">
          {note}
        </Typography>
      )}
    </ButtonBase>
  )
}

export function Line({ children, warn = false }: { children: ReactNode; warn?: boolean }): JSX.Element {
  return (
    <Typography variant="caption" color={warn ? 'warning.main' : 'text.secondary'} component="div">
      {children}
    </Typography>
  )
}

/**
 * Where the pasted picture was kept (owner, 2026-10-22: item and spell pictures under the picture
 * root's item and spell folders), one quiet line with Open folder; nothing when none was kept.
 */
export function KeptPicture({ path }: { path: string | null }): JSX.Element | null {
  if (path === null) return null
  return (
    <Stack direction="row" spacing={1} alignItems="center" data-testid="gaps-shot-kept-picture">
      <Line>Picture saved to {path}.</Line>
      <Button size="small" onClick={() => void window.eq.shotSavedFile('show', path).catch(() => false)}>
        Open folder
      </Button>
    </Stack>
  )
}

/**
 * A window whose name is another row's, or whose name was not read (item or spell): nothing is kept
 * until the player says (owner, 2026-10-21). `note` says which (shared/itemShotKeep.ts otherItemNote).
 */
export function WrongItem({ note, onUse, onDiscard }: { note: string; onUse: () => void; onDiscard: () => void }): JSX.Element {
  return (
    <Stack direction="row" spacing={1} alignItems="center" data-testid="gaps-shot-wrong-item">
      <Line warn>{note}</Line>
      <Button size="small" onClick={onUse}>
        Use it anyway
      </Button>
      <Button size="small" onClick={onDiscard}>
        Discard
      </Button>
    </Stack>
  )
}
