// ShotPanel — a screenshot box in a gap row's details (owner ask, 2026-10-21: "a (click here to add
// screenshot) in the DETAILS section ... as easy as possible"). Snip with Win+Shift+S, then click the
// box (it reads the clipboard), press Ctrl+V while the row is open, or drop a file on it.
//
// Items: main reads the window on this machine (src/main/ipc/shotIpc.ts) into the page's statsblock,
// icon id and Value; the player checks and edits, and Copy wiki page uses what is kept
// (itemShotsStore.ts). Mobs and Images: the picture is saved under the wiki's file name, with the
// wiki's upload form one click away.

import { type JSX, type ReactNode, useCallback, useEffect, useState } from 'react'
import { Box, Button, ButtonBase, CircularProgress, Stack, TextField, Typography } from '@mui/material'
import { wikiUploadUrl, type GapRow } from '@shared/gaps'
import type { ItemShotReply } from '@shared/itemWindow'
import { formatCoin } from '@shared/gaps'
import { npcImageName } from '@shared/wikiPage'
import { setItemShot, useItemShots, type StoredShot } from './itemShotsStore'

/** The picture on the clipboard event or in the dropped files, as PNG/JPEG bytes. */
async function pictureFrom(items: DataTransferItemList | null, files: FileList | null): Promise<Uint8Array | null> {
  const file = [...(items ?? [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile() ?? [...(files ?? [])].find((f) => f.type.startsWith('image/'))
  return file === undefined || file === null ? null : new Uint8Array(await file.arrayBuffer())
}

/** A paste in a text box is the player's typing, not a screenshot. */
const typingIn = (t: EventTarget | null): boolean => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA'].includes(t.tagName))

/** The dashed box: click reads the clipboard, Ctrl+V anywhere while the row is open, or a drop. */
function PasteZone({ label, busy, onPicture }: { label: string; busy: boolean; onPicture: (png: Uint8Array) => void }): JSX.Element {
  const [note, setNote] = useState<string | null>(null)
  const take = useCallback(
    (png: Uint8Array | null) => {
      setNote(png === null ? 'No picture on the clipboard. Snip one with Win+Shift+S first.' : null)
      if (png !== null) onPicture(png)
    },
    [onPicture]
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
      onClick={() => void window.eq.shotClipboard().then(take)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        void pictureFrom(e.dataTransfer.items, e.dataTransfer.files).then(take)
      }}
      disabled={busy}
      sx={{ display: 'block', width: '100%', textAlign: 'left', border: '1px dashed', borderColor: 'warning.main', borderRadius: 1, px: 1.5, py: 1 }}
      data-testid="gaps-shot-zone"
    >
      <Stack direction="row" spacing={1} alignItems="center">
        {busy && <CircularProgress size={14} />}
        <Typography variant="body2">{busy ? 'Reading…' : label}</Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" component="div">
        Snip it with Win+Shift+S, then click here (or press Ctrl+V, or drop the file here).
      </Typography>
      {note !== null && (
        <Typography variant="caption" color="warning.main" component="div">
          {note}
        </Typography>
      )}
    </ButtonBase>
  )
}

/** One icon choice, drawn from the install's own sheets. */
function IconChoice({ id, picked, onPick }: { id: number; picked: boolean; onPick: () => void }): JSX.Element {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void window.eq.shotIcon(id).then((u) => live && setSrc(u))
    return () => {
      live = false
    }
  }, [id])
  return (
    <ButtonBase onClick={onPick} sx={{ flexDirection: 'column', p: 0.5, borderRadius: 1, border: '2px solid', borderColor: picked ? 'success.main' : 'transparent' }} data-testid="gaps-shot-icon">
      {src === null ? <Box sx={{ width: 40, height: 40 }} /> : <img src={src} width={40} height={40} alt={`icon ${String(id)}`} />}
      <Typography variant="caption">{id}</Typography>
    </ButtonBase>
  )
}

function Line({ children, warn = false }: { children: ReactNode; warn?: boolean }): JSX.Element {
  return (
    <Typography variant="caption" color={warn ? 'warning.main' : 'text.secondary'} component="div">
      {children}
    </Typography>
  )
}

const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** What one reading adds to what is kept: a Lore tab adds its text, a Description tab the rest. */
function merged(kept: StoredShot | undefined, r: ItemShotReply): StoredShot {
  const icon = r.icons[0]?.id ?? kept?.iconId
  const base: StoredShot = { ...kept, at: new Date().toISOString() }
  if (r.read.lore !== undefined && r.read.statsblock === '') return { ...base, lore: r.read.lore }
  return {
    ...base,
    ...(r.read.statsblock === '' ? {} : { statsblock: r.read.statsblock }),
    ...(icon === undefined ? {} : { iconId: icon }),
    ...(r.read.valueCopper === undefined ? {} : { valueCopper: r.read.valueCopper }),
    ...(r.read.focusEffect === undefined ? {} : { focusEffect: r.read.focusEffect })
  }
}

