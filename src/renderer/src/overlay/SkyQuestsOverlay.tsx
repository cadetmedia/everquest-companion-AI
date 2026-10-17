// SkyQuestsOverlay (sky-quest-overlay) — the Plane of Sky quests you starred, one line each, over
// the game: whether it is ready, the class, the reward, who takes the turn-in, and each item it
// needs with whether you hold it.
//
// IT DERIVES NOTHING. The main window writes the rows from the same progress the Sky tab draws
// (shared/skyQuestOverlay.ts) into the storage this window shares with it; this file reads them
// and follows the `storage` event. Unlocked, a row opens its quest on the Sky tab.
//
// MUI-FREE, plain divs and inline styles, like every file in this bundle.

import { type JSX, useEffect, useState } from 'react'
import { classAbbrForDisplayName } from '@shared/spellLevels'
import {
  EMPTY_SKY_OVERLAY,
  SKY_OVERLAY_KEY,
  parseSkyOverlay,
  type SkyOverlayItem,
  type SkyOverlayPayload,
  type SkyOverlayRow
} from '@shared/skyQuestOverlay'
import { OverlayHeader } from './OverlayHeader'
import { FOOTER_ROW, OverlayContent } from './overlayScale'
import { TextScaleStepper } from './TextScaleStepper'
import { type OverlayChrome, useOverlayChrome } from './useOverlayChrome'

/** A sky teal, none of the other windows' accents (gold, green, red, blue, amber). */
const ACCENT = '#6fd6d0'
const ACCENT_BG = 'rgba(111,214,208,0.2)'
/** Ready to hand in, and an item you hold: the green the respawn window uses for "go look". */
const READY = '#7fd18b'
const DIM = 'rgba(255,255,255,0.45)'

function readStored(): SkyOverlayPayload {
  try {
    return parseSkyOverlay(localStorage.getItem(SKY_OVERLAY_KEY))
  } catch {
    return EMPTY_SKY_OVERLAY
  }
}

/** The rows the main window last wrote, kept current by the `storage` event it fires here. */
function useSkyOverlayRows(): SkyOverlayPayload {
  const [payload, setPayload] = useState(readStored)
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === SKY_OVERLAY_KEY || e.key === null) setPayload(readStored())
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  return payload
}

function ItemChip({ item }: { item: SkyOverlayItem }): JSX.Element {
  const held = item.have >= item.need
  return (
    <span
      data-testid="sky-overlay-item"
      data-held={held ? 'true' : 'false'}
      style={{
        fontSize: 9.5,
        lineHeight: 1.5,
        padding: '0 4px',
        borderRadius: 3,
        whiteSpace: 'nowrap',
        color: held ? READY : DIM,
        border: `1px solid ${held ? `${READY}55` : 'rgba(255,255,255,0.14)'}`
      }}
    >
      {held ? '✓ ' : ''}
      {item.name}
      {item.need > 1 ? ` ${String(item.have)}/${String(item.need)}` : ''}
    </span>
  )
}

/** READY, or how many of the quest's items you hold. */
function StatusCell({ row }: { row: SkyOverlayRow }): JSX.Element {
  let held = 0
  for (const it of row.items) if (it.have >= it.need) held++
  return (
    <span
      data-testid="sky-overlay-status"
      style={{
        flexShrink: 0,
        minWidth: 30,
        fontSize: 9.5,
        fontWeight: 700,
        color: row.ready ? READY : DIM,
        fontVariantNumeric: 'tabular-nums'
      }}
    >
      {row.ready ? 'READY' : `${String(held)}/${String(row.items.length)}`}
    </span>
  )
}

