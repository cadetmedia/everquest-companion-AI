// factions/FactionReceipt.tsx — one quest's WHOLE faction receipt, under its line in the work
// panel: every faction the page says the turn-in moves, signed and coloured (owner ask,
// 2026-10-12: "see the total faction hit, +2 -1 etc"). Split out of FactionWorkPanel.tsx at the
// measured file ceiling.
//
// EACH FACTION NAME IS THE DON'T-CARE TOGGLE (factionCare.ts): the receipt is where a player
// meets "-? Butcherblock Bandits" and decides they do not mind, so the mark is made right there.
// A don't-care loss is struck through and dimmed; a loss on a faction no quest on record raises
// says so on its hover, the catalog's best hint that the faction is safe to let fall. The badge
// in front is the verdict: ✓ when no stated loss lands on a faction the player cares about.

import { type JSX } from 'react'
import { Box, Typography } from '@mui/material'
import { caredLosses } from './factionCare'
import type { FactionQuestRef, ReceiptHit } from './factionQuests'

/** What the receipt reads beside the quest: the marks, the toggle, and the raisable set. */
export interface ReceiptLinks {
  dontCare?: ReadonlySet<string>
  onToggleDontCare?: (key: string) => void
  /** factions some quest raises (factionQuests.raisedFactionKeys) */
  raisable?: ReadonlySet<string>
}

const NONE: ReadonlySet<string> = new Set()

function signed(h: ReceiptHit): string {
  if (h.amount === undefined) return h.up ? '+?' : '−?'
  return h.amount > 0 ? `+${String(h.amount)}` : `−${String(Math.abs(h.amount))}`
}

/** The hover: what clicking does, and — on a loss — whether any quest can win it back. */
function hitTitle(h: ReceiptHit, marked: boolean, raisable: ReadonlySet<string> | undefined): string {
  const click = marked ? 'click: I care about this faction again' : "click: mark don't care"
  if (h.up || raisable === undefined || raisable.has(h.key)) return click
  return `no quest on record raises ${h.name} - ${click}`
}

function HitChip({
  hit,
  self,
  links
}: {
  hit: ReceiptHit
  /** the expanded faction's own hit — bold, since the panel is about it */
  self: boolean
  links: ReceiptLinks
}): JSX.Element {
  const marked = links.dontCare?.has(hit.key) === true
  const toggle = links.onToggleDontCare
  const lossColor = marked ? 'text.disabled' : 'error.main'
  return (
    <Box
      component="span"
      data-testid="factions-receipt-hit"
      title={hitTitle(hit, marked, links.raisable)}
      onClick={
        toggle === undefined
          ? undefined
          : (e) => {
              e.stopPropagation()
              toggle(hit.key)
            }
      }
      sx={{
        color: hit.up ? 'success.main' : lossColor,
        fontWeight: self ? 700 : 400,
        textDecoration: marked ? 'line-through' : 'none',
        cursor: toggle === undefined ? 'default' : 'pointer',
        whiteSpace: 'nowrap'
      }}
    >
      {signed(hit)} {hit.name}
    </Box>
  )
}

/** The receipt line, or nothing for a quest whose page stated no faction effect. */
export default function FactionReceipt({
  quest,
  selfKey,
  links
}: {
  quest: FactionQuestRef
  selfKey?: string
  links: ReceiptLinks
}): JSX.Element | null {
  if (quest.hits.length === 0) return null
  const hurts = caredLosses(quest, links.dontCare ?? NONE)
  return (
    <Typography variant="caption" component="div" data-testid="factions-receipt" sx={{ display: 'block' }}>
      {hurts.length === 0 ? (
        <Box
          component="span"
          data-testid="factions-receipt-clean"
          title="no stated loss on a faction you care about"
          sx={{ color: 'success.main', fontWeight: 700, mr: 0.75 }}
        >
          ✓
        </Box>
      ) : (
        <Box component="span" sx={{ color: 'text.secondary', mr: 0.75 }}>
          factions:
        </Box>
      )}
      {quest.hits.map((h, i) => (
        <Box component="span" key={`${h.key}:${String(i)}`}>
          {i > 0 && ', '}
          <HitChip hit={h} self={h.key === selfKey} links={links} />
        </Box>
      ))}
    </Typography>
  )
}
