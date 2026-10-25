// planner/EffectFilterBar.tsx — the Effects browser's one toolbar row.
//
// Split out of `EffectBrowser.tsx` when the non-equippable toggle pushed that file past the
// measured 400-code-line ceiling (2026-08-04), and this is the seam the ceiling was pointing at:
// the browser is a windowed LIST, the bar is a set of independent CONTROLS, and they share nothing
// but the filter object they read and write. No behaviour changed in the move.
//
// ONE NOWRAP ROW (the flexWrap law): every control keeps its size and the search box is the only
// thing allowed to shrink — a bar that wraps turns a toolbar into a growing block and pushes the
// list it filters off the bottom of the pane.
//
// FIVE CONTROLS, TWO KINDS. Socket type / search / slot are this mount's own state; "Usable by
// these classes" reads the browse's class filter (JOS-326: it used to read the selected SET's
// trio, and the sets' switcher is gone — the filter itself is not). "Current era",
// "Non-equippable" and "Group by" are the PERSISTED set (`eq.planner.*`), handed in as their
// `useState`-shaped tuples so this file owns none of that storage — see plannerData for what each
// one means and why the two toggles' defaults are opposites.
//
// …AND ONE LEADING CHIP THAT NAMES THE ITEM (JOS-210). It is one control in two states: nothing
// picked, so it offers to pick; or an item picked, so it says which and can be cleared. The SOCKET
// TABS do not clear it, because "show me this item's worn effects instead of its procs" is one
// question, not two (the bug half of JOS-210: every filter-bar write used to hand the browser back).
//
// GROUP BY offers only the axes its socket tab can serve (`plannerGroups.axesFor` — "Focus family"
// exists on the Focus tab and nowhere else), so the control can never ask for a fold the model
// would answer with one header.
//
// AND NO POPPER (JOS-143). The three toggle chips sit immediately right of the Slot and Group by
// selects on a NOWRAP row, and their hints are sentences — a popper is centred on its anchor, so a
// card wide enough to hold "Hide donors from outside <era>" reaches back across the select beside
// it and, being interactive by default, eats the click aimed at that select. The hints are native
// `title`s now: same words, no DOM node, no hit area.

