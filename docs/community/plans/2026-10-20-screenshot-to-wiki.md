# Screenshot to wiki: phase doc (2026-10-20)

Ask from the owner, 2026-10-20: the app reads a screenshot of an item, spell, mob or other game
window and pulls out what it can, to fill the wiki facts the log never carries. Nothing is built in
the app. A throwaway prototype was built outside it (section "Prototype"). Rules first:
`docs/community/RULES.md`, then `agent/INDEX.md`. What was asked:
`requirements/screenshot-to-wiki.md` (rule 19).

## The ask

- "have the app take a screenshot of an item, mob, spell, whatever, and have basic image parsing
  pull out as much information as possible from it". It supplements the log (kills, con, factions,
  zone).
- Non-AI, no tokens. Fast. Licence-compatible or open source.
- Bonus: the wiki's Icon Finder (paste just the icon, get its `lucy_img_ID`), done locally.

## Where it fits

- The Gaps tab's Copy wiki page already writes what the log gives and leaves the rest "for the
  player to type from the item's window" (`src/shared/wikiPage.ts` `STATS_SKELETON`, owner
  2026-10-20). WIKI.md, "Never from the log": stats, slot, icon, race, HP, damage. A screenshot
  carries exactly the item and spell ones.
- So the first consumer is the Gaps item page: screenshot in, `statsblock` and `lucy_img_ID`
  filled, the player reviews, then copies. Nothing is posted anywhere by the app.
- The wiki's own rule (Help:Contents, Editing Standards) asks for human-crafted graphics and prose.
  A transcription of the game's item window is the game's text, which is what `statsblock` holds;
  the player still reviews it. No generated prose, same as Gaps today.

## Constraints

- **No tokens, no cloud.** Everything runs on the player's machine. Honest note: Tesseract 4+ and
  Windows OCR use small local neural models; they are deterministic, offline and free. Only glyph
  templates (option C below) are strictly model-free.
- **Licence.** The repo is FSL-1.1-MIT. Dependencies are MIT, Apache-2.0, BSD or ISC from the
  public npm registry only (RULES.md rule 7 applies to each one).
- **No game art shipped.** Icons are Daybreak's. The icon index is built at runtime from the
  player's own install (the same footing as reading `spells_us.txt`, owner 2026-10-19 for spell
  pages) and cached in userData. Nothing derived from the game's files is committed. Needs the
  owner's word that this extends to `uifiles` (question 1).
- **No wiki traffic.** No runtime fetch, zero requests in development (RULES.md rule 15, WIKI.md).
  The wiki's Icon Finder was not looked at; ours is built from the game's sheets instead.
- **Fast.** Target: icon match under 100 ms, an item window read under 1 s warm, on the owner's PC.

## The lucy img id, measured 2026-10-20

- `lucy_img_ID` is the EQ client's item icon number (named after the Lucy item database). The wiki
  file `Item <id>.png` is that icon (`src/main/itemLookupParse.ts`).
- The client ships every icon: `<EQ>/uifiles/default/dragitem1.dds` .. `dragitem379.dds`, 256x256,
  DXT5. `EQUI_DragItems.xml` (`A_DragItem`): 40x40 cells, `Grid=true`, `Vertical=true`, so 6x6 =
  36 per sheet, 13,644 cells, ids from 500.
- Formula (prototype confirms the cell order, see Prototype): `id = 500 + (sheet - 1) * 36 + cell`.
- Ground truth on hand: `items.json` carries `iconId` for 11,675 items (777 distinct, 500..10308).
- Spell icons: `uifiles/default/Spells01.tga` .. (40x40 cells, `EQUI_SpellIcons.xml`); the icon
  number per spell is a field of `spells_us.txt`.
- Side effect worth having: with the sheets decoded locally, the app could draw item icons without
  fetching them from eqlwiki (`src/main/imageCache.ts wikiItemIconUrl`). Separate decision
  (question 4).

## What a screenshot can give

| Window | Fields | Used for | Phase |
| --- | --- | --- | --- |
| Item display | name, flag line (MAGIC ITEM, LORE, NO DROP), Slot, AC, stats, SV lines, WT/Size, Skill/Atk Delay/DMG, Effect lines, Class, Race; the icon | item page `statsblock`, `lucy_img_ID`, `itemname` | 1-2 |
| Item display, Lore text | the lore line | `notes = {{Item Lore\|...}}` (WIKI.md) | 2 |
| Spell display | name, description, icon | spell page `description`, `spellicon` (the rest comes from `spells_us.txt`) | 4 |
| A mob on screen | a portrait crop, saved as `npc_<name>.png` | mob page image: 6,364 of 7,954 mob pages name a file nobody uploaded (WIKI.md) | 5 |
| Target window | name, con colour | nothing new; the log already has both | not planned |
| Merchant window | items and prices | stock was ruled out of the log (owner, 2026-10-18); a screenshot has the same resell ambiguity | not planned |

