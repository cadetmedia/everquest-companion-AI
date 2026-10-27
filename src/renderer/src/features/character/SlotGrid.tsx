// character/SlotGrid — the armory grid: two flanking columns and the bottom row.
//
// The column split is the game's own inventory window (shared/characterSheet.ts SHEET_SLOTS),
// which is also the armory shape: eight down the left, eight down the right, hands/rings/ammo
// along the bottom. On a narrow window the three groups stack instead of squeezing.
//
// EVERY CELL IS ALWAYS DRAWN, filled or not. An empty slot is the point of a character sheet —
// it is the thing you have not equipped — so it renders quiet (the slot's name, dimmed) rather
// than being omitted, and it is never an error or a warning.
//
// The item name is the hover surface, through `KnownItemTooltip` — the SAME card every other
// item name in the app opens, which fetches its knowledge only while the tooltip is open. The
// icon is `eqimg://item/<id>` off the permanent cache and hides itself if the fetch 404s.
//
// ---------------------------------------------------------------------------
// AND SINCE JOS-327 A CELL SHOWS WHAT IS SOCKETED INTO IT
// ---------------------------------------------------------------------------
// An exaltation is the whole point of the Exaltations tab, and until now the one place the game
// states which ones a player has ALREADY SOCKETED — the inventory dump — was parsed for them
// (`SheetItem.exaltations`) and then not drawn. Each worn item's exaltations render as small chips
// under its name: no hover, no click, no count line. They are a fact about the item, so they sit on
// the item.
//
// THE CHIPS ARE CONFIDENT HERE, AND THAT IS A PROPERTY OF *WORN* SLOTS. The dump spells bag
// CONTENTS and exaltation SOCKETS the same way — both are `-Slot<n>` children, and `Slots` is
// merely how many child slots the parent provides (shared/outputs/inventory.ts, "what the file does
// NOT say"). The one thing the file volunteers is the child's NAME: `<Item> (Exaltation)`. That
// suffix is what `exaltationsOf` reads, so a chip here is the client's own word and not an
// inference — and the ambiguity that would matter, a ten-slot BAG being read as a ten-socket item,
// cannot arise in a cell of this grid, because a top-level `Location` equipment row is a thing worn
// on the body and nobody wears a backpack in an ear. The general case is left to
// `looksLikeContainer()`, which is an opt-in guess with its evidence attached; this surface never
// needs it. None of that reaches the screen: there is no "probably" chip and no footnote.
//
// ---------------------------------------------------------------------------
// AND TWO MORE ROWS SINCE THE OWNER ASK OF 2026-08-23 (slotSockets.ts owns the join)
// ---------------------------------------------------------------------------
// Under the socketed chips, the SOCKET LINE — which of the four transferable sockets the item's
// ` +N` has opened — and, last, the WISH CHIPS: every wish on this character's list whose corpus row
// fits the cell's slot, gear wishes and donor wishes alike. Both rows are read, never inferred: the
// socket line is the wiki's unlock table at the tier the dump's own name stated, and a wish chip is
// a line the user already wrote. The grid closes with a one-line legend for the two rows, because a
// filled chip and a dimmed chip are a code, and a code with no key is a guess.

import type { JSX } from 'react'
import { Box, Chip, Paper, Stack, Typography } from '@mui/material'
import Tooltip from '../../lib/Tooltip'
import type { SheetCellView, SheetColumn } from '@shared/characterSheet'
import type { EquipSlot } from '@shared/planner/types'
import {
  cellsShowingWishes,
  slotOfCell,
  socketChips,
  unplacedExaltations,
  type SlotWish,
  type SocketChip,
  type SocketedItem
} from './slotSockets'
import { ownershipKey } from '@shared/planner/ownership'
import type { KindEffect } from './exaltationAudit'
import { EQ_ITEM_COLORS, itemIconUrl } from '../../lib/ItemWindow'
import { KnownItemTooltip } from '../../lib/KnownItemTooltip'
import { ChangedSeat, lockProps, lockWords } from './PlannedSockets'
import type { SeatChange } from './socketDiff'

const ICON = 28

