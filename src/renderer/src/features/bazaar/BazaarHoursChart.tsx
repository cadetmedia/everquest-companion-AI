// The Bazaar's time-of-day chart (owner ask, 2026-10-11): the average asking and offered price in
// each four-hour period of the player's clock, beside the price-over-time chart, to see whether an
// item goes cheaper at night when fewer people are on. Six groups of two bars, the count under each
// label; hovering a group shows mean, median and count per side. The numbers come from
// shared/bazaarHours.ts; this file only draws them, in BazaarChart's colours and style.

import { type JSX, useRef, useState } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import { formatPlat, type BazaarItem } from '@shared/bazaar'
import { hoursOf, type HourPoint, type HourSide } from '@shared/bazaarHours'
import { ChartTooltip, type TooltipRow } from '../../lib/ChartTooltip'
import { ASK_COLOR, AXIS_TEXT, GRID, OFFER_COLOR, niceMax, useWidth } from './BazaarChart'

const H = 240
/** Room under the plot for the period label and its count. */
const M = { left: 48, right: 16, top: 12, bottom: 38 }

interface Geo {
  /** The left edge of period `i`'s group and the group's width. */
  x: (i: number) => number
  gw: number
  y: (pp: number) => number
  top: number
  w: number
}

function geometry(hours: readonly HourPoint[], w: number): Geo {
  const means = hours.map((h) => Math.max(h.sell.mean ?? 0, h.buy.mean ?? 0))
  const top = niceMax(Math.max(...means) * 1.05)
  const pw = w - M.left - M.right
  const ph = H - M.top - M.bottom
  const gw = pw / hours.length
  return { x: (i) => M.left + i * gw, gw, y: (pp) => M.top + ph - (pp / top) * ph, top, w }
}

/** One period's two bars, asking left and offered right, each as tall as its mean. */
function Bars({ h, i, g, hover }: { h: HourPoint; i: number; g: Geo; hover: boolean }): JSX.Element {
  const bw = Math.max(4, (g.gw - 16) / 2)
  const x0 = g.x(i) + (g.gw - 2 * bw - 4) / 2
  const bar = (side: HourSide, x: number, color: string): JSX.Element | null =>
    side.mean === null ? null : <rect x={x} y={g.y(side.mean)} width={bw} height={Math.max(1, H - M.bottom - g.y(side.mean))} fill={color} opacity={hover ? 1 : 0.85} rx={2} />
  return (
    <g>
      {bar(h.sell, x0, ASK_COLOR)}
      {bar(h.buy, x0 + bw + 4, OFFER_COLOR)}
    </g>
  )
}

function Axes({ g, hours }: { g: Geo; hours: readonly HourPoint[] }): JSX.Element {
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * g.top)
  return (
    <g fontSize={11} fill={AXIS_TEXT}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.left} x2={g.w - M.right} y1={g.y(t)} y2={g.y(t)} stroke={GRID} strokeWidth={1} />
          <text x={M.left - 6} y={g.y(t) + 4} textAnchor="end">
            {t === 0 ? '0' : formatPlat(t)}
          </text>
        </g>
      ))}
      {hours.map((h, i) => (
        <g key={h.bucket}>
          <text x={g.x(i) + g.gw / 2} y={H - 20} textAnchor="middle">
            {h.bucket}
          </text>
          <text x={g.x(i) + g.gw / 2} y={H - 7} textAnchor="middle" opacity={0.7}>
            n={h.sell.n + h.buy.n}
          </text>
        </g>
      ))}
    </g>
  )
}

function sideRow(label: string, s: HourSide, color: string): TooltipRow | null {
  if (s.mean === null) return null
  return { label, value: `${formatPlat(s.mean)} mean · ${formatPlat(s.median)} median · n=${s.n}`, color }
}

interface Hover {
  i: number
  x: number
  y: number
}

function Legend(): JSX.Element {
  const key = (color: string, label: string): JSX.Element => (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: color }} />
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  )
  return (
    <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
      {key(ASK_COLOR, 'Asking (selling)')}
      {key(OFFER_COLOR, 'Offered (buying)')}
      <Typography variant="caption" color="text.disabled">
        Bar: the period&apos;s mean price.
      </Typography>
    </Stack>
  )
}

export function BazaarHoursChart({ item, ignoreOutliers }: { item: BazaarItem; ignoreOutliers: boolean }): JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const w = useWidth(box)
  const [hov, setHov] = useState<Hover | null>(null)
  const hours = hoursOf(item, ignoreOutliers)
  const any = hours.some((h) => h.sell.n + h.buy.n > 0)
  const g = geometry(hours, w)
  const hp = hov === null ? undefined : hours[hov.i]
  const rows = hp === undefined ? [] : [sideRow('Asking', hp.sell, ASK_COLOR), sideRow('Offered', hp.buy, OFFER_COLOR)].flatMap((r) => (r === null ? [] : [r]))
  return (
    <Stack spacing={1}>
      <Typography variant="caption" color="text.secondary" data-testid="bazaar-hours-title">
        Price by time of day
      </Typography>
      <Legend />
      <Box ref={box} sx={{ position: 'relative', width: '100%' }} data-testid="bazaar-hours-chart">
        {any ? (
          <svg width={w} height={H} role="img" aria-label={`${item.item} asking and offered prices by time of day`}>
            <Axes g={g} hours={hours} />
            {hours.map((h, i) => (
              <Bars key={h.bucket} h={h} i={i} g={g} hover={hov?.i === i} />
            ))}
            {hours.map((h, i) => (
              <rect
                key={h.bucket}
                x={g.x(i)}
                y={M.top}
                width={Math.max(0, g.gw)}
                height={H - M.top - M.bottom}
                fill="transparent"
                onPointerMove={(e) => {
                  const r = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
                  if (r !== undefined) setHov({ i, x: e.clientX - r.left, y: e.clientY - r.top })
                }}
                onPointerLeave={() => setHov(null)}
              />
            ))}
          </svg>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            No quote with a price yet, so nothing to place by time of day.
          </Typography>
        )}
        {hov !== null && hp !== undefined && rows.length > 0 && <ChartTooltip x={hov.x} y={hov.y} title={hp.bucket} rows={rows} bounds={{ w, h: H }} />}
      </Box>
      <Typography variant="caption" color="text.disabled">
        Average asking and offered price by time of day, from the quotes kept, one per seller per day.
      </Typography>
    </Stack>
  )
}
