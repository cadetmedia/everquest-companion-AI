// GapsOverlay — the Wiki Gaps overlay (owner, 2026-10-20: "Tired of alt tabbing to see what i need
// to take a screenshot of. Just have it display the top 10 of whatever list they have on whatever
// tab they have showing"): the first ten rows of the Gaps tab's list, one line each, over the game.
// The header names the domain tab and says `10 of N`; a row is the name and where it was seen (or,
// with no zone known, its To-do chip's words).
//
// IT DERIVES NOTHING. The main window writes the rows from the tab's own pipeline
// (shared/gapsOverlay.ts says how) into the storage this window shares with it; this file reads
// them and follows the `storage` event. A Done mark made on the tab drops its row on the next write.
// Rows are not clickable: the tab is where a row is worked.
//
// MUI-FREE, plain divs and inline styles, like every file in this bundle.

import { type JSX, useEffect, useState } from 'react'
import { BG_ALPHA_MAX, BG_ALPHA_MIN, BG_ALPHA_STEP } from '@shared/overlayBgAlpha'
import { EMPTY_GAPS_OVERLAY, GAPS_OVERLAY_KEY, parseGapsOverlay, type GapsOverlayPayload, type GapsOverlayRow } from '@shared/gapsOverlay'
import { OverlayHeader } from './OverlayHeader'
import { FOOTER_ROW, OverlayContent } from './overlayScale'
import { TextScaleStepper } from './TextScaleStepper'
import { type OverlayChrome, useOverlayChrome } from './useOverlayChrome'

/** A wiki violet, none of the other windows' accents (gold, green, red, blue, amber, teal). */
const ACCENT = '#b49cf0'
const ACCENT_BG = 'rgba(180,156,240,0.2)'
const DIM = 'rgba(255,255,255,0.5)'

function readStored(): GapsOverlayPayload {
  try {
    return parseGapsOverlay(localStorage.getItem(GAPS_OVERLAY_KEY))
  } catch {
    return EMPTY_GAPS_OVERLAY
  }
}

/** The rows the main window last wrote, kept current by the `storage` event it fires here. */
function useGapsOverlayRows(): GapsOverlayPayload {
  const [payload, setPayload] = useState(readStored)
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === GAPS_OVERLAY_KEY || e.key === null) setPayload(readStored())
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  return payload
}

/** One row, one line: the name takes the room, the detail ellipsizes after it. */
function GapLine({ row, rank }: { row: GapsOverlayRow; rank: number }): JSX.Element {
  return (
    <div
      data-testid="gaps-overlay-row"
      style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '1px 2px', whiteSpace: 'nowrap', overflow: 'hidden' }}
    >
      <span style={{ flexShrink: 0, minWidth: 14, fontSize: 9.5, color: DIM, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {String(rank)}
      </span>
      <span style={{ flexShrink: 1, minWidth: 0, fontSize: 11, color: '#f2f2f2', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {row.name}
      </span>
      {row.detail !== '' && (
        <span style={{ flexShrink: 100, minWidth: 0, fontSize: 9.5, color: DIM, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {row.detail}
        </span>
      )}
    </div>
  )
}

function GapsFooter({ bgAlpha, textScale, patch, noDrag }: { bgAlpha: number; textScale: number; patch: OverlayChrome['patch']; noDrag: React.CSSProperties }): JSX.Element {
  return (
    <div style={{ ...FOOTER_ROW, ...noDrag, gap: 6 }}>
      <input
        type="range"
        aria-label="Background opacity"
        min={BG_ALPHA_MIN}
        max={BG_ALPHA_MAX}
        step={BG_ALPHA_STEP}
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

/** The two empties say which they are: no list yet, or a list with nothing left in it. */
function emptyText(payload: GapsOverlayPayload): string {
  return payload.loaded ? 'Nothing to do here.' : 'Waiting for the Wiki Gaps list. Open the Wiki Gaps tab once if this stays.'
}

export default function GapsOverlay(): JSX.Element {
  const payload = useGapsOverlayRows()
  const { locked, bgAlpha, textScale, hovering, patch, toggleLock, capture, dragRegion, noDrag } = useOverlayChrome()
  const rows = payload.rows

  return (
    <div
      data-testid="gaps-overlay"
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
        tag="WIKI"
        title={payload.label === '' ? 'Wiki Gaps' : payload.label}
        titleColor={ACCENT}
        tail={payload.loaded ? `${String(rows.length)} of ${payload.total.toLocaleString()}` : undefined}
        tailTitle="The first rows of the Wiki Gaps tab's list, with its filters and order"
        iconAccentBg={ACCENT_BG}
        chrome={{ locked, hovering, dragRegion, noDrag, toggleLock, capture }}
      />

      <OverlayContent textScale={textScale} testId="gaps-overlay-rows" locked={locked} capture={capture}>
        {rows.length === 0 ? (
          <div data-testid="gaps-overlay-empty" style={{ fontSize: 10.5, color: DIM, padding: '8px 2px' }}>
            {emptyText(payload)}
          </div>
        ) : (
          rows.map((row, i) => <GapLine key={row.key} row={row} rank={i + 1} />)
        )}
      </OverlayContent>

      {!locked && <GapsFooter bgAlpha={bgAlpha} textScale={textScale} patch={patch} noDrag={noDrag} />}
    </div>
  )
}
