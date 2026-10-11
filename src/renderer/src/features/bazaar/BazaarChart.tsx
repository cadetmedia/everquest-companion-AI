// The Bazaar's price-over-time chart: asking (WTS) and offered (WTB), one point per day.
//
// Each direction is its median line with a dot per day, over a faint band from that day's low to
// its high. Hovering puts a crosshair on the nearest day and a card with both sides. Hand-drawn
// SVG like the Leveling charts; the colors are the two below, checked for color-blind separation
// and contrast against the paper surface with the dataviz validator (2026-10-06): the app's own
// gold and blue read too light on the dark surface, so these are one step darker.

import { type JSX, useLayoutEffect, useRef, useState } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import { formatPlat, type BazaarItem, type BazaarPoint, type BazaarSide } from '@shared/bazaar'
import { ChartTooltip, type TooltipRow } from '../../lib/ChartTooltip'

export const ASK_COLOR = '#b8860b'
export const OFFER_COLOR = '#2f86d6'
export const SURFACE = '#171a21'
export const GRID = '#2a2f3a'
export const AXIS_TEXT = 'rgba(255,255,255,0.6)'

const H = 240
const M = { left: 48, right: 16, top: 12, bottom: 26 }
const DAY = 86_400_000

const timeOf = (day: string): number => Date.parse(`${day}T00:00:00Z`)
const shortDay = (day: string): string =>
  new Date(timeOf(day)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** A round top for the y axis: 1, 2, 2.5 or 5 times a power of ten. */
export function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  return ([1, 2, 2.5, 5, 10].find((s) => s * p >= v) ?? 10) * p
}

interface Geo {
  x: (day: string) => number
  y: (pp: number) => number
  top: number
  w: number
  t0: number
  t1: number
}

function geometry(item: BazaarItem, endDay: string, w: number): Geo {
  const { points } = item
  const last = Math.max(timeOf(points[points.length - 1].day), timeOf(endDay))
  const single = timeOf(points[0].day) === last
  const t0 = timeOf(points[0].day) - (single ? DAY : 0)
  const t1 = last + (single ? DAY : 0)
  const highs = points.map((p) => Math.max(p.sell.high ?? 0, p.buy.high ?? 0))
  const top = niceMax(Math.max(...highs, item.askingPredicted ?? 0, item.offeredPredicted ?? 0) * 1.05)
  const pw = w - M.left - M.right
  const ph = H - M.top - M.bottom
  return {
    x: (day) => M.left + ((timeOf(day) - t0) / Math.max(1, t1 - t0)) * pw,
    y: (pp) => M.top + ph - (pp / top) * ph,
    top,
    w,
    t0,
    t1
  }
}