/** One quest: status, class, reward (the quest's name when the data names none), giver, items. */
function QuestLine({ row, interactive }: { row: SkyOverlayRow; interactive: boolean }): JSX.Element {
  const open = (): void => {
    window.eqOverlay.focusApp({ view: 'posky', quest: row.key })
  }
  return (
    <div
      data-testid="sky-overlay-row"
      data-sky-ready={row.ready ? 'true' : 'false'}
      role={interactive ? 'button' : undefined}
      aria-label={interactive ? `Open ${row.name} on the Sky tab` : undefined}
      onClick={interactive ? open : undefined}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: 6,
        rowGap: 2,
        padding: '2px 2px 2px 5px',
        borderLeft: `2px solid ${row.ready ? READY : ACCENT}66`,
        cursor: interactive ? 'pointer' : 'default'
      }}
    >
      <StatusCell row={row} />
      <span style={{ flexShrink: 0, fontSize: 9.5, color: DIM }}>
        {classAbbrForDisplayName(row.className) ?? row.className}
      </span>
      <span style={{ fontSize: 11, color: ACCENT, whiteSpace: 'nowrap' }}>{row.reward ?? row.name}</span>
      {row.giver && <span style={{ fontSize: 9.5, color: DIM, whiteSpace: 'nowrap' }}>{`→ ${row.giver}`}</span>}
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {row.items.map((it) => (
          <ItemChip key={it.name} item={it} />
        ))}
      </span>
    </div>
  )
}

function SkyFooter({
  bgAlpha,
  textScale,
  patch,
  noDrag
}: {
  bgAlpha: number
  textScale: number
  patch: OverlayChrome['patch']
  noDrag: React.CSSProperties
}): JSX.Element {
  return (
    <div style={{ ...FOOTER_ROW, ...noDrag, gap: 6 }}>
      <input
        type="range"
        aria-label="Background opacity"
        min={0.1}
        max={1}
        step={0.02}
        value={bgAlpha}
        onChange={(e) => {
          patch({ bgAlpha: Number(e.target.value) })
        }}
        style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 20, accentColor: ACCENT, height: 4 }}
      />
      <TextScaleStepper textScale={textScale} patch={patch} noDrag={noDrag} />
    </div>
  )
}

function emptyText(payload: SkyOverlayPayload): string {
  return payload.loaded
    ? 'No starred quests - star a quest on the Sky tab to list it here.'
    : 'Waiting for your Plane of Sky progress.'
}

export default function SkyQuestsOverlay(): JSX.Element {
  const payload = useSkyOverlayRows()
  const { locked, bgAlpha, textScale, hovering, patch, toggleLock, capture, dragRegion, noDrag } =
    useOverlayChrome()
  const rows = payload.rows
  let ready = 0
  for (const r of rows) if (r.ready) ready++

  return (
    <div
      data-testid="sky-overlay"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, "Segoe UI", Roboto, system-ui, sans-serif',
        color: '#f2f2f2',
        background: `rgba(14,17,21,${bgAlpha})`,
        border: locked ? '1px solid rgba(255,255,255,0.04)' : `1px solid ${ACCENT}66`,
        borderRadius: 8,
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}
    >
      <OverlayHeader
        tag="SKY"
        title="Sky quests"
        titleColor={ACCENT}
        tail={rows.length > 0 ? `${String(ready)}/${String(rows.length)}` : undefined}
        tailTitle="Ready to turn in, of your starred quests"
        iconAccentBg={ACCENT_BG}
        chrome={{ locked, hovering, dragRegion, noDrag, toggleLock, capture }}
      />

      <OverlayContent textScale={textScale} testId="sky-overlay-rows" locked={locked} capture={capture}>
        {rows.length === 0 ? (
          <div data-testid="sky-overlay-empty" style={{ fontSize: 10.5, color: DIM, padding: '8px 2px' }}>
            {emptyText(payload)}
          </div>
        ) : (
          rows.map((row) => <QuestLine key={row.key} row={row} interactive={!locked} />)
        )}
      </OverlayContent>

      {!locked && <SkyFooter bgAlpha={bgAlpha} textScale={textScale} patch={patch} noDrag={noDrag} />}
    </div>
  )
}