/** What the last read says about itself: an error, another item's window, what it corrected or doubts. */
function ReadNotes({ row, reply }: { row: GapRow; reply: ItemShotReply }): JSX.Element {
  const otherName = reply.read.name !== undefined && squash(reply.read.name) !== squash(row.name)
  const notes = [
    ...(reply.error === undefined ? [] : [reply.error]),
    ...(otherName ? [`This window reads “${reply.read.name ?? ''}”, not ${row.name}: check it is the right item.`] : []),
    ...(reply.read.checks ?? []),
    ...(reply.iconNote === undefined ? [] : [reply.iconNote])
  ]
  return (
    <>
      {notes.map((n) => (
        <Line key={n} warn>
          {n}
        </Line>
      ))}
    </>
  )
}

/** The icon choices: the last read's matches, best first, or the one kept. */
function IconPicker({ row, kept, reply }: { row: GapRow; kept: StoredShot; reply: ItemShotReply | null }): JSX.Element | null {
  const icons = reply?.icons.map((h) => h.id) ?? (kept.iconId === undefined ? [] : [kept.iconId])
  if (icons.length === 0) return null
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
      <Line>Icon (lucy_img_ID), best match first; click to choose:</Line>
      {icons.map((id) => (
        <IconChoice key={id} id={id} picked={kept.iconId === id} onPick={() => setItemShot(row.name, { ...kept, iconId: id })} />
      ))}
    </Stack>
  )
}

/** The kept reading: the icon picker, Value, focus, lore, the editable statsblock, and Forget. */
function KeptShot({ row, kept, reply }: { row: GapRow; kept: StoredShot; reply: ItemShotReply | null }): JSX.Element {
  const unread = reply?.read.unread ?? []
  return (
    <>
      <IconPicker row={row} kept={kept} reply={reply} />
      {kept.valueCopper !== undefined && <Line>Value (merchant_value): {formatCoin(kept.valueCopper)}</Line>}
      {kept.focusEffect !== undefined && <Line>Focus effect: {kept.focusEffect}</Line>}
      <Line>{kept.lore === undefined ? "Paste the Lore tab too, for the page's Item Lore note." : `Lore: ${kept.lore}`}</Line>
      <TextField
        label="statsblock (check it against the window; Copy wiki page uses this)"
        multiline
        minRows={4}
        size="small"
        value={kept.statsblock ?? ''}
        onChange={(e) => setItemShot(row.name, { ...kept, statsblock: e.target.value })}
        slotProps={{ htmlInput: { style: { fontFamily: 'monospace', fontSize: 12 }, 'data-testid': 'gaps-shot-statsblock' } }}
      />
      {unread.length > 0 && <Line>Not placed: {unread.join(' · ')}</Line>}
      <Stack direction="row" spacing={1} alignItems="center">
        {reply !== null && <Line>Read in {(reply.ms / 1000).toFixed(1)} s, on this PC.</Line>}
        <Button size="small" onClick={() => setItemShot(row.name, null)} data-testid="gaps-shot-forget">
          Forget this screenshot
        </Button>
      </Stack>
    </>
  )
}

function ItemShot({ row }: { row: GapRow }): JSX.Element {
  const kept = useItemShots()[row.name]
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState<ItemShotReply | null>(null)
  const read = useCallback(
    (png: Uint8Array) => {
      setBusy(true)
      void window.eq.shotReadItem(png).then((r) => {
        setBusy(false)
        setReply(r)
        if (r.error === undefined) setItemShot(row.name, merged(kept, r))
      })
    },
    [row.name, kept]
  )
  return (
    <Stack spacing={0.75} data-testid="gaps-shot">
      <PasteZone label="Click here to add a screenshot of the item's window (its stats, icon and Value fill the page)" busy={busy} onPicture={read} />
      {reply !== null && <ReadNotes row={row} reply={reply} />}
      {kept !== undefined && <KeptShot row={row} kept={kept} reply={reply} />}
    </Stack>
  )
}

/** A mob's picture: saved under the wiki's file name, the upload form one click away. */
function MobPicture({ row }: { row: GapRow }): JSX.Element {
  const file = row.domain === 'image' && row.image !== undefined ? row.image : npcImageName(row.name)
  const [saved, setSaved] = useState<string | null>(null)
  const save = useCallback((png: Uint8Array) => void window.eq.shotSaveImage(png, file).then(setSaved), [file])
  return (
    <Stack spacing={0.5} data-testid="gaps-shot-picture">
      <PasteZone label={`Click here to add a picture of ${row.name}: it is saved as ${file}`} busy={false} onPicture={save} />
      {saved !== null && (
        <Stack direction="row" spacing={1} alignItems="center">
          <Line>Saved to {saved}.</Line>
          <Button size="small" href={wikiUploadUrl(file)} target="_blank" rel="noreferrer">
            Upload it to the wiki
          </Button>
        </Stack>
      )}
    </Stack>
  )
}

export default function ShotPanel({ row }: { row: GapRow }): JSX.Element | null {
  if (row.domain === 'item' && row.suggest === undefined) return <ItemShot key={row.name} row={row} />
  if (row.domain === 'image' || row.domain === 'mob' || row.domain === 'merchant') return <MobPicture key={row.name} row={row} />
  return null
}