## Design

### Capture

- Phase 1: paste. The player snips the window (Win+Shift+S) and pastes into the Gaps row's panel,
  or drops a file. Electron `clipboard.readImage()`; no capture permission, no hotkey.
- Later: a hotkey grabs the EQ window (`desktopCapturer`) and the player drags a box, or auto-find
  (below). The UI ini cannot place the box: item windows cascade (`ItemDisplayWindow_0..99`) and
  `ItemDisplayWindow_99` records no rectangle (measured on `UI_Drywrought_oggok_LO1.ini`).

### Icon finder

- Build once per install (and again when the sheets' size or mtime changes): decode the 379 DXT5
  sheets, cut 40x40 cells, drop empty ones, keep a small vector per icon (16x16 RGB over black).
  Cache in userData.
- Query: trim the paste's borders, scale to the grid, compare against every icon, re-rank the top
  50 at full size. Colour matters: many icons are recolours of one model (the breastplates 1569,
  1570, 1571 in the wiki's own results).
- In an item window screenshot the icon sits top-left; the finder runs on that crop with no extra
  step.

### Reading the text

| Option | Licence | Size | Speed | Notes |
| --- | --- | --- | --- | --- |
| A. tesseract.js | Apache-2.0 | WASM core plus ~2-4 MB `eng` data (fast) | prototype measures | Portable, pure npm. Needs preprocessing for small light-on-dark text: crop, upscale 2-3x, invert, threshold. |
| B. Windows OCR (`Windows.Media.Ocr`) | part of Windows | 0 | prototype measures if cheap | Windows only (the app is). Needs a WinRT bridge (native addon or a helper process); English OCR pack present on en-US installs. |
| C. Glyph templates of EQ's font | ours | tiny | fastest | Exact at the native size, breaks with UI scale or font change. A later speed-up, not a start. |

- Recommendation pending the prototype's numbers: A first (no native code, one npm dep), B as the
  fallback if A's accuracy on real windows is poor.
- OCR runs in a worker (utility process or worker thread), never on the main thread (perf audit,
  `audits/2026-10-20-performance-review.md`).

### From text to page

- Lines joined as `statsblock` lines (`<br>`), the window's title as `itemname`.
- Confidence gate: run the result through `parseStatsBlock` (`src/shared/itemStats.ts`), the same
  parser that reads the wiki. A line that parses to nothing known is flagged for the player, not
  dropped. Fix common OCR slips only where the vocabulary is closed (slots, sizes, class and race
  codes, `SV` names); never guess numbers.
- Shown as an editable preview beside the Copy wiki page button; the copy uses the edited text.

## Phases

0. **Prototype** (done, outside the app): icon finder and OCR measured. See below.
1. **Icon finder in the app.** Index build from the install, cached; paste an icon or an item
   window on a Gaps item row, get the ranked ids with their icons drawn from the local sheets; the
   chosen id goes into `lucy_img_ID` in Copy wiki page. Node tests on a fixture sheet (a tiny
   synthetic DDS, no game art committed).
2. **Item window OCR.** Paste the window, preview `statsblock` and `itemname`, gate through
   `parseStatsBlock`, edit, copy. Fixture: owner-supplied screenshots kept out of git or cut to
   text (question 3).
3. **Capture hotkey and auto-find.** Grab the EQ window, find the item window by its frame, cut it.
4. **Spell display window.** Description and icon for spell pages.
5. **Mob portraits.** Crop, name `npc_<name>.png`, open `Special:Upload&wpDestFile=` for it.

Branch: `screenshot-to-wiki` off `main`, recipe line after `gaps-overlay` (it extends the Gaps
item page), BRANCHES.md row in the same change (rule 9).

## Owner questions (before phase 1)

1. **Reading `uifiles` at runtime.** The 2026-10-19 ruling lets the app read the game's files for
   spell pages. Does it extend to the icon sheets, read from the player's install and never
   shipped? Recommended: yes, same footing.
2. **Where the paste goes.** Recommended: on the Gaps item row (its details), because that is the
   page being written. Alternative: a small Screenshot tool tab that works on any item.
3. **Real screenshots for testing.** A few item windows (armour, weapon, an Effect line, a long
   class list) and one spell window, at the owner's UI scale. Committed as text fixtures only.
4. **Local item icons everywhere.** Draw item icons from the sheets instead of fetching them from
   eqlwiki, app-wide. Separate branch if yes.

## Prototype

<!-- filled from the prototype's report -->
