// ItemIcon — an item's wiki icon the Gear tab's way, for list rows: a fixed 22 px box so rows
// with and without one line up, hidden when the page names none or the image fails. Takes the
// row's knowledge record itself, so a row stays one branch simpler (the loot rows sit at the
// complexity ceiling).

import { type JSX } from 'react'
import { Box } from '@mui/material'
import { itemIconUrl } from './ItemWindow'

export function ItemIcon({ knowledge }: { knowledge?: { iconId?: number } }): JSX.Element {
  const iconId = knowledge?.iconId
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
