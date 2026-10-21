# Owner and pet on one bar in the damage meters: phase doc (2026-10-20)

Ask from Malkil (tester, Discord, 2026-10-20), confirmed by the owner: a third pet layout for the
damage meters, on the floating overlay and the Combat tab, for your own pet and for a group-mate's
pet whose master is known. Nothing is built yet. Rules first: `docs/community/RULES.md`, then
`agent/INDEX.md`. What was asked: `requirements/meter-pet-split.md` (rule 19).

## The ask

- One row per owner: `[ owner segment | pet segment ] [ total cell ]`. From Malkil's mock:
  `1 You` / `563 dps · 73.2k` (gold) | `Vanab` / `251 dps · 32.6k` (pet blue) | `814 dps` /
  `105.8k`.
- "The third section should be static, but the other two columns should dynamically adjust in
  width." Two lines tall is fine ("Even if it still takes up two lines so it fits").
- Both surfaces ("Both, if possible"); party members too ("if it knows the pet's master").
- The total cell's colour is the builder's choice; purple in the mock is not a requirement (owner,
  2026-10-20). Suggested: a neutral (not a kind colour), because the total is the pair's, not a
  combatant's; the overlay already reasons the same way about `ACCENT` in `overlay/meterBars.tsx`.

## What exists (options 1 and 2, measured 2026-10-20)

- One boolean pref, `eq.combat.petRow` ('1'/'0', default on), hook `useCombinePetRow`
  (`features/combat/useCombatPrefs.ts`), written only by Preferences > Combat
  (`features/preferences/CombatSection.tsx`, "Show your pet inside your damage"). localStorage,
  same origin, so the overlay window gets it through the `storage` event; no IPC.
- On = option 1 (pet folded into your bar, `petRows.meterSources`), off = option 2 (pet is its own
  bar). Only YOUR pet (`kind: 'pet'`) is ever folded.
- Every damage meter builds its rows with `petRows.meterPanel(entities, combine, drill)`: the
  Combat tab (`SegmentPanel.tsx`, outgoing only), the Overview card (`overview/DpsCard.tsx`), the
  overlay (`overlay/meterBars.tsx`). Level 1 renders through `MeterRows.tsx` -> `EntityRow.tsx`
  (MUI `Bar`, 22 px, one line) on the tab and `SourceLines` -> `Bar` (18 px, one line, no hover,
  JOS-358) on the overlay.
- Order of shaping on every surface: `scopeSources` (You / Group / Everyone) -> `withSelfLabel`
  (pr-67, `<Char> (You)`) -> `meterPanel`.

## Who owns which pet (the pairing the feature needs)

- Your pet: `kind: 'pet'`, owner is the `kind: 'you'` row (`petRows.selfSource`).
- A group-mate's pet: `kind: 'allyPet'`, id `allypet:<ownerKey>:<petKey>`, name
  `Pet (<pet>) - <Owner>` (`engine/crates/fold/src/combat/routing.rs ally_pet_source`). The owner's
  row is `member:<ownerKey>` (`kind` `member` or `other`). Both keys come from the engine's
  `id_key`, so `meterScope.charmerKeyOf(pet.id) === meterScope.memberKeyOf(owner.id)` is the join.
  No engine or protocol change is needed.
- The engine binds an ally pet two ways: a charm it saw cast, or the pet's answer to the owner's
  `/pet who leader` (`ally.rs bind_by_leader`; summon-class binds never expire). It refuses a
  caster that is you, a pet, ever-struck or ever-charmed (`state.rs ally_caster_allowed`).
- Limit, stated in the UI caption: a group-mate's pet pairs only after its owner ran
  `/pet who leader` near you (or charmed it in view). Malkil's log (19 MB, 2026-10-20): 2
  `My leader is` lines, both his own pets; 0 for anyone else's. Until bound, a pet's damage is not
  on the meter at all, or is an `other` row the app cannot pair (EQ pet names look like player
  names, `combat.ts` on `'other'`).
- The scope filter already keeps an ally pet with its charmer (`scopeSources`), so a pair is kept
  or dropped together.