/** The one chip geometry every row under an item name shares. */
const SMALL_CHIP = {
  height: 16,
  maxWidth: '100%',
  '& .MuiChip-label': { px: 0.5, fontSize: 10, lineHeight: 1.6 }
}

/** The one row geometry those chips wrap in. */
const CHIP_ROW = { display: 'flex', flexWrap: 'wrap', gap: 0.3, mt: 0.3 } as const

/** The item's icon, or a same-sized empty frame so every cell lines up. */
function SlotIcon({ cell }: { cell: SheetCellView }): JSX.Element {
  const iconId = cell.item?.iconId
  return (
    <Box
      sx={{
        width: ICON,
        height: ICON,
        flexShrink: 0,
        borderRadius: 0.5,
        border: '1px solid',
        borderColor: cell.item ? EQ_ITEM_COLORS.border : 'divider',
        bgcolor: 'rgba(255,255,255,0.03)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {iconId !== undefined && (
        <Box
          component="img"
          src={itemIconUrl(iconId)}
          alt=""
          onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
            e.currentTarget.style.display = 'none'
          }}
          sx={{ width: ICON - 4, height: ICON - 4, imageRendering: 'pixelated' }}
        />
      )}
    </Box>
  )
}

/** A filled chip's words: the effect on the chip; the gem, its detail, the red reason and the lock
 *  on the hover. The Recommended view shows the plan, so the Current view's red advice stays off it. */
function dressFilled(c: SocketChip, cellId: string, advice?: SocketAdvice): { label: string; hover: string; bad: boolean } {
  const name = c.label.slice(c.type.length + 2)
  const reason = advice?.recommended === true ? undefined : advice?.reasonOf(cellId, ownershipKey(name))
  const eff = advice?.effectOf(ownershipKey(name), c.type) ?? null
  const label = eff === null ? c.label : `${c.type}: ${eff.effect}`
  const detail = eff?.detail === undefined ? '' : ` ${eff.detail}`
  const locked = lockWords(advice, { cellId, type: c.type }, name)
  return {
    label,
    hover: `${c.type} socket - ${name}${eff === null ? '' : `: ${eff.effect}${detail}`}.${reason === undefined ? '' : ` ${reason}`}${locked}`,
    bad: reason !== undefined
  }
}

/**
 * THE MERGED SOCKET ROW (fork asks, kaltinril 2026-09-09, revised same night: "too wordy"). One
 * chip per socket, and a FILLED chip now leads with the EFFECT the gem grants — `Improved Healing
 * III` — because the effect is what the player socketed it for; the donor's name and the socket
 * type move to the hover, with the corpus's own detail line. Where the corpus does not know the
 * donor (or states no effect of that kind) the chip falls back to `Type: Name`, the honest
 * pre-revision spelling. `slotSockets.socketChips` still decides state; a gem a swap wants OUT
 * (`flagged`) wears the error colour, and its hover says where the better copy sits.
 */
