// character/ExaltationAuditPanel.tsx - the cleanup advisor's panel (fork asks, kaltinril
// 2026-09-09, revised the same night: terse and actionable). Four short lists, each a verb:
//
//   SWAP  - a socketed gem with a strictly better LOOSE copy of the same effect family, usable
//           by the current loadout. These are also the RED cards on the grid.
//   FILL  - an open empty socket and the best remaining loose gem that fits it.
//   SCRAP - a loose lower tier whose better copy is also owned; safe to feed to a merge.
//   COPIES - duplicates, counted and never commanded (a spare may be for a second item).
//
// The greedy honesty clause lives on the recommender (exaltationAudit.ts): same-family swaps
// only, no invented cross-family exchange rate, one physical copy never recommended twice. This
// panel renders nothing when there is nothing to do.
//
// SINCE 2026-10-26 THE BEST LAYOUT IS DRAWN, NOT LISTED (Malkil via the owner: "a toggle ... so you
// can switch between current and recommended views, with changes highlighted"; owner: "more obvious,
// direct, and no reading"). The panel leads with the Current / Recommended toggle and one summary
// line; the grid shows each change on its chips. The benched "your call" trade-offs stay as short
// notes, and the lists above sit behind Details, every line kept (rule 19).

import { useState, type JSX } from 'react'
import { Button, Collapse, Paper, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { ownershipKey } from '@shared/planner/ownership'
import { KnownItemTooltip } from '../../lib/KnownItemTooltip'
import type { DuplicateFinding, ExaltationAudit } from './exaltationAudit'
import type { Recommendations } from './socketRecommend'
import type { BoardPlan } from './socketOptimize'
import type { BoardDiff } from './socketDiff'
import type { ExaltView } from './exaltPrefs'

/** An item name that opens the same hover card every other item name in the app opens. */
function Name({ children }: { children: string }): JSX.Element {
  return (
    <KnownItemTooltip name={children}>
      <Typography component="span" variant="body2" sx={{ textDecoration: 'underline dotted', textUnderlineOffset: 2 }}>
        {children}
      </Typography>
    </KnownItemTooltip>
  )
}

/** One list under one verb - nothing at all when the list is empty. */
function Section({ title, lines }: { title: string; lines: JSX.Element[] }): JSX.Element | null {
  if (lines.length === 0) return null
  return (
    <>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      {lines}
    </>
  )
}

function swapLines(recs: Recommendations): JSX.Element[] {
  return recs.swaps.map((s, i) => (
    <Typography key={`s${String(i)}`} variant="body2" color="text.secondary" data-testid="exaltation-swap">
      {`${s.cellLabel} ${s.type}: `}
      <Name>{s.fromName}</Name>
      {` (${s.fromEffect}) → `}
      <Name>{s.toName}</Name>
      {` (${s.toEffect}), copy in ${s.toWhere}`}
    </Typography>
  ))
}

function fillLines(recs: Recommendations): JSX.Element[] {
  return recs.fills.map((f, i) => (
    <Typography key={`f${String(i)}`} variant="body2" color="text.secondary" data-testid="exaltation-fill">
      {`${f.cellLabel} ${f.type} is empty: socket `}
      <Name>{f.gemName}</Name>
      {` (${f.effect}) from ${f.where}`}
    </Typography>
  ))
}

function redundantLines(recs: Recommendations): JSX.Element[] {
  return recs.redundant.map((r, i) => (
    <Typography key={`r${String(i)}`} variant="body2" color="text.secondary" data-testid="exaltation-redundant">
      {r.noBenefit !== undefined
        ? `${r.cellLabel} ${r.type}: ${r.effect} does nothing for you (it only helps ${r.noBenefit})`
        : r.keptEffect === r.effect
        ? `${r.cellLabel} ${r.type}: a second ${r.effect} adds nothing (one is in ${r.keptIn})`
        : `${r.cellLabel} ${r.type}: ${r.effect} grants nothing (${r.keptEffect} in ${r.keptIn} outranks it)`}
      {r.replaceWith === undefined ? null : (
        <>
          {` → socket `}
          <Name>{r.replaceWith.name}</Name>
          {` (${r.replaceWith.effect}) from ${r.replaceWith.where}`}
        </>
      )}
    </Typography>
  ))
}

/**
 * EVERY GEM THIS PANEL IS, SOMEWHERE ELSE IN ITSELF, TELLING YOU TO SOCKET.
 *
 * The panel runs two independent engines - `socketRecommend` writes the board lists, `exaltationAudit`
 * writes the passive findings - and neither has ever read the other. A tester caught what that costs
 * (Malkil via kaltinril, 2026-09-11): `socket Adamantite Band (Summoning Haste I)` four lines above
 * `Adamantite Band ... outclassed by Brell's Girdle (Summoning Haste III)`. Both sentences were
 * defensible on their own and together they are nonsense.
 *
 * THE FILL PASS'S OWN HALF OF THAT BUG IS FIXED AT THE SOURCE (`socketRecommend.fillPass` now
 * refuses a family the board already grants). This is the remaining half, and it is a PANEL
 * question rather than an engine one: even when a fill is right - the better copy cannot reach any
 * seat, so the lesser one really is the best you can socket - a Scrap heading over it contradicts
 * the instruction above it. So the word SCRAP is withheld from anything the panel is spending.
 *
 * Keyed through `ownershipKey`, because the two engines name gems from different sides: the audit
 * from the dump's own spelling, the recommender from the corpus row.
 */
function inUse(recs: Recommendations, plan: BoardPlan | null): Set<string> {
  const out = new Set<string>()
  for (const f of recs.fills) out.add(ownershipKey(f.gemName))
  for (const w of recs.swaps) out.add(ownershipKey(w.toName))
  for (const r of recs.redundant) {
    if (r.replaceWith !== undefined) out.add(ownershipKey(r.replaceWith.name))
  }
  for (const m of plan?.moves ?? []) out.add(ownershipKey(m.gemName))
  return out
}

/** Loose lower tiers only - the socketed ones are the SWAP list's and the red cards' job. */
function scrapLines(audit: ExaltationAudit, spending: ReadonlySet<string>): JSX.Element[] {
  return audit.superseded
    .filter((f) => !f.socketed && !spending.has(ownershipKey(f.name)))
    .map((f, i) => (
      <Typography key={`x${String(i)}`} variant="body2" color="text.secondary" data-testid="exaltation-scrap">
        <Name>{f.name}</Name>
        {` (${f.effect}) in ${f.wheres.join(', ')} - outclassed by `}
        <Name>{f.betterName}</Name>
        {` (${f.betterEffect})`}
      </Typography>
    ))
}

/** The trade-offs only a player can judge: a family benched because its seats hold others. */
function benchedLines(plan: BoardPlan): JSX.Element[] {
  return plan.contested
    .filter((c) => !c.noSeat)
    .map((c, i) => (
      <Typography key={`c${String(i)}`} variant="body2" color="text.secondary" data-testid="exaltation-plan-contested">
        {'Benched: '}
        <Name>{c.gemName}</Name>
        {` (${c.effect}) - ${c.options.map((o) => `${o.cellLabel} holds ${o.heldBy}`).join('; ')}. Your call.`}
      </Typography>
    ))
}

/** Gems with no legal socket on what you wear - a fact for Details, nothing to act on. */
function noSeatLines(plan: BoardPlan): JSX.Element[] {
  return plan.contested
    .filter((c) => c.noSeat)
    .map((c, i) => (
      <Typography key={`n${String(i)}`} variant="body2" color="text.secondary" data-testid="exaltation-plan-noseat">
        {`${c.effect} (`}
        <Name>{c.gemName}</Name>
        {') has no legal socket on what you wear'}
      </Typography>
    ))
}

/** The one line under the toggle: how far today's board is from the best one. */
function summaryOf(diff: BoardDiff | null, view: ExaltView): string {
  const n = diff?.bySeat.size ?? 0
  if (n === 0) return 'Your sockets already hold the best layout you own.'
  if (view === 'recommended') return 'Best layout: green goes in, red comes out.'
  return `Best layout: ${String(n)} socket${n === 1 ? '' : 's'} to change. Switch to Recommended to see them.`
}

/** Current / Recommended, as one switch; drawn only while the plan changes something. */
function ViewToggle({ view, onView }: { view: ExaltView; onView: (v: ExaltView) => void }): JSX.Element {
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={view}
      onChange={(_e, v: ExaltView | null) => {
        if (v !== null) onView(v)
      }}
      sx={{ '& .MuiToggleButton-root': { py: 0.1, px: 1, fontSize: 11, textTransform: 'none' } }}
    >
      <ToggleButton value="current" data-testid="exalt-view-current">
        Current
      </ToggleButton>
      <ToggleButton value="recommended" data-testid="exalt-view-recommended">
        Recommended
      </ToggleButton>
    </ToggleButtonGroup>
  )
}

