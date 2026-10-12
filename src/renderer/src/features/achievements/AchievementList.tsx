// achievements/AchievementList.tsx — THE ACHIEVEMENTS of whatever the rail has picked, under the
// game's own group headings, with the window's two Show switches and a search over names and
// requirement lines.
//
// ITS OWN SCROLLER (AGENTS.md UI conventions), AND WINDOWED (owner ask, 2026-10-11: no lag). The
// whole file is one flat list of heading rows and achievement rows (shared/achievements/listRows.ts),
// and only the screenful in view is mounted (listWindow.ts): measured in the real renderer on 501
// rows, mounting them all took 300 ms to open and 235 ms to echo the first keystroke, every one a
// long task. The headings are sticky, and the one above the window is pinned so a reader is never
// without the group they are in. Which rows are open is the list's to keep, not the row's, so a
// row that scrolls out of the window and back is still open.

import { type JSX, useCallback, useMemo, useRef, useState } from 'react'
import {
  Box,
  Checkbox,
  FormControlLabel,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from '@mui/material'
import AchievementRow, { ROW_HEIGHT } from './AchievementRow'
import type { SortOrder } from '@shared/achievements/bookRows'
import { rowKey, type ListRow } from '@shared/achievements/listRows'
import { useListWindow, type ListWindow } from './listWindow'
import type { ListBundle, RowContext } from './useAchievementsController'

/** A heading row's height: the overline at line height 2, and its rule. */
const HEADING_HEIGHT = 25

function Show({
  label,
  checked,
  onChange,
  testId
}: {
  label: string
  checked: boolean
  onChange: (on: boolean) => void
  testId: string
}): JSX.Element {
  return (
    <FormControlLabel
      sx={{ mr: 0 }}
      control={
        <Checkbox
          size="small"
          checked={checked}
          data-testid={testId}
          onChange={(e) => {
            onChange(e.target.checked)
          }}
          sx={{ p: 0.5 }}
        />
      }
      label={<Typography variant="caption">{label}</Typography>}
    />
  )
}

function Controls(props: ListBundle): JSX.Element {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ pb: 0.5 }}>
      <TextField
        size="small"
        placeholder="Search achievements and what they require"
        value={props.query}
        onChange={(e) => {
          props.onQuery(e.target.value)
        }}
        sx={{ flex: '1 1 220px' }}
        slotProps={{ htmlInput: { 'data-testid': 'achievements-search' } }}
      />
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="caption" color="text.secondary">
          Show
        </Typography>
        <Show label="Open" checked={props.open} onChange={props.onOpen} testId="achievements-show-open" />
        <Show
          label="Complete"
          checked={props.complete}
          onChange={props.onComplete}
          testId="achievements-show-complete"
        />
        <Tooltip
          title={
            props.zoneName === null
              ? 'The log has not named a zone yet. Zone once and this fills in.'
              : `Only what can be worked on in ${props.zoneName}: kill counters with a mob here, named mobs here, and this zone's Hunter, Conqueror and Traveler.`
          }
        >
          <span>
            <Show
              label={props.zoneName === null ? "Zone I'm in" : `Zone I'm in (${props.zoneName})`}
              checked={props.zoneOnly}
              onChange={props.onZoneOnly}
              testId="achievements-zone-here"
            />
          </span>
        </Tooltip>
      </Stack>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={props.sort}
        onChange={(_e, next: SortOrder | null) => {
          if (next !== null) props.onSort(next)
        }}
      >
        <ToggleButton value="game" sx={{ py: 0.25 }}>
          Game order
        </ToggleButton>
        <ToggleButton value="closest" data-testid="achievements-sort-closest" sx={{ py: 0.25 }}>
          Closest first
        </ToggleButton>
      </ToggleButtonGroup>
    </Stack>
  )
}

/** What a file of open achievements cannot say, and how to get one that can. */
function OpenOnlyNote(): JSX.Element {
  return (
    <Typography
      variant="caption"
      color="text.secondary"
      data-testid="achievements-open-only"
      sx={{ display: 'block', pb: 0.5 }}
    >
      This file lists open achievements only. To list the finished ones too, tick Complete in the
      game&apos;s Achievements window and press Output To File.
    </Typography>
  )
}

/** A group's heading: sticky, so a later one slides over the one before as the list scrolls. */
function Heading({ category }: { category: string }): JSX.Element {
  return (
    <Typography
      variant="overline"
      color="text.secondary"
      data-testid="achievements-section"
      sx={{
        display: 'block',
        position: 'sticky',
        top: 0,
        zIndex: 1,
        bgcolor: 'background.default',
        lineHeight: 2,
        height: HEADING_HEIGHT,
        boxSizing: 'border-box',
        borderBottom: '1px solid',
        borderColor: 'divider'
      }}
    >
      {category}
    </Typography>
  )
}

/** Which rows are open and, while open, how tall: the list's state, so it outlives the window. */
function useOpenRows(): {
  opened: ReadonlySet<string>
  measured: ReadonlyMap<string, number>
  onToggle: (id: string) => void
  onMeasure: (id: string, height: number) => void
} {
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set())
  const [measured, setMeasured] = useState<ReadonlyMap<string, number>>(() => new Map())
  const onToggle = useCallback((id: string) => {
    setOpened((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
    // A row that closes is ROW_HEIGHT again; one that opens reports its height when it has one.
    setMeasured((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])
  const onMeasure = useCallback((id: string, height: number) => {
    setMeasured((prev) => (prev.get(id) === height ? prev : new Map(prev).set(id, height)))
  }, [])
  return { opened, measured, onToggle, onMeasure }
}

function pinnedCategory(rows: readonly ListRow[], win: ListWindow): string | null {
  const row = win.pinned >= 0 ? rows[win.pinned] : undefined
  return row === undefined ? null : row.group.category
}

function Rows({ rows, ctx }: { rows: ListRow[]; ctx: RowContext }): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { opened, measured, onToggle, onMeasure } = useOpenRows()
  const heights = useMemo(
    () =>
      rows.map((row) =>
        row.kind === 'heading' ? HEADING_HEIGHT : (measured.get(rowKey(row)) ?? ROW_HEIGHT)
      ),
    [rows, measured]
  )
  const win = useListWindow(rows, heights, scrollRef)
  const pinned = pinnedCategory(rows, win)
  return (
    <Box
      ref={scrollRef}
      data-testid="achievements-list"
      sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain' }}
    >
      {pinned !== null && <Heading category={pinned} />}
      <Box style={{ height: win.topPad }} />
      {rows.slice(win.start, win.end).map((row) => {
        const id = rowKey(row)
        return row.kind === 'heading' ? (
          <Heading key={id} category={row.group.category} />
        ) : (
          <AchievementRow
            key={id}
            id={id}
            group={row.group}
            achievement={row.achievement}
            ctx={ctx}
            open={opened.has(id)}
            onToggle={onToggle}
            onMeasure={onMeasure}
          />
        )
      })}
      <Box style={{ height: win.bottomPad }} />
      {rows.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
          No achievement matches that.
        </Typography>
      )}
    </Box>
  )
}

export default function AchievementList(props: ListBundle): JSX.Element {
  const { rows, shown, ctx } = props
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <Typography variant="subtitle2" data-testid="achievements-title" sx={{ pb: 0.5 }}>
        Achievements - {shown.toLocaleString('en-US')} shown
      </Typography>
      <Controls {...props} />
      {!props.hasComplete && <OpenOnlyNote />}
      <Rows rows={rows} ctx={ctx} />
    </Box>
  )
}
