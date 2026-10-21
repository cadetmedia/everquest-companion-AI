// ShotPanel — a screenshot box in a gap row's details (owner ask, 2026-10-21: "a (click here to add
// screenshot) in the DETAILS section ... as easy as possible"). Snip with Win+Shift+S, then click the
// box (it reads the clipboard), press Ctrl+V while the row is open, or drop a file on it.
//
// Items: main reads the window on this machine (src/main/ipc/shotIpc.ts) into the page's statsblock,
// icon id and Value; the player checks and edits, and Copy wiki page uses what is kept
// (itemShotsStore.ts). What a paste keeps follows shared/itemShotKeep.ts (owner, after testing): a
// nonsense image keeps nothing, another item's window waits for "Use it anyway", each part (the
// window, the Lore tab) shows whether it is filled and clears on its own. Mobs and Images: the
// picture is saved under the wiki's file name, with the wiki's upload form one click away.

import { type JSX, useCallback, useEffect, useState } from 'react'
import { Box, Button, ButtonBase, Chip, Stack, TextField, Typography } from '@mui/material'
import { formatCoin, type GapRow } from '@shared/gaps'
import type { ItemShotReply } from '@shared/itemWindow'
import { cleared, hasWindowPart, keptAfter, sameItem, shotKind, type ShotKind } from '@shared/itemShotKeep'
import type { ItemPageShot } from '@shared/wikiPage'
import { setItemShot, useItemShots, type StoredShot } from './itemShotsStore'
import { Line, PasteZone } from './PasteZone'
import MobPicture from './MobPicture'

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

/** Keep (or forget) an item's reading. */
const keep = (name: string, shot: ItemPageShot | null): void => setItemShot(name, shot)

/**
 * Which parts are filled, beside the paste box so they are always in view (owner, 2026-10-21): the
 * item window and its Lore tab, each with its own clear while it has something to clear.
 */
function Parts({ name, kept }: { name: string; kept: StoredShot | undefined }): JSX.Element {
  const windowIn = hasWindowPart(kept)
  const loreIn = kept?.lore !== undefined
  return (
    <Stack direction="row" spacing={1} alignItems="center" data-testid="gaps-shot-parts">
      {windowIn && kept !== undefined ? (
        <Chip size="small" color="success" label="Item window ✓" onDelete={() => keep(name, cleared(kept, 'window'))} title="Clear image data" data-testid="gaps-shot-clear-window" />
      ) : (
        <Chip size="small" variant="outlined" label="Item window: not pasted" />
      )}
      {loreIn && kept !== undefined ? (
        <Chip size="small" color="success" label="Lore ✓" onDelete={() => keep(name, cleared(kept, 'lore'))} title="Clear lore data" data-testid="gaps-shot-clear-lore" />
      ) : (
        <Chip size="small" variant="outlined" label="Lore tab: not pasted" />
      )}
    </Stack>
  )
}

/** A window whose name is another item's: nothing is kept until the player says (owner, 2026-10-21). */
function WrongItem({ read, row, onUse, onDiscard }: { read: string; row: string; onUse: () => void; onDiscard: () => void }): JSX.Element {
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

/** The icon choices, best first: five, and five more a click on "Show more" (owner, 2026-10-21). */
function IconPicker({ name, kept, matches }: { name: string; kept: StoredShot; matches: readonly number[] }): JSX.Element | null {
  const [shown, setShown] = useState(5)
  const ids = matches.length > 0 ? matches : kept.iconId === undefined ? [] : [kept.iconId]
  if (ids.length === 0) return null
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
      <Line>Icon (lucy_img_ID), best match first; click to choose:</Line>
      {ids.slice(0, shown).map((id) => (
        <IconChoice key={id} id={id} picked={kept.iconId === id} onPick={() => keep(name, { ...kept, iconId: id })} />
      ))}
      {shown < ids.length && (
        <Button size="small" onClick={() => setShown((n) => n + 5)} data-testid="gaps-shot-more-icons">
          Show more
        </Button>
      )}
    </Stack>
  )
}