function copyLine(f: DuplicateFinding): JSX.Element {
  return (
    <Typography key={f.name} variant="caption" color="text.secondary" data-testid="exaltation-duplicate">
      <Name>{f.name}</Name>
      {` x${String(f.copies)} (${String(f.socketed)} socketed): ${f.wheres.join(', ')}`}
    </Typography>
  )
}

/** The lists behind Details: every line the panel printed before the grid drew the plan. */
interface DetailLists {
  swaps: JSX.Element[]
  redundant: JSX.Element[]
  fills: JSX.Element[]
  noSeat: JSX.Element[]
  scrap: JSX.Element[]
  copies: JSX.Element[]
}

function detailLists(recs: Recommendations, audit: ExaltationAudit, plan: BoardPlan | null): DetailLists {
  return {
    swaps: swapLines(recs),
    redundant: redundantLines(recs),
    fills: fillLines(recs),
    noSeat: plan === null ? [] : noSeatLines(plan),
    scrap: scrapLines(audit, inUse(recs, plan)),
    copies: audit.duplicates.map(copyLine)
  }
}

const countOf = (l: DetailLists): number =>
  l.swaps.length + l.redundant.length + l.fills.length + l.noSeat.length + l.scrap.length + l.copies.length

/** The Details switch and the lists it opens, closed by default (owner: "no reading"). */
function Details({ lists }: { lists: DetailLists }): JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (countOf(lists) === 0) return null
  return (
    <>
      <Button
        size="small"
        onClick={() => setOpen((d) => !d)}
        data-testid="exaltation-details-toggle"
        sx={{ alignSelf: 'flex-start', p: 0, minWidth: 0, textTransform: 'none', fontSize: 12 }}
      >
        {open ? 'Hide details' : 'Details'}
      </Button>
      <Collapse in={open} unmountOnExit>
        <Stack spacing={0.5}>
          <Section title="Swap (the red cards)" lines={lists.swaps} />
          <Section title="Dead sockets (it does not stack, or helps no class you play)" lines={lists.redundant} />
          <Section title="Fill an empty socket" lines={lists.fills} />
          <Section title="No socket fits" lines={lists.noSeat} />
          <Section title="Scrap candidates" lines={lists.scrap} />
          <Section title="Copies" lines={lists.copies} />
          <Typography variant="caption" color="text.disabled">
            Assumes same-name effects do not stack (only the highest applies), except a proc, which
            counts per weapon: one in each hand both fire. Upgrades compare within one effect family
            only; nothing is changed for you.
          </Typography>
        </Stack>
      </Collapse>
    </>
  )
}