import { type JSX, useState } from 'react'
import { Box, Chip, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material'
import { EQUIP_SLOTS, type EquipSlot, type SocketType } from '@shared/planner/types'
import ItemFilterPicker from './ItemFilterPicker'
import { CURRENT_ERA_LABEL, type DonorFilters, type OwnedMode } from './plannerData'
import { AXIS_LABEL, SOCKET_LABEL, axesFor, type GroupAxis } from './plannerGroups'
import type { ItemFocus } from './plannerPreset'

/** The socket tabs, in the order the planner leads with (proc first — see DEFAULT_FILTERS). */
const SOCKETS: SocketType[] = ['proc', 'worn', 'focus', 'click']

/**
 * The bar's ON/OFF idiom: one chip, lit when the filter is on, and hover text that says what it
 * hides and what it deliberately keeps. Three of them read identically because they ARE identical
 * — the differences worth seeing are in the words, not in the markup.
 */
function ToggleChip({
  label,
  hint,
  on,
  onToggle,
  testId,
  disabled = false
}: {
  label: string
  hint: string
  on: boolean
  onToggle: () => void
  testId?: string
  /** the filter has nothing to read yet — the chip greys out and `hint` says why (see `OwnedChips`) */
  disabled?: boolean
}): JSX.Element {
  const chip = (
    <Chip
      size="small"
      label={label}
      data-testid={testId}
      title={hint}
      color={on ? 'primary' : 'default'}
      variant={on ? 'filled' : 'outlined'}
      disabled={disabled}
      onClick={onToggle}
      sx={{ flexShrink: 0 }}
    />
  )
  // A disabled MUI chip takes NO pointer events, so its own `title` never opens - and the reason a
  // control is dead is the one thing the reader most needs. The span above it catches the hover.
  if (!disabled) return chip
  return (
    <Box component="span" title={hint} sx={{ display: 'inline-flex', flexShrink: 0 }}>
      {chip}
    </Box>
  )
}

/**
 * THE ITEM CHIP (JOS-210) — ONE control in two states.
 *
 * EMPTY, it offers the item-first way into the browser: pick any item the DB carries and see what
 * can go in it. FILLED, it is the browser's honesty about what it is narrowed to, and the X hands
 * the browser back.
 *
 * IT USED TO HAVE A THIRD STATE (JOS-326 removed it). While the Inventory tab existed, an item
 * could also arrive as a `BrowsePreset` — one socket of one host — and the chip then named the CELL
 * and the SOCKET too, because the tabs and the slot select beside it were showing values the user
 * had not chosen. There are no cells any more, so every narrowing on this bar is one the user made
 * here, and the chip says exactly one thing: which item.
 *
 * Clicking the chip itself re-opens the picker, so swapping which item you are filling costs one
 * click rather than a clear and a re-open.
 */
function ItemChip({
  focus,
  onOpen,
  onClear
}: {
  focus: ItemFocus | null
  onOpen: (anchor: HTMLElement) => void
  onClear: () => void
}): JSX.Element {
  if (focus === null) {
    return (
      <Chip
        size="small"
        variant="outlined"
        label="For an item…"
        data-testid="planner-item-filter"
        title="Narrow the list to effects that can be socketed into one item"
        onClick={(e) => onOpen(e.currentTarget)}
        sx={{ flexShrink: 0 }}
      />
    )
  }
  return (
    <Chip
      size="small"
      color="primary"
      label={focus.name}
      data-testid="planner-item-chip"
      title={
        focus.slots.length === 0
          ? `Showing effects compatible with ${focus.name}`
          : `Showing effects that can be socketed into ${focus.name} (${focus.slots.join(' ')})`
      }
      onClick={(e) => onOpen(e.currentTarget)}
      onDelete={onClear}
      sx={{ flexShrink: 0, maxWidth: 260 }}
    />
  )
}

/**
 * The chip plus the picker it opens — one control, and the only state the bar itself owns (which
 * element the popover is anchored to). Kept together so the bar's own body stays a list of
 * controls rather than a control with a popover hanging off it.
 */
function ItemNarrowing({
  focus,
  setFocus
}: {
  focus: ItemFocus | null
  setFocus?: (f: ItemFocus | null) => void
}): JSX.Element {
  const [picking, setPicking] = useState<HTMLElement | null>(null)
  return (
    <>
      <ItemChip focus={focus} onOpen={setPicking} onClear={() => setFocus?.(null)} />
      <ItemFilterPicker
        anchor={picking}
        onClose={() => setPicking(null)}
        onPick={(hit) => {
          setFocus?.({ key: hit.key, name: hit.name, slots: hit.slots, classes: hit.classes })
          setPicking(null)
        }}
      />
    </>
  )
}

/** Why the pair is dead: one sentence naming the command that brings it to life. */
const OWNED_UNKNOWN =
  'Ownership comes from the inventory export - type /outputfile inventory in game and this lights up.'

/**
 * THE OWNERSHIP PAIR (fork ask 2026-09-11). Ownership is the Gear tab's own reading: the dump, the
 * loot log, or an exaltation copy. Split out of the bar at the 100-line function ceiling.
 *
 * IT WAS A SELECT, and the comment that stood here defended the select against A CHIP because the
 * state is a tri-state and one chip cycling three states reads as broken twice per cycle. That
 * argument is right, and it is an argument about ONE chip. TWO mutually exclusive chips carry the
 * same three states with no cycle in them at all, because the third state is NEITHER LIT - so the
 * bar loses the only dropdown on it that answered a yes/no question, and ownership reads in the
 * same idiom as the three toggles beside it.
 *
 * "MISSING", NOT "HIDE OWNED". Same filter, and the word is the question the player arrived with -
 * what am I still farming for - rather than its negation. The owner asked for that word by name.
 *
 * A LIT CHIP CLICKED AGAIN GOES BACK TO ALL, which is how the third state stays reachable without
 * a control of its own.
 */
function OwnedChips({
  owned,
  known
}: {
  owned: [OwnedMode, (v: OwnedMode) => void]
  known: boolean
}): JSX.Element {
  const [mode, setMode] = owned
  const pick = (v: OwnedMode) => () => {
    setMode(mode === v ? 'all' : v)
  }
  return (
    <>
      <ToggleChip
        label="Missing"
        testId="planner-owned-missing"
        on={mode === 'missing'}
        disabled={!known}
        onToggle={pick('missing')}
        hint={known ? 'Show only donors you do not own a copy of anywhere' : OWNED_UNKNOWN}
      />
      <ToggleChip
        label="Owned"
        testId="planner-owned-owned"
        on={mode === 'owned'}
        disabled={!known}
        onToggle={pick('owned')}
        hint={known ? 'Show only donors you already own - worn, in a bag, in the bank, or socketed' : OWNED_UNKNOWN}
      />
    </>
  )
}

export interface EffectFilterBarProps {
  filters: DonorFilters
  /** every control BUT the socket tabs — a write here hands the browser back (see `setSocket`) */
  setFilters: (f: DonorFilters) => void
  /** the kind tabs, which KEEP the item filter and move the preset's socket with them (JOS-210) */
  setSocket: (s: SocketType) => void
  /** the RAW search text (the browser defers it before filtering — the standing search law) */
  text: string
  setText: (v: string) => void
  era: [boolean, (v: boolean) => void]
  nonEquip: [boolean, (v: boolean) => void]
  groupBy: [GroupAxis, (v: GroupAxis) => void]
  /** the owned tri-state (fork ask 2026-09-09) — mount-local, like the search box */
  owned: [OwnedMode, (v: OwnedMode) => void]
  /** hide donors with a stated finite `Charges:` (fork ask 2026-09-10) — drawn on the Click tab,
   *  where a charged item is a consumable rather than a clicky */
  charged: [boolean, (v: boolean) => void]
  /** false while no inventory dump exists: the control renders disabled with the reason on hover,
   *  because a filter that silently does nothing is worse than one that says why it cannot */
  ownedKnown: boolean
  /** hide what the character cannot use instead of listing it marked (owner, 2026-10-25) */
  unusable: [boolean, (v: boolean) => void]
  /** false while no deity has been stated: the chip's hint says deity is not checked yet */
  deityKnown: boolean
  /** the item the browser is narrowed to, from either door, or null */
  focus?: ItemFocus | null
  /** pick one by hand, or clear whatever is there (`null`) */
  setFocus?: (f: ItemFocus | null) => void
}

export default function EffectFilterBar({
  filters,
  setFilters,
  setSocket,
  text,
  setText,
  era,
  nonEquip,
  groupBy,
  owned,
  charged,
  ownedKnown,
  unusable,
  deityKnown,
  focus = null,
  setFocus
}: EffectFilterBarProps): JSX.Element {
  const [axis, setAxis] = groupBy
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'nowrap', mb: 1 }}>
      <ItemNarrowing focus={focus} setFocus={setFocus} />
      <ToggleButtonGroup
        exclusive
        size="small"
        value={filters.socket}
        onChange={(_e, v: SocketType | null) => {
          if (v !== null) setSocket(v)
        }}
        sx={{ flexShrink: 0 }}
      >
        {SOCKETS.map((s) => (
          <ToggleButton key={s} value={s} data-testid={`planner-socket-${s}`} sx={{ px: 1.5 }}>
            {SOCKET_LABEL[s]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {/* The testid arrived with JOS-329: the box is remembered now (session tier), and an e2e that
          asserts a search survived a module switch has to be able to read what is in it. */}
      <TextField
        size="small"
        label="Search effect or item"
        value={text}
        data-testid="planner-search"
        onChange={(e) => setText(e.target.value)}
        sx={{ minWidth: 140, flexShrink: 1 }}
      />

      <TextField
        select
        size="small"
        label="Slot"
        value={filters.slot ?? 'ALL'}
        onChange={(e) => setFilters({ ...filters, slot: e.target.value === 'ALL' ? null : (e.target.value as EquipSlot) })}
        sx={{ minWidth: 130, flexShrink: 0 }}
      >
        {/* "All slots", not "Any slot" — since JOS-104 an ANY SLOT is a REAL place on the board,
            and a filter option reading "Any slot" beside two cells called ANY SLOT 1 and 2 would
            read as a filter FOR them. This one has always meant "do not filter by slot". */}
        <MenuItem value="ALL">All slots</MenuItem>
        {EQUIP_SLOTS.map((s) => (
          <MenuItem key={s} value={s}>
            {s}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        select
        size="small"
        label="Group by"
        data-testid="planner-groupby"
        value={axis}
        onChange={(e) => setAxis(e.target.value as GroupAxis)}
        sx={{ minWidth: 130, flexShrink: 0 }}
      >
        {axesFor(filters.socket).map((a) => (
          <MenuItem key={a} value={a} data-testid={`planner-groupby-${a}`}>
            {AXIS_LABEL[a]}
          </MenuItem>
        ))}
      </TextField>

      <ToggleChip
        label="Usable by these classes"
        on={filters.trioOnly}
        onToggle={() => setFilters({ ...filters, trioOnly: !filters.trioOnly })}
        hint="Hide donors none of the classes in the filter can use"
      />

      <UsableChip unusable={unusable} deityKnown={deityKnown} />

      <ViewToggles era={era} nonEquip={nonEquip} />

      {/* Click effects only: elsewhere charges are rare enough that the chip would be dead UI. */}
      {filters.socket === 'click' && (
        <ToggleChip
          label="No charges"
          testId="planner-charged-toggle"
          on={charged[0]}
          onToggle={() => charged[1](!charged[0])}
          hint="Hide items whose page states a finite Charges count - a charged click is a consumable"
        />
      )}

      <OwnedChips owned={owned} known={ownedKnown} />
    </Stack>
  )
}

/** Said when no deity is known, because then the deity half of the chip checks nothing. */
const DEITY_UNKNOWN =
  ' Deity is not checked until /outputfile achievements in game states yours.'

/**
 * THE CHOICE THE OWNER ASKED FOR (2026-10-25: "Give the user the choice"). Off, the default: a donor
 * this character cannot use stays listed, marked with why, below the ones it can. Lit: it is gone.
 * The marks are `planner/usability.ts`'s, so the chip hides exactly what the rows would mark.
 */
function UsableChip({
  unusable,
  deityKnown
}: {
  unusable: [boolean, (v: boolean) => void]
  deityKnown: boolean
}): JSX.Element {
  const [hide, setHide] = unusable
  return (
    <ToggleChip
      label="Usable by me"
      testId="planner-usable-toggle"
      on={hide}
      onToggle={() => setHide(!hide)}
      hint={
        'Hide donors you cannot use - no class in the filter, a deity you do not follow, or a level above yours.' +
        ' Off, they stay listed and marked, after the ones you can use.' +
        (deityKnown ? '' : DEITY_UNKNOWN)
      }
    />
  )
}

/** The two persisted view chips, split out of the bar at the 100-line function ceiling. */
function ViewToggles({
  era,
  nonEquip
}: {
  era: [boolean, (v: boolean) => void]
  nonEquip: [boolean, (v: boolean) => void]
}): JSX.Element {
  const [eraOnly, setEraOnly] = era
  const [showNonEquip, setShowNonEquip] = nonEquip
  return (
    <>
      <ToggleChip
        label="Current era"
        testId="planner-era-toggle"
        on={eraOnly}
        onToggle={() => setEraOnly(!eraOnly)}
        hint={`Hide donors from outside ${CURRENT_ERA_LABEL}`}
      />
      <ToggleChip
        label="Non-equippable"
        testId="planner-nonequip-toggle"
        on={showNonEquip}
        onToggle={() => setShowNonEquip(!showNonEquip)}
        hint="Show items whose page states no equipment slot"
      />
    </>
  )
}
