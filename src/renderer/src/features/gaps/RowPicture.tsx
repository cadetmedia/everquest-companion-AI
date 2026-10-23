// RowPicture — the row's saved picture beside its details (owner, 2026-10-22: "can we show the
// picture if we have it? maybe to the right half of the detail area, and have it wrap under and then
// shrink in size as they shrink the width"). A mob's picture, or an item's or spell's kept window
// (shared/mobPicture.ts `rowPicture`), read through main as a data URL (only a .png in a picture
// folder). The pane lays it out: beside the text when wide, under it when narrow, scaled with the
// pane. Nothing shows when there is no picture or it cannot be read.

import { type JSX, type ReactNode, useEffect, useState } from 'react'
import { Box } from '@mui/material'
import { rowPicture } from '@shared/mobPicture'
import type { GapRow } from '@shared/gaps'
import { Tooltip } from '../../lib/Tooltip'
import { useFolderPictures } from './folderPicturesStore'
import { useMobPictures } from './itemShotsStore'

/** The picture's data URL; asked again whenever the folders are re-read (a save replaces the file). */
function usePictureData(path: string | undefined, listing: unknown): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setUrl(null)
    if (path === undefined) return undefined
    window.eq
      .shotPictureData(path)
      .then((got) => {
        if (live) setUrl(got)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [path, listing])
  return url
}

function RowPicture({ row }: { row: GapRow }): JSX.Element | null {
  const folder = useFolderPictures()
  const path = rowPicture(row, useMobPictures(), folder)
  const url = usePictureData(path, folder)
  if (path === undefined || url === null) return null
  const name = path.split(/[\\/]/).pop() ?? path
  return (
    <Box sx={{ flex: '0 1 420px', maxWidth: '100%', minWidth: 0 }} data-testid="gaps-row-picture">
      <Tooltip title={`${name}: click to show it in its folder.`}>
        <Box
          component="img"
          src={url}
          alt={name}
          onClick={() => void window.eq.shotSavedFile('show', path).catch(() => false)}
          sx={{ display: 'block', width: '100%', height: 'auto', maxHeight: '36vh', objectFit: 'contain', borderRadius: 1, border: 1, borderColor: 'divider', cursor: 'pointer' }}
        />
      </Tooltip>
    </Box>
  )
}

/**
 * The details text and the row's picture: side by side when the pane is wide, the picture under the
 * text when it is narrow, and scaled down with the pane from there (flex wrap; the text keeps 380 px,
 * the picture up to 420 px).
 */
export function WithRowPicture({ row, children }: { row: GapRow; children: ReactNode }): JSX.Element {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'flex-start' }}>
      <Box sx={{ flex: '1 1 380px', minWidth: 0 }}>{children}</Box>
      <RowPicture row={row} />
    </Box>
  )
}