/** The kept Value, focus effect and lore, one line each. */
function KeptFacts({ kept }: { kept: StoredShot }): JSX.Element {
  return (
    <>
      {kept.valueCopper !== undefined && <Line>Value (merchant_value): {formatCoin(kept.valueCopper)}</Line>}
      {kept.focusEffect !== undefined && <Line>Focus effect: {kept.focusEffect}</Line>}
      {kept.lore !== undefined && <Line>Lore: {kept.lore}</Line>}
    </>
  )
}

/** The kept reading: icon, Value, focus, lore, the editable statsblock. */
function KeptShot({ name, kept, reply }: { name: string; kept: StoredShot; reply: ItemShotReply | null }): JSX.Element {
  const unread = reply?.read.unread ?? []
  return (
    <>
      <IconPicker key={reply?.ms ?? 0} name={name} kept={kept} matches={reply?.icons.map((h) => h.id) ?? []} />
      <KeptFacts kept={kept} />
      {kept.statsblock !== undefined && (
        <TextField
          label="statsblock (check it against the window; Copy wiki page uses this)"
          multiline
          minRows={4}
          size="small"
          value={kept.statsblock}
          onChange={(e) => keep(name, { ...kept, statsblock: e.target.value })}
          slotProps={{ htmlInput: { style: { fontFamily: 'monospace', fontSize: 12 }, 'data-testid': 'gaps-shot-statsblock' } }}
        />
      )}
      {unread.length > 0 && <Line>Not placed: {unread.join(' · ')}</Line>}
      {reply !== null && <Line>Read in {(reply.ms / 1000).toFixed(1)} s, on this PC.</Line>}
    </>
  )
}

interface Pending {
  reply: ItemShotReply
  kind: ShotKind
}

function ItemShot({ row }: { row: GapRow }): JSX.Element {
  const kept = useItemShots()[row.name]
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState<ItemShotReply | null>(null)
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const apply = useCallback((p: Pending) => keep(row.name, keptAfter(kept, p.reply, p.kind)), [row.name, kept])
  const read = useCallback(
    (png: Uint8Array) => {
      setBusy(true)
      setPending(null)
      void window.eq.shotReadItem(png).then((r) => {
        setBusy(false)
        const kind = shotKind(r)
        setFailed(kind === null)
        setReply(kind === null ? null : r)
        if (kind === null) return
        // A window that names another item waits for the player; nothing is kept until they say.
        if (kind === 'window' && !sameItem(r.read.name, row.name)) setPending({ reply: r, kind })
        else apply({ reply: r, kind })
      })
    },
    [row.name, apply]
  )
  const checks = [...(reply?.read.checks ?? []), ...(reply?.iconNote === undefined ? [] : [reply.iconNote])]
  return (
    <Stack spacing={0.75} data-testid="gaps-shot">
      <PasteZone label="Click here and paste an image to read it" busy={busy} onPicture={read} />
      {failed && (
        <Typography variant="body2" color="error.main" data-testid="gaps-shot-error">
          ERROR: unable to read image
        </Typography>
      )}
      {pending !== null && (
        <WrongItem
          read={pending.reply.read.name ?? ''}
          row={row.name}
          onUse={() => {
            apply(pending)
            setPending(null)
          }}
          onDiscard={() => {
            setPending(null)
            setReply(null)
          }}
        />
      )}
      {kept !== undefined && <Parts name={row.name} kept={kept} />}
      {checks.map((c) => (
        <Line key={c} warn>
          {c}
        </Line>
      ))}
      {kept !== undefined && <KeptShot name={row.name} kept={kept} reply={pending === null ? reply : null} />}
    </Stack>
  )
}

export default function ShotPanel({ row }: { row: GapRow }): JSX.Element | null {
  if (row.domain === 'item' && row.suggest === undefined) return <ItemShot key={row.name} row={row} />
  if (row.domain === 'image' || row.domain === 'mob' || row.domain === 'merchant') return <MobPicture key={row.name} row={row} />
  return null
}