/** What the panel draws from: the two engines, the plan and its diff, and the view controls. */
export interface ExaltationAuditProps {
  recs: Recommendations | null
  audit: ExaltationAudit | null
  plan: BoardPlan | null
  diff: BoardDiff | null
  /** the folded deity key, or null when nothing has stated one - see the caption at the foot */
  deity: string | null
  view: ExaltView
  onView: (v: ExaltView) => void
  lockedCount: number
}

export default function ExaltationAuditPanel({
  recs,
  audit,
  plan,
  diff,
  deity,
  view,
  onView,
  lockedCount
}: ExaltationAuditProps): JSX.Element | null {
  if (recs === null || audit === null) return null
  const benched = plan === null ? [] : benchedLines(plan)
  const lists = detailLists(recs, audit, plan)
  const changes = diff?.bySeat.size ?? 0
  if (changes + benched.length + countOf(lists) + lockedCount === 0) return null
  return (
    <Paper variant="outlined" data-testid="exaltation-audit" sx={{ p: 1.5 }}>
      <Stack spacing={0.5}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Typography variant="subtitle2">Exaltation cleanup</Typography>
          {changes > 0 && <ViewToggle view={view} onView={onView} />}
        </Stack>
        <Typography variant="body2" data-testid="exaltation-plan-summary">
          {summaryOf(diff, view)}
        </Typography>
        {benched}
        {lockedCount > 0 && (
          <Typography variant="caption" color="text.secondary" data-testid="exaltation-locked-count">
            {`${String(lockedCount)} locked - the layout works around ${lockedCount === 1 ? 'it' : 'them'}.`}
          </Typography>
        )}
        <Details lists={lists} />
        {/* R2's fourth condition is off until the one file that states a deity has been read
            (owner report 2026-09-11). Saying so is the difference between advice that is narrowed
            and advice that merely looks narrowed - `planner/deity.deityFits` passes on a null and
            a reader has no way to know that from the lists above. */}
        {deity === null && (
          <Typography variant="caption" color="text.disabled" data-testid="exaltation-deity-unknown">
            Deity is not checked yet: type /outputfile achievements in game and this list will stop
            offering gems your deity cannot use.
          </Typography>
        )}
      </Stack>
    </Paper>
  )
}
