// maps/AreaCircle.tsx — one shaded area on a map: a translucent circle with its label on the rim.
// The Achievements (Slayer) areas use it on the Maps tab (slayer/SlayerMapLayer.tsx) and on the
// Map pins overlay (overlay/MapPinsField.tsx), so both draw the same mark. Inert: it takes no
// pointer, so a drag across it still pans the map. Light on purpose: the overlay imports it.

import type { JSX } from 'react'
import { alpha } from '@mui/material/styles'

/** `at` is the centre and `r` the radius, both in screen px; `text` is `areaText`'s (slayerOverlay.ts). */
export function AreaCircle({
  at,
  r,
  tone,
  text,
  testId
}: {
  at: { px: number; py: number }
  r: number
  tone: string
  text: string
  testId: string
}): JSX.Element {
  return (
    <div
      data-testid={testId}
      style={{
        position: 'absolute',
        left: at.px - r,
        top: at.py - r,
        width: 2 * r,
        height: 2 * r,
        borderRadius: '50%',
        background: alpha(tone, 0.16),
        border: `1px solid ${alpha(tone, 0.7)}`,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        pointerEvents: 'none'
      }}
    >
      <span
        style={{
          marginTop: -9,
          padding: '0 6px',
          borderRadius: 8,
          fontSize: 11,
          lineHeight: '18px',
          whiteSpace: 'nowrap',
          color: '#000',
          background: alpha(tone, 0.92)
        }}
      >
        {text}
      </span>
    </div>
  )
}
