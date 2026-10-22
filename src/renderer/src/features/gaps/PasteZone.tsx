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
        void pictureFrom(e.dataTransfer.items, e.dataTransfer.files).then(take)
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

/** A window whose name is another row's (item or spell): nothing is kept until the player says (owner, 2026-10-21). */
export function WrongItem({ read, row, onUse, onDiscard }: { read: string; row: string; onUse: () => void; onDiscard: () => void }): JSX.Element {
  return (
    <Stack direction="row" spacing={1} alignItems="center" data-testid="gaps-shot-wrong-item">
      <Line warn>
        This window is “{read}”, not {row}.
      </Line>
      <Button size="small" onClick={onUse}>
        Use it anyway
      </Button>
      <Button size="small" onClick={onDiscard}>
        Discard
      </Button>
    </Stack>
  )
}