## Design

### Preference: one three-way choice, not a second switch

- New key `eq.combat.petLayout`: `'nested'` (option 1) | `'separate'` (option 2) | `'split'`
  (option 3). Absent: read the old `eq.combat.petRow` (`'0'` -> `separate`, else `nested`), so no
  one's layout moves. Default stays `nested`. Parser and default in `combatPrefs.ts` (node-tested,
  `tests/combatPrefs.test.mts`); hook `usePetLayout()` in `useCombatPrefs.ts`.
- Two booleans were rejected: four combinations, one of them meaningless (split while nested).
- Preferences > Combat: the switch becomes a three-way control (radio or toggle group), label
  "Where your pet's damage shows", a caption per choice. The split caption names the
  `/pet who leader` limit for group-mates' pets. Add search keywords: split, beside, side by side,
  owner, party, group pet.

### Rows: a pure pairing over the separate list

- New `features/combat/petSplit.ts`, MUI-free and JSX-free like `petRows.ts` and `meterScope.ts`
  (both bundles import it):

  ```ts
  export interface SplitRow {
    id: string                 // the owner's source id, else the lone row's id
    owner: SourceView | null   // null: a bound pet whose owner has no row in this list
    pets: SourceView[]         // ranked by total desc
    total: number              // owner + pets
    dps: number                // summed: every source divides by the segment's durationSec
    pct: number                // total / top row's total * 100
  }
  export function splitRows(sources: SourceView[]): SplitRow[]
  ```

- `kind: 'pet'` joins the `you` row; `kind: 'allyPet'` joins the row whose `memberKeyOf` equals
  its `charmerKeyOf`. A pet with no owner row (owner did no damage this segment) stays a row of
  its own. Every other row is a group of one. Owner segment first, pets after; rows ranked by
  `total`.
- Split is a LEVEL-1 presentation over the `separate` list: surfaces call
  `meterPanel(entities, false, drill)` and, at level 1, `splitRows(panel.sources)`. Level 2 is the
  separate layout's drill: the owner segment opens the owner's own lanes, the pet segment opens
  the pet's. `meterPanel`, `panelTotals` and the headline do not change, so no number moves.
- Conservation is the test: the sum of `SplitRow.total` equals the sum of the input totals; every
  input id appears once.

### Rendering

Mock (look and feel only, three layouts switchable):
https://claude.ai/artifact/5AKWz78ZYQrDD6suETpye7. Malkil's answers to it, 2026-10-20, are
below; the mock's option 3 follows them.

- **A pair** (owner + pet) is a two-line row. Owner segment: rank + name / `dps · total`. Pet
  segment: name / `dps · total`. Total cell: pair dps / pair total. "The double height line is
  just to accommodate the extra text" (owner).
- **Anything else is one line**, today's `Bar` unchanged: a player with no pet, and a pet whose
  master is not known (an unpaired `pet`/`allyPet`, an `other` row). Malkil: "If a player doesn't
  have a pet or if the pet doesn't have a master, it can be displayed on a single height line."
- **Rank: the row is cut short at its share of the top row** (Malkil: "C is closest"). A pair's
  segments plus total cell span `SplitRow.pct` of the width, the rest is empty track, like today's
  fill. A row too short for its own text grows to fit it, so short rows are only roughly to scale.
  A one-line row fills to `pct` exactly as today.
