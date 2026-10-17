// ItemIcon — an item's wiki icon the Gear tab's way, for list rows: a fixed 22 px box so rows
// with and without one line up, hidden when the page names none or the image fails. Asks for the
// id by item NAME through `itemMarks.ts`, which batches every row of a paint into one call, so
// only the rows a windowed table has mounted are ever looked up (owner, 2026-10-10).

import { type JSX } from 'react'
import { Box } from '@mui/material'
import { itemIconUrl } from './ItemWindow'
import { useItemMarks } from './itemMarks'

export function ItemIcon({ name }: { name: string }): JSX.Element {
  const iconId = useItemMarks(name)?.iconId
  if (iconId === undefined) return <Box sx={{ width: 22, flexShrink: 0 }} />
  return (
    <Box
      component="img"
      src={itemIconUrl(iconId)}
      alt=""
      onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
        e.currentTarget.style.display = 'none'
      }}
      sx={{ width: 22, height: 22, imageRendering: 'pixelated', flexShrink: 0 }}
    />
  )
}
