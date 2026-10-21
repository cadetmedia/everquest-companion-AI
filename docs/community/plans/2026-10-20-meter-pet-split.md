# Owner and pet grouped in the damage meters: phase doc (2026-10-20/21)

Ask from Malkil (tester, Discord, 2026-10-20), confirmed by the owner: a third pet layout for the
damage meters, on the floating overlay and the Combat tab, for your own pet and for a group-mate's
pet whose master is known. Shape chosen 2026-10-21 on the mock (the stacked pair). Nothing is
built yet. Rules first: `docs/community/RULES.md`, then `agent/INDEX.md`. What was asked:
`requirements/meter-pet-split.md` (rule 19).

Mock (look and feel only; all three layouts, a test pair with dps sliders):
https://claude.ai/artifact/5AKWz78ZYQrDD6suETpye7

## The ask

- Keep track of a player and their pet together, and of the pair's total. Malkil's first image
  put them side by side on one row (`1 You 563 dps · 73.2k` | `Vanab 251 dps · 32.6k` | `814 dps
  105.8k`), with a static total cell and the other two columns sized by share.
- Both surfaces ("Both, if possible"); party members too ("if it knows the pet's master").
- The side-by-side shape failed on the mock: a pair needs room for two names and two sets of
  numbers, so a near-zero pair drew wider than rows above it (owner: "how it looks like the pet and
  player with almost no DPS are suddenly doing more than some one above them, because of the WIDTH
  of their line"). Malkil's answer, chosen: the stacked pair below.
- The total box's colour is the builder's choice (owner: purple is not a requirement).

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

- New key `eq.combat.petLayout`: `'nested'` (option 1) | `'separate'` (option 2) | `'grouped'`
  (option 3). Absent: read the old `eq.combat.petRow` (`'0'` -> `separate`, else `nested`), so no
  one's layout moves. Default stays `nested`. Parser and default in `combatPrefs.ts` (node-tested,
  `tests/combatPrefs.test.mts`); hook `usePetLayout()` in `useCombatPrefs.ts`.
- Two booleans were rejected: four combinations, one of them meaningless (grouped while nested).
- Preferences > Combat: the switch becomes a three-way control, label "Where your pet's damage
  shows", choices "Inside your bar" / "Its own bar" / "With its owner", a caption per choice (the
  mock has the wording). The grouped caption names the `/pet who leader` limit for group-mates'
  pets. Add search keywords: group, grouped, stacked, owner, master, party, group pet.

### Rows: a pure pairing over the separate list

- New `features/combat/petGroups.ts`, MUI-free and JSX-free like `petRows.ts` and `meterScope.ts`
  (both bundles import it):

  ```ts
  export interface PetGroupRow {
    id: string                 // the owner's source id, else the lone row's id
    owner: SourceView | null   // null: a bound pet whose owner has no row in this list
    pets: SourceView[]         // ranked by total desc
    total: number              // owner + pets
    dps: number                // summed: every source divides by the segment's durationSec
    pct: number                // total / top row's total * 100: the shared bar's length
  }
  export function petGroupRows(sources: SourceView[]): PetGroupRow[]
  ```

- `kind: 'pet'` joins the `you` row; `kind: 'allyPet'` joins the row whose `memberKeyOf` equals
  its `charmerKeyOf`. A pet with no owner row (owner did no damage this segment) stays a row of
  its own. Every other row is a group of one. Rows ranked by `total`.
- Grouped is a LEVEL-1 presentation over the `separate` list: surfaces call
  `meterPanel(entities, false, drill)` and, at level 1, `petGroupRows(panel.sources)`. Level 2 is
  the separate layout's drill: the owner's line opens the owner's own lanes, the pet's line opens
  the pet's. `meterPanel`, `panelTotals` and the headline do not change, so no number moves.
- Conservation is the test: the sum of `PetGroupRow.total` equals the sum of the input totals;
  every input id appears once.

### Rendering: the stacked pair (Malkil, chosen 2026-10-21)

Malkil's sketch, `+` master colour, `-` pet colour, `/` the shared third colour:

```
|You+++++++++++++++++++++++563|/////////////////|       814 dps|
|Vanab--------251|//////////////////////////////////////|        105.8k|
```

- **A pair is two lines.** Line 1: the owner (rank, name, own `dps · total`). Line 2: the pet
  (name, own `dps · total`). More than one pet: one more line each.