- **A pet beside its owner shows its own name only, and no kind tag** (Malkil: "it doesn't need
  to display 'pet' in the bar's title, since we already know it's a pet when it's on the same line
  as a player"). Your pet's name is already bare. A group-mate's pet arrives as
  `Pet (<pet>) - <Owner>` (engine `ally_pet_source`); when `splitRows` pairs it, the renderer
  strips exactly the prefix `Pet (` and the suffix `) - <owner row's name>`, and keeps the full
  name if the string is not that shape. Not chosen: a new `SourceView` field for the bare name
  (schema, `gen:protocol`, fixtures, engine harness) for a string the renderer can take apart
  against the owner row it already holds. An unpaired ally pet keeps its full name, since no owner
  sits beside it.
- Segments: flex, `flex-grow` = the segment's total, basis 0, so widths follow the share. The
  figures line never clips; the name ellipsizes. A floor keeps a small pet's segment readable
  (the mock is about 57/43 for a 69/31 split, so the floor is visible in the ask).
- Total cell: fixed width. Overlay: in `em`, so the text-scale stepper scales it; tab: fixed px.
- Colours: segments wear `KIND_COLOR` (you gold, pet blue, ally pet slate, member green); the
  overlay's copy in `meterBars.tsx` is kept in step (its comment says so).
- Clicks (interactive only): a segment drills its source. The total cell drills nothing. Locked
  overlay: no affordances, as now. No hover on the overlay bars (JOS-358).
- Combat tab: the owner segment keeps its kind chip (`group`) and hit/resist badges after the
  figures, dropped by overflow when narrow; the pet segment has no kind chip. The `~` ambiguity
  chip still rides on the pet segment, because it is about the number, not the kind.
- Incoming direction and the healing meter: unchanged (`SegmentPanel` already applies pet layout
  to `mode === 'out'` only).

### Files

| File | Change |
| --- | --- |
| `features/combat/combatPrefs.ts` | `PetLayout`, key, `readPetLayout(raw, legacy)` |
| `features/combat/useCombatPrefs.ts` | `usePetLayout()`; `useCombinePetRow` removed or derived |
| `features/preferences/CombatSection.tsx` | three-way control and captions |
| `features/combat/petSplit.ts` | new, the pairing |
| `features/combat/SplitRow.tsx` | new, tab row (MUI), memo gate like `EntityRow` |
| `features/combat/MeterRows.tsx` | level 1 picks `SplitRow` when split |
| `features/combat/SegmentPanel.tsx` | reads the layout; split only when `mode === 'out'` |
| `overlay/splitBars.tsx` | new, overlay row (plain React); `meterBars.tsx` is 419 lines of 440 |
| `overlay/meterBars.tsx` | `SourceLines` switches on the layout |
| `features/overview/DpsCard.tsx` | maps split (owner question 3) |
| `tests/combatPetSplit.test.mts` | new: pairing, orphan pet, ally join, scope, conservation |
| `tests/combatPrefs.test.mts` | layout parse and legacy key |
| e2e `combatPrefsSteps.mts`, `overlay-sync.e2e.mts` | split row has two segments and a total cell; testids `meter-split-row`, `overlay-split-row` |

## Phases

1. **Branch.** `meter-pet-split` off `main`, worktree, recipe line and BRANCHES.md row in the same
   change (rule 9). It touches files `community/pr-67-self-meter-name` touches (`meterBars.tsx`,
   `SegmentPanel.tsx`, `DpsCard.tsx`, `CombatSection.tsx`, `useCombatPrefs.ts`), so place it after
   that line; resolve in the scratch tree, `rerere` replays.
2. **Preference.** The three-way key, legacy read, Preferences control. Options 1 and 2 behave
   exactly as before. Tests.
3. **Pairing.** `petSplit.ts` and its tests. No UI.
4. **Combat tab.** `SplitRow.tsx`, `MeterRows`, `SegmentPanel`.
5. **Overlay.** `splitBars.tsx`, `meterBars.tsx`.
6. **Close.** Overview card, e2e, gate on the branch and on the scratch merge, owner tests in the
   app, then `main_community`.

## Questions

Answered by Malkil on the mock, relayed by the owner, 2026-10-20 (Rendering has the detail):

1. **How a row shows its rank:** cut short at its share of the top row ("C is closest"). Not
   chosen: full-width rows (the first mock), full width with a share strip.
2. **Rows with no pet, and pets with no known master:** one line, today's bar.
3. **A pet beside its owner:** its own name only, no "pet" tag.

Open:

4. **The Overview damage card** (not asked for, but reads the same pref). Recommended: split shows
   there as option 1 (one bar per owner, pet inside), because the card is a glance at a quarter
   width.