function SocketRow({
  item,
  cellId,
  advice
}: {
  item: SocketedItem & { exaltations: readonly string[] }
  cellId: string
  advice?: SocketAdvice
}): JSX.Element | null {
  const chips = socketChips(item)
  const leftover = unplacedExaltations(item.exaltations, item.sockets)
  if (chips.length === 0 && leftover.length === 0) return null
  // A filled chip self-describes its socket (user review 2026-09-09: a wrapped row left “Serpent
  // Sight” floating between two bare type words), and its hover carries THE REASON it is red —
  // the same sentence the cleanup panel prints — rather than pointing at the panel. An empty
  // chip's hover carries its FILL suggestion when the recommender has one.
  const dress = (c: SocketChip): { label: string; hover: string; bad: boolean } => {
    if (c.state !== 'filled') {
      const hint = advice?.fillHintOf(cellId, c.type)
      return { label: c.label, hover: hint === undefined ? c.hover : `${c.hover} ${hint}`, bad: false }
    }
    return dressFilled(c, cellId, advice)
  }
  // The Recommended view (owner ask 2026-10-26): a seat the plan changes draws its change instead.
  const changeOf = (type: string): SeatChange | undefined =>
    advice?.recommended === true ? advice.changeOf(cellId, type) : undefined
  return (
    <Box data-testid="character-sockets" sx={CHIP_ROW}>
      {chips.map((c) => {
        const change = changeOf(c.type)
        if (change !== undefined && advice !== undefined) return <ChangedSeat key={c.type} change={change} advice={advice} />
        const d = dress(c)
        const lock = c.state === 'filled' ? lockProps(advice, { cellId, type: c.type }, c.label.slice(c.type.length + 2)) : {}
        const chip = (
          <Chip
            label={d.label}
            size="small"
            color={d.bad ? 'error' : 'default'}
            variant={c.state === 'filled' ? 'filled' : 'outlined'}
            data-state={c.state}
            data-testid={`character-socket-${c.type.toLowerCase()}`}
            onDelete={lock.onDelete}
            deleteIcon={lock.deleteIcon}
            sx={{
              ...SMALL_CHIP,
              opacity: c.state === 'filled' ? 1 : 0.5,
              ...(c.state === 'filled' && !d.bad ? { borderColor: EQ_ITEM_COLORS.border } : {}),
              ...lock.sx
            }}
          />
        )
        // A FILLED socket holds a gem, and a gem is an item: the item card, with the socket's own
        // sentence under the item window (owner ask, 2026-10-03). An empty socket keeps its text.
        if (c.state !== 'filled') {
          return (
            <Tooltip key={c.type} title={d.hover}>
              {chip}
            </Tooltip>
          )
        }
        return (
          <KnownItemTooltip
            key={c.type}
            name={c.label.slice(c.type.length + 2)}
            clickThrough
            extra={<Typography component="div" sx={{ fontSize: 11, mt: 0.5 }}>{d.hover}</Typography>}
          >
            {chip}
          </KnownItemTooltip>
        )
      })}
      {leftover.map((name, i) => (
        <KnownItemTooltip
          // The same exaltation can legitimately be socketed twice into one item, so the name is
          // not a key — the position is.
          key={`${name}#${String(i)}`}
          name={name}
          clickThrough
        >
          <Chip
            label={name}
            size="small"
            variant="outlined"
            data-testid="character-exaltation"
            sx={{ ...SMALL_CHIP, borderColor: EQ_ITEM_COLORS.border }}
          />
        </KnownItemTooltip>
      ))}
    </Box>
  )
}

/**
 * One clause per hover, and the clause is the thing the chip's own label does not say: a donor
 * chip is labelled by EFFECT, so its hover names the item it comes out of (and the merge tier that
 * lets it out); a gear chip is labelled by ITEM, so its hover says only why it is here. The route
 * to go and get either is the Wish list tab's, and the legend under the grid says so once rather
 * than every chip saying it.
 */
function wishHover(w: SlotWish): string {
  if (w.kind === 'gear') return 'On your wish list - an item you want for this slot, not one you own.'
  // "From X" read as "you have an X" (user report, kaltinril 2026-09-09 - it sent him searching
  // his bank for a bracelet he never owned). The hover now says the whole sentence: this is a
  // wish, the donor is the FARM TARGET, and the tier is the merge that lets the effect out.
  const source =
    w.tierRequired === undefined
      ? `extracted from a ${w.name}`
      : `extracted from a ${w.name} merged to +${String(w.tierRequired)}`
  return `On your wish list - this effect is ${source}. You do not own it yet; the Wish list tab has the route.`
}

/**
 * THE WISHES THAT BELONG HERE — every wish whose corpus row fits this cell's slot
 * (`slotSockets.wishesBySlot`, the R2 transfer rule read for display). Drawn on EMPTY cells too:
 * "what I want for each slot" is exactly as much a fact about a bare wrist as a full one. A DONOR
 * chip names the effect (what the wish was about) and a GEAR chip names the item (the wish IS the
 * item); the two wear different colours so a cell that carries both reads as two questions.
 */