/** One direction: the low-to-high band, the median line, a ringed dot per day. */
function Series({ points, side, color, g, hover }: { points: readonly BazaarPoint[]; side: 'sell' | 'buy'; color: string; g: Geo; hover: string | null }): JSX.Element {
  const at = points.map((p) => ({ day: p.day, s: p[side] })).map((v) => (v.s.median === null ? null : v))
  const drawn = at.flatMap((v) => (v === null ? [] : [v]))
  const band =
    drawn.map((v) => `${g.x(v.day)},${g.y(v.s.high ?? 0)}`).join(' ') +
    ' ' +
    [...drawn].reverse().map((v) => `${g.x(v.day)},${g.y(v.s.low ?? 0)}`).join(' ')
  const line = drawn.map((v) => `${g.x(v.day)},${g.y(v.s.median ?? 0)}`).join(' ')
  return (
    <g>
      {drawn.length > 1 && <polygon points={band} fill={color} opacity={0.1} />}
      {drawn.length > 1 && <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
      {drawn.map((v) => (
        <circle key={v.day} cx={g.x(v.day)} cy={g.y(v.s.median ?? 0)} r={v.day === hover ? 6 : 4} fill={color} stroke={SURFACE} strokeWidth={2} />
      ))}
    </g>
  )
}

/** A dashed run from a direction's newest median to its predicted price on the log's newest day. */
function Projection({ item, side, endDay, color, g }: { item: BazaarItem; side: 'sell' | 'buy'; endDay: string; color: string; g: Geo }): JSX.Element | null {
  const pred = side === 'sell' ? item.askingPredicted : item.offeredPredicted
  let from: BazaarPoint | undefined
  for (const p of item.points) if (p[side].median !== null) from = p
  if (pred === null || from === undefined) return null
  return (
    <g>
      <line x1={g.x(from.day)} y1={g.y(from[side].median ?? 0)} x2={g.x(endDay)} y2={g.y(pred)} stroke={color} strokeWidth={2} strokeDasharray="4 4" opacity={0.8} />
      <circle cx={g.x(endDay)} cy={g.y(pred)} r={5} fill={SURFACE} stroke={color} strokeWidth={2} />
    </g>
  )
}

function Axes({ g, points }: { g: Geo; points: readonly BazaarPoint[] }): JSX.Element {
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * g.top)
  const every = Math.max(1, Math.ceil(points.length / 6))
  const labelled = points.map((p, i) => (i % every === 0 || i === points.length - 1 ? p.day : null))
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
      {labelled.map((day) =>
        day === null ? null : (
          <text key={day} x={g.x(day)} y={H - 8} textAnchor="middle">
            {shortDay(day)}
          </text>
        )
      )}
    </g>
  )
}

function sideRow(label: string, s: BazaarSide, color: string): TooltipRow | null {
  if (s.median === null && s.unpriced === 0) return null
  const range = s.low !== null && s.high !== null && s.low !== s.high ? ` (${formatPlat(s.low)} to ${formatPlat(s.high)})` : ''
  const count = `${s.n} priced${s.unpriced > 0 ? `, ${s.unpriced} no price` : ''}`
  return { label, value: `${formatPlat(s.median)}${range} · ${count}`, color }
}

function Legend(): JSX.Element {
  const key = (color: string, label: string): JSX.Element => (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Box sx={{ width: 14, height: 3, borderRadius: 2, bgcolor: color }} />
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  )
  return (
    <Stack direction="row" spacing={2}>
      {key(ASK_COLOR, 'Asking (selling)')}
      {key(OFFER_COLOR, 'Offered (buying)')}
      <Typography variant="caption" color="text.disabled">
        Line: daily median. Band: that day&apos;s low to high. Dashed to the ring: predicted.
      </Typography>
    </Stack>
  )
}

