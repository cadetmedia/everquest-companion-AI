// The grouped list's two controls, in the Name header where the groups are (owner, 2026-10-20:
// "a single toggle and directly above the name/group column ... not sure it needs text, just the
// icons"): one icon that collapses every heading, or expands them all when every one is folded,
// and one that opens the heading order (A to Z, most or fewest missing). Nothing when ungrouped.

import { type JSX, type MouseEvent, useState } from 'react'
import { IconButton, Menu, MenuItem } from '@mui/material'
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess'
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore'
import SortIcon from '@mui/icons-material/Sort'
import { GAP_GROUP_ORDERS, GAP_GROUP_ORDER_LABELS } from '@shared/gapGroups'
import { Tooltip } from '../../lib/Tooltip'
import type { Grouping } from './useGrouping'

export default function GroupHeaderControls({ group }: { group: Grouping }): JSX.Element | null {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  if (!group.grouped) return null
  const stop = (e: MouseEvent): void => e.stopPropagation()
  return (
    <>
      <Tooltip title={group.allFolded ? 'Expand all groups' : 'Collapse all groups'}>
        <IconButton
          size="small"
          sx={{ p: 0.25, mr: 0.25 }}
          aria-label={group.allFolded ? 'Expand all groups' : 'Collapse all groups'}
          onClick={(e) => {
            stop(e)
            group.toggleAll()
          }}
          data-testid="gaps-fold-all"
        >
          {group.allFolded ? <UnfoldMoreIcon fontSize="small" /> : <UnfoldLessIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
      <Tooltip title={`Order groups: ${GAP_GROUP_ORDER_LABELS[group.order]}`}>
        <IconButton
          size="small"
          sx={{ p: 0.25, mr: 0.75 }}
          aria-label="Order groups"
          onClick={(e) => {
            stop(e)
            setAnchor(e.currentTarget)
          }}
          data-testid="gaps-group-order"
        >
          <SortIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        {GAP_GROUP_ORDERS.map((o) => (
          <MenuItem
            key={o}
            selected={o === group.order}
            onClick={() => {
              group.setOrder(o)
              setAnchor(null)
            }}
            data-testid={`gaps-group-order-${o}`}
          >
            {GAP_GROUP_ORDER_LABELS[o]}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