function SlotWishChips({ wishes }: { wishes: readonly SlotWish[] }): JSX.Element | null {
  if (wishes.length === 0) return null
  return (
    <Box data-testid="character-slot-wishes" sx={CHIP_ROW}>
      {/* Each wish is an item, so it hovers with the item card; the wish's own sentence rides
          under the item window (owner ask, 2026-10-03: no bare item names). */}
      {wishes.map((w, i) => (
        <KnownItemTooltip
          key={`${w.name}#${String(i)}`}
          name={w.name}
          clickThrough
          extra={<Typography component="div" sx={{ fontSize: 11, mt: 0.5 }}>{wishHover(w)}</Typography>}
        >
          <Chip
            label={`♥ ${w.effect ?? w.name}`}
            size="small"
            color={w.kind === 'donor' ? 'warning' : 'info'}
            variant="outlined"
            data-testid={`character-slot-wish-${w.kind}`}
            sx={SMALL_CHIP}
          />
        </KnownItemTooltip>
      ))}
    </Box>
  )
}

/**
 * One cell: icon, slot label, then — for a worn item — the item name (hoverable), its socketed
 * exaltations and its socket line, or a quiet empty line; and last, filled or not, the wishes
 * placed at this cell's slot.
 */
function SlotCell({
  cell,
  wishes,
  advice
}: {
  cell: SheetCellView
  wishes: readonly SlotWish[]
  advice?: SocketAdvice
}): JSX.Element {
  const item = cell.item
  // The red card is the Current view's advice; the Recommended view colours the chips instead.
  const flagged = advice?.recommended === true ? undefined : advice?.flaggedByCell.get(cell.id)
  return (
    <Paper
      variant="outlined"
      data-testid={`character-slot-${cell.id}`}
      data-flagged={flagged !== undefined && flagged.size > 0 ? 'true' : undefined}
      sx={{
        p: 0.6,
        display: 'flex',
        gap: 0.75,
        alignItems: 'center',
        minWidth: 0,
        // The red card (fork ask 2026-09-09): a cell whose socketed gem has a strictly better
        // loose copy wears the warning on the CARD, and the chip's hover carries the sentence.
        ...(flagged !== undefined && flagged.size > 0
          ? { borderColor: 'error.main', bgcolor: 'rgba(244,67,54,0.08)' }
          : {})
      }}
    >
      <SlotIcon cell={cell} />
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', lineHeight: 1.2 }}>
          {cell.label}
        </Typography>
        {item ? (
          <>
            <KnownItemTooltip name={item.name}>
              <Box
                component="span"
                sx={{
                  display: 'block',
                  color: EQ_ITEM_COLORS.name,
                  fontSize: 12,
                  lineHeight: 1.3,
                  textDecoration: 'underline dotted',
                  textUnderlineOffset: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {item.name}
              </Box>
            </KnownItemTooltip>
            <SocketRow item={item} cellId={cell.id} advice={advice} />
          </>
        ) : (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', opacity: 0.6 }}>
            empty
          </Typography>
        )}
        <SlotWishChips wishes={wishes} />
      </Box>
    </Paper>
  )
}

/** The empty default: a grid with no wish map draws exactly what it drew before this feature. */
const NO_WISHES: ReadonlyMap<EquipSlot, readonly SlotWish[]> = new Map()
const NONE: readonly SlotWish[] = []

type WishesOf = (cell: SheetCellView) => readonly SlotWish[]

/**
 * The one lookup every cell goes through: nothing unless this cell is the one of its slot's pair
 * that carries the wishes (`cellsShowingWishes`), else the slot's list.
 */
function wishLookup(
  slotWishes: ReadonlyMap<EquipSlot, readonly SlotWish[]>,
  showing: ReadonlySet<string>
): WishesOf {
  return (cell) => {
    if (!showing.has(cell.id)) return NONE
    const slot = slotOfCell(cell.location)
    return (slot && slotWishes.get(slot)) ?? NONE
  }
}

function Column({
  cells,
  wishesOf,
  advice
}: {
  cells: SheetCellView[]
  wishesOf: WishesOf
  advice?: SocketAdvice
}): JSX.Element {
  return (
    <Stack spacing={0.6} sx={{ flex: 1, minWidth: 190 }}>
      {cells.map((c) => (
        <SlotCell key={c.id} cell={c} wishes={wishesOf(c)} advice={advice} />
      ))}
    </Stack>
  )
}

/**
 * The key to the two coded rows, in one caption, shown only while there is something on the grid
 * for it to explain. It is also where "where to get them" is answered, once: the chips are dead
 * ends by construction (this tab takes no router), so the legend names the tab that has the route.
 */
function Legend({
  sockets,
  wishes,
  recommended
}: {
  sockets: boolean
  wishes: boolean
  recommended: boolean
}): JSX.Element | null {
  if (!sockets && !wishes) return null
  const parts: string[] = []
  if (sockets && recommended) parts.push('Recommended layout: green goes in, red comes out. The padlock keeps a gem where it is.')
  else if (sockets)
    parts.push(
      'Sockets: a filled chip names the effect socketed there (hover for the gem), a dimmed bare type is open and empty, "@+N" opens at that merge, red wants a swap, the padlock keeps a gem where it is.'
    )
  if (wishes) parts.push('Wish chips are your wish list - the Wish list tab has the route.')
  return (
    <Typography variant="caption" color="text.secondary" data-testid="character-slot-legend">
      {parts.join(' ')}
    </Typography>
  )
}

const inColumn = (cells: SheetCellView[], column: SheetColumn): SheetCellView[] =>
  // eslint-disable-next-line eqc/no-domain-munging -- JOS-459 cutover ledger item 3: no served view source answers this yet, so the renderer still derives SheetCellView. Becomes a view descriptor when the source lands.
  cells.filter((c) => c.column === column)

/** What the advisor hands the grid: the effect lookup, the per-gem reason a chip is red (the
 *  cleanup panel's own sentence), and the fill suggestion an empty socket's hover can carry. */
export interface SocketAdvice {
  effectOf: (key: string, type: string) => KindEffect | null
  flaggedByCell: ReadonlyMap<string, ReadonlySet<string>>
  reasonOf: (cellId: string, key: string) => string | undefined
  fillHintOf: (cellId: string, type: string) => string | undefined
  /** true while the player has locked today's gem in this seat */
  lockedAt: (cellId: string, type: string) => boolean
  /** lock or unlock the gem in a seat; absent until the character is known */
  toggleLock?: (cellId: string, type: string, gemKey: string) => void
  /** the Recommended layout's change for a seat, if it has one */
  changeOf: (cellId: string, type: string) => SeatChange | undefined
  /** what a gem needs to help you, when it helps no class you play */
  uselessNeeds: (key: string, type: string) => string | undefined
  /** draw the Recommended layout instead of today's board (owner ask 2026-10-26) */
  recommended?: boolean
}

export default function SlotGrid({
  cells,
  slotWishes = NO_WISHES,
  advice
}: {
  cells: SheetCellView[]
  /** wishes placed by slot (`slotSockets.wishesBySlot`); absent draws the pre-feature grid */
  slotWishes?: ReadonlyMap<EquipSlot, readonly SlotWish[]>
  /** the recommender's output (`exaltationAudit.recommendSockets`); absent draws no flags */
  advice?: SocketAdvice
}): JSX.Element {
  const bottom = inColumn(cells, 'bottom')
  const wishesOf = wishLookup(slotWishes, cellsShowingWishes(cells))
  return (
    <Stack spacing={0.6} data-testid="character-slot-grid">
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={0.6} alignItems="stretch">
        <Column cells={inColumn(cells, 'left')} wishesOf={wishesOf} advice={advice} />
        <Column cells={inColumn(cells, 'right')} wishesOf={wishesOf} advice={advice} />
      </Stack>
      {/* The bottom row wraps rather than shrinking — a weapon name is world-supplied text. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
        {bottom.map((c) => (
          <Box key={c.id} sx={{ flex: '1 1 190px', minWidth: 190 }}>
            <SlotCell cell={c} wishes={wishesOf(c)} advice={advice} />
          </Box>
        ))}
      </Box>
      <Legend
        sockets={cells.some((c) => c.item?.tier !== undefined)}
        wishes={cells.some((c) => wishesOf(c).length > 0)}
        recommended={advice?.recommended === true}
      />
    </Stack>
  )
}