/** The box's width, followed as it resizes. */
export function useWidth(box: React.RefObject<HTMLDivElement | null>): number {
  const [w, setW] = useState(600)
  useLayoutEffect(() => {
    const el = box.current
    if (el === null) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [box])
  return w
}

interface Hover {
  day: string
  x: number
  y: number
}

const QUOTES_ON_HOVER = 6

/** Who said it, and what: `17:54 Leric` · `20k  WTS Fleeting Quiver 20k pst`, a few per side. */
function quoteRows(s: BazaarSide, color: string): TooltipRow[] {
  const shown = s.quotes.slice(0, QUOTES_ON_HOVER).map((q) => ({
    label: `${q.at.slice(0, 5)} ${q.who}`,
    value: `${q.price === null ? '' : `${formatPlat(q.price)}  `}${q.msg.length > 70 ? `${q.msg.slice(0, 69)}…` : q.msg}`,
    color
  }))
  const more = s.quotes.length - shown.length
  return more > 0 ? [...shown, { value: `+${more} more (listed below the chart)` }] : shown
}

function HoverCard({ hov, p, w }: { hov: Hover; p: BazaarPoint; w: number }): JSX.Element {
  const sides = [sideRow('Asking', p.sell, ASK_COLOR), ...quoteRows(p.sell, ASK_COLOR), sideRow('Offered', p.buy, OFFER_COLOR), ...quoteRows(p.buy, OFFER_COLOR)]
  const rows = sides.flatMap((r) => (r === null ? [] : [r]))
  return (
    <ChartTooltip
      x={hov.x}
      y={hov.y}
      title={shortDay(p.day)}
      rows={rows.length > 0 ? rows : [{ value: `${p.trades} trade offer(s), no price` }]}
      note={p.trades > 0 && rows.length > 0 ? `${p.trades} trade offer(s)` : undefined}
      bounds={{ w, h: H }}
    />
  )
}

export function BazaarChart({ item, endDay }: { item: BazaarItem; endDay: string }): JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const w = useWidth(box)
  const [hov, setHov] = useState<Hover | null>(null)
  const g = geometry(item, endDay, w)
  const nearest = (px: number): BazaarPoint => {
    const t = g.t0 + ((px - M.left) / Math.max(1, w - M.left - M.right)) * (g.t1 - g.t0)
    let best = item.points[0]
    for (const p of item.points) if (Math.abs(timeOf(p.day) - t) < Math.abs(timeOf(best.day) - t)) best = p
    return best
  }
  const hp = hov === null ? undefined : item.points.find((p) => p.day === hov.day)
  return (
    <Stack spacing={1}>
      <Legend />
      <Box ref={box} sx={{ position: 'relative', width: '100%' }} data-testid="bazaar-chart">
        <svg width={w} height={H} role="img" aria-label={`${item.item} asking and offered prices by day`}>
          <Axes g={g} points={item.points} />
          {hov !== null && <line x1={g.x(hov.day)} x2={g.x(hov.day)} y1={M.top} y2={H - M.bottom} stroke={AXIS_TEXT} strokeWidth={1} />}
          <Series points={item.points} side="buy" color={OFFER_COLOR} g={g} hover={hov?.day ?? null} />
          <Series points={item.points} side="sell" color={ASK_COLOR} g={g} hover={hov?.day ?? null} />
          <Projection item={item} side="buy" endDay={endDay} color={OFFER_COLOR} g={g} />
          <Projection item={item} side="sell" endDay={endDay} color={ASK_COLOR} g={g} />
          <rect
            x={M.left}
            y={M.top}
            width={Math.max(0, w - M.left - M.right)}
            height={H - M.top - M.bottom}
            fill="transparent"
            onPointerMove={(e) => {
              const r = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
              if (r === undefined) return
              const px = e.clientX - r.left
              setHov({ day: nearest(px).day, x: px, y: e.clientY - r.top })
            }}
            onPointerLeave={() => setHov(null)}
          />
        </svg>
        {hov !== null && hp !== undefined && <HoverCard hov={hov} p={hp} w={w} />}
      </Box>
    </Stack>
  )
}

/** A row's 30-day trend: both medians, no axes, the newest value dotted. */
export function BazaarSparkline({ sell, buy }: { sell: (number | null)[]; buy: (number | null)[] }): JSX.Element {
  const SW = 110
  const SH = 26
  const vals = [...sell, ...buy].map((v) => v ?? 0)
  const top = Math.max(1, ...vals) * 1.1
  const n = Math.max(1, sell.length - 1)
  const pts = (vs: (number | null)[]): { x: number; y: number }[] =>
    vs.flatMap((v, i) => (v === null ? [] : [{ x: 3 + (i / n) * (SW - 6), y: SH - 3 - (v / top) * (SH - 6) }]))
  const draw = (vs: (number | null)[], color: string): JSX.Element | null => {
    const p = pts(vs)
    if (p.length === 0) return null
    const last = p[p.length - 1]
    return (
      <g>
        {p.length > 1 && <polyline points={p.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />}
        <circle cx={last.x} cy={last.y} r={2.5} fill={color} />
      </g>
    )
  }
  return (
    <svg width={SW} height={SH} aria-hidden>
      <line x1={0} x2={SW} y1={SH - 1} y2={SH - 1} stroke={GRID} strokeWidth={1} />
      {draw(buy, OFFER_COLOR)}
      {draw(sell, ASK_COLOR)}
    </svg>
  )
}
