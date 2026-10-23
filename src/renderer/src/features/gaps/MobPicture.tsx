// MobPicture — a pasted picture of a mob, saved under its wiki file name (`npc_<name>.png`, or the
// Images row's file), the wiki's upload form a click away (owner, 2026-10-21). With an auto-save
// folder set there is no dialog; an existing file is replaced only on "Replace". A blank picture is
// refused. After the save the picture is read for the mob's nameplate, and when the name is not in it
// the player may keep or delete the file (src/main/ipc/shotPicture.ts). A picture already held, saved
// from the tab or put in the picture folder by hand (owner, 2026-10-22: "sometimes i may put an image
// in the directory, if I do, the tool should see that the image is there and not ask for it"), is
// shown as held; a paste then replaces it.

import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import { Button, Stack, Typography } from '@mui/material'
import { wikiUploadUrl, type GapRow } from '@shared/gaps'
import { heldPicture, pictureFile, type PictureSave } from '@shared/mobPicture'
import { Line, PasteZone } from './PasteZone'
import { latestOnly } from './latestOnly'
import { setMobPicture, useMobPictures } from './itemShotsStore'
import { refreshFolderPictures, useFolderPictures } from './folderPicturesStore'

type NameCheck = 'checking' | 'found' | 'missing' | 'deleted' | null

/** "Save automatically to: <folder>" with Change / Turn off, or Off with Choose folder (owner, 2026-10-21). */
function AutoSave(): JSX.Element {
  const [dir, setDir] = useState<string | null>(null)
  useEffect(() => void window.eq.shotAutoDir('get').then(setDir).catch(() => undefined), [])
  const act = (a: 'pick' | 'clear'): void =>
    void window.eq
      .shotAutoDir(a)
      .then((d) => {
        setDir(d)
        // Another folder may already hold the pictures.
        refreshFolderPictures()
      })
      .catch(() => undefined)
  return (
    <Stack direction="row" spacing={1} alignItems="center" data-testid="gaps-shot-autosave">
      <Line>Save automatically to: {dir ?? 'Off (asks where, starting in the last folder)'}</Line>
      <Button size="small" onClick={() => act('pick')}>
        {dir === null ? 'Choose folder…' : 'Change'}
      </Button>
      {dir !== null && (
        <Button size="small" onClick={() => act('clear')}>
          Turn off
        </Button>
      )}
    </Stack>
  )
}

/** Saved: where, Open folder, Upload; then whether the mob's name was found in the picture. */
function SavedLine({ path, file, name, check, onDelete, onKeep }: { path: string; file: string; name: string; check: NameCheck; onDelete: () => void; onKeep: () => void }): JSX.Element {
  if (check === 'deleted') return <Line>Deleted {path}.</Line>
  return (
    <Stack spacing={0.25}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Line>Saved to {path}.</Line>
        <Button size="small" onClick={() => void window.eq.shotSavedFile('show', path)}>
          Open folder
        </Button>
        <Button size="small" href={wikiUploadUrl(file)} target="_blank" rel="noreferrer">
          Upload it to the wiki
        </Button>
      </Stack>
      {check === 'checking' && <Line>Looking for {name} in the picture…</Line>}
      {check === 'missing' && (
        <Stack direction="row" spacing={1} alignItems="center" data-testid="gaps-shot-name-missing">
          <Line warn>Couldn&apos;t find {name} in this picture.</Line>
          <Button size="small" onClick={onKeep}>
            Keep it
          </Button>
          <Button size="small" onClick={onDelete}>
            Delete it
          </Button>
        </Stack>
      )}
    </Stack>
  )
}

/** A picture held before this paste (saved earlier, or put in the folder by hand): where, Open folder, Upload. */
function HeldLine({ path, file }: { path: string; file: string }): JSX.Element {
  return (
    <Stack direction="row" spacing={1} alignItems="center" data-testid="gaps-shot-held">
      <Line>Already saved: {path}.</Line>
      <Button size="small" onClick={() => void window.eq.shotSavedFile('show', path).catch(() => false)}>
        Open folder
      </Button>
      <Button size="small" href={wikiUploadUrl(file)} target="_blank" rel="noreferrer">
        Upload it to the wiki
      </Button>
    </Stack>
  )
}