- **Every bar is its true length; text never sizes a bar.** Each line's fill is that source's
  `total / top total`. Behind the lines, one double-height bar in a third colour at the pair's
  `pct`. Text lays out as on today's `Bar` (name left, figures right) and runs over the empty
  track when a fill is short. A 10 + 5 dps pair under rows in the hundreds stays a sliver (test it
  on the mock's sliders).
- **Every row has the total box on the right, pair or not** (Malkil: "even the single height bars
  should have the box on the right side like the double height bars do for consistent
  formatting"). Fixed width; overlay in `em` so the text-scale stepper scales it, tab in px. A
  pair's box: pair dps over pair damage. A one-line row's box: its `dps · damage` on one line, and
  its bar carries the name only. So in this layout every level-1 row renders through the new row,
  not `Bar`.
- **One line for anything that is not a pair:** a player with no pet, and a pet whose master is not
  known (an unpaired `pet`/`allyPet`, an `other` row). Malkil: "If a player doesn't have a pet or if
  the pet doesn't have a master, it can be displayed on a single height line." Owner: "The double
  height line is just to accommodate the extra text."
- **A paired pet shows its own name only, and no kind tag** (Malkil: "we already know it's a pet
  when it's on the same line as a player"). Your pet's name is already bare. A group-mate's pet
  arrives as `Pet (<pet>) - <Owner>`; when `petGroupRows` pairs it, the renderer strips exactly the
  prefix `Pet (` and the suffix `) - <owner row's name>`, and keeps the full name if the string is
  not that shape. Not chosen: a new `SourceView` field for the bare name (schema, `gen:protocol`,
  fixtures, engine harness) for a string the renderer can take apart against the owner row it
  already holds. An unpaired ally pet keeps its full name.
- Colours: lines wear `KIND_COLOR` (you gold, pet blue, ally pet slate, member green); the overlay's
  copy in `meterBars.tsx` is kept in step (its comment says so). The third colour (shared bar and
  total box) is the builder's pick; the mock uses a muted violet `#4a4366`.
- Clicks (interactive only): a line drills its source. The total box drills nothing. Locked overlay:
  no affordances, as now. No hover on the overlay bars (JOS-358).
- Combat tab: the owner's line keeps its kind chip (`group`) and hit/resist badges; the pet's line
  has no kind chip. The `~` ambiguity chip still rides on the pet's line, because it is about the
  number, not the kind.
- Incoming direction and the healing meter: unchanged (`SegmentPanel` already applies pet layout
  to `mode === 'out'` only).

### Files

| File | Change |
| --- | --- |
| `features/combat/combatPrefs.ts` | `PetLayout`, key, `readPetLayout(raw, legacy)` |
| `features/combat/useCombatPrefs.ts` | `usePetLayout()`; `useCombinePetRow` removed or derived |
| `features/preferences/CombatSection.tsx` | three-way control and captions |
| `features/combat/petGroups.ts` | new, the pairing |
| `features/combat/PetGroupRow.tsx` | new, tab row (MUI), one or more lines plus the total box; memo gate like `EntityRow` |
| `features/combat/MeterRows.tsx` | level 1 renders `PetGroupRow` for every row when grouped |
| `features/combat/SegmentPanel.tsx` | reads the layout; grouped only when `mode === 'out'` |
| `overlay/petGroupBars.tsx` | new, overlay row (plain React); `meterBars.tsx` is 419 lines of 440 |
| `overlay/meterBars.tsx` | `SourceLines` switches on the layout |
| `features/overview/DpsCard.tsx` | maps grouped (open question) |
| `tests/combatPetGroups.test.mts` | new: pairing, orphan pet, ally join, scope, conservation, name strip |
| `tests/combatPrefs.test.mts` | layout parse and legacy key |
| e2e `combatPrefsSteps.mts`, `overlay-sync.e2e.mts` | a pair is two lines plus a box, a lone row one line plus a box; testids `meter-group-row`, `overlay-group-row` |

## Phases

1. **Branch.** `meter-pet-split` off `main`, worktree, recipe line and BRANCHES.md row in the same
   change (rule 9). It touches files `community/pr-67-self-meter-name` touches (`meterBars.tsx`,
   `SegmentPanel.tsx`, `DpsCard.tsx`, `CombatSection.tsx`, `useCombatPrefs.ts`), so place it after
   that line; resolve in the scratch tree, `rerere` replays.
2. **Preference.** The three-way key, legacy read, Preferences control. Options 1 and 2 behave
   exactly as before. Tests.
3. **Pairing.** `petGroups.ts` and its tests. No UI.
4. **Combat tab.** `PetGroupRow.tsx`, `MeterRows`, `SegmentPanel`.
5. **Overlay.** `petGroupBars.tsx`, `meterBars.tsx`.
6. **Close.** Overview card, e2e, gate on the branch and on the scratch merge, owner and Malkil test
   in the app, then `main_community`.

## Questions

Answered on the mock by Malkil, relayed by the owner:

- 2026-10-21: the stacked pair ("Yeah, I like the look of the stacked pair"); every row gets the
  total box. Replaces the side-by-side shape and its rank styles (full width, share strip, cut
  short), which were tried on the mock and dropped.
- 2026-10-20: rows with no pet and pets with no known master are one line; a paired pet shows its
  own name only.

Open:

- **The Overview damage card** (not asked for, but reads the same pref). Recommended: grouped shows
  there as option 1 (one bar per owner, pet inside), because the card is a glance at a quarter
  width.