/** What a save came to, short of saved. */
function NotSaved({ result, onReplace, onCancel }: { result: PictureSave; onReplace: () => void; onCancel: () => void }): JSX.Element | null {
  if (result.status === 'blank') return <Typography variant="body2" color="error.main">ERROR: this picture is blank</Typography>
  if (result.status === 'error') return <Typography variant="body2" color="error.main">ERROR: {result.message}</Typography>
  if (result.status !== 'exists') return null
  return (
    <Stack direction="row" spacing={1} alignItems="center" data-testid="gaps-shot-exists">
      <Line warn>{result.path} already exists.</Line>
      <Button size="small" onClick={onReplace}>
        Replace
      </Button>
      <Button size="small" onClick={onCancel}>
        Cancel
      </Button>
    </Stack>
  )
}

export default function MobPicture({ row }: { row: GapRow }): JSX.Element {
  const file = pictureFile(row)
  const held = heldPicture(file, useMobPictures(), useFolderPictures())
  const [busy, setBusy] = useState(false)
  const [png, setPng] = useState<Uint8Array | null>(null)
  const [result, setResult] = useState<PictureSave | null>(null)
  const [check, setCheck] = useState<NameCheck>(null)
  // Each save is a ticket: a save or nameplate check that answers after a newer save is dropped, so
  // A's warning never shows against B and "Delete it" only ever deletes the picture on screen.
  const tickets = useRef(latestOnly())
  const save = useCallback(
    (bytes: Uint8Array, overwrite = false) => {
      const ticket = tickets.current.start()
      const mine = (): boolean => tickets.current.isLatest(ticket)
      setBusy(true)
      setPng(bytes)
      setCheck(null)
      window.eq
        .shotSaveImage(bytes, file, overwrite)
        .then((r) => {
          if (!mine()) return
          setResult(r)
          // A picture under this name, saved now or already in the folder, makes the row Ready.
          if (r.status === 'saved' || r.status === 'exists') setMobPicture(file, r.path)
          if (r.status === 'saved') refreshFolderPictures()
          if (r.status !== 'saved') return
          // The nameplate check runs after the save: OCR of a full screenshot can take seconds.
          setCheck('checking')
          window.eq
            .shotCheckMob(r.checkId, row.name)
            .then((found) => mine() && setCheck(found === false ? 'missing' : 'found'))
            .catch(() => mine() && setCheck('found'))
        })
        .catch(() => mine() && setResult({ status: 'error', message: 'Could not save it.' }))
        .finally(() => mine() && setBusy(false))
    },
    [file, row.name]
  )
  return (
    <Stack spacing={0.5} data-testid="gaps-shot-picture">
      <PasteZone
        label={held === undefined ? `Click here and paste a picture of ${row.name} (saved as ${file})` : `Click here and paste a new picture of ${row.name} to replace ${file}`}
        busy={busy}
        onPicture={(b) => save(b)}
      />
      {result === null && held !== undefined && <HeldLine path={held} file={file} />}
      <AutoSave />
      {result !== null && result.status !== 'saved' && (
        <NotSaved result={result} onReplace={() => png !== null && save(png, true)} onCancel={() => setResult(null)} />
      )}
      {result?.status === 'saved' && (
        <SavedLine
          path={result.path}
          file={file}
          name={row.name}
          check={check}
          onKeep={() => setCheck('found')}
          onDelete={() =>
            void window.eq
              .shotSavedFile('delete', result.path)
              .then((ok) => {
                setCheck(ok ? 'deleted' : 'missing')
                if (ok) setMobPicture(file, null)
                refreshFolderPictures()
              })
              .catch(() => setCheck('missing'))
          }
        />
      )}
    </Stack>
  )
}
