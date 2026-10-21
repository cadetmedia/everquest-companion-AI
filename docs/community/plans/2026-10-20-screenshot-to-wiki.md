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
- Formula, confirmed by the prototype: `id = 500 + (sheet - 1) * 36 + col * 6 + row` (column-major).
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

- Chosen after the prototype: A. B read small text far worse (table under Prototype).
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

## Prototype (2026-10-20, outside the repo, thrown away)

Node 24 scripts in the session scratchpad, ~620 lines. Every run blocked all network calls; zero
wiki requests. Deps: pngjs (MIT), jpeg-js (BSD-3), @napi-rs/canvas (MIT, synthetic renders only),
tesseract.js + core (Apache-2.0), `@tesseract.js-data/eng` (MIT, data Apache-2.0, loaded from disk).

### Icons

- **Formula confirmed: `id = 500 + (sheet - 1) * 36 + col * 6 + row`** (column-major, as
  `Vertical=true` says). Checked by eye against `items.json`: 502 necklace, 566 medallion, 639 cap,
  504 scroll, 519 sword. Row-major puts the wrong art at those ids.
- **Not every sheet is DXT5:** sheet 323 is DXT3; sheets 9 and 302 are uncompressed ARGB. The
  decoder must handle all three.
- 13,444 cells have art, 200 are empty; ids reach 14143. All 777 `iconId`s in `items.json` land on
  art.
- Build: 2.6 s, index 10.4 MB (16x16 RGB per icon). Load 18 ms; query 38 ms median, 53 ms p90
  (first query cold ~170 ms).
- The 13 labelled crops from the owner's screenshot of the wiki's Icon Finder (the skull query and
  its 12 result tiles, about 2x scale): **13 of 13 at rank 1**, tight crop and with 6 px of the
  tile's UI around it. The winner scores 4x to 15x better than the runner-up.
- Self-test, 300 random icons with a 2 px slot frame, 1.25x to 2x scale, up to 3 px offset, JPEG on
  half: top-1 94.7%, top-5 96.3%. Misses are near-twins (1808/1809) and art that touches the cell
  edge.
- 3 exact duplicate pairs (3470/3471, 4448/4451, 6853/6880) and 35 near-duplicate pairs: the UI
  shows the top 3 to 5 with their art, never a lone answer.

### Item window text (synthetic only: no real screenshots on this PC)

30 real `statsBlock`s from `items.json`, drawn in Arial on a dark textured panel, read back, both
sides scored with the repo's own `parseStatsBlock`.

| Render | Engine | Names | Lines | Fields | ms per image |
| --- | --- | --- | --- | --- | --- |
| 13 px | tesseract.js, upscale 3x, no threshold | 27/30 | 99.1% | 99.3% | ~250 warm (+~180 worker start) |
| 10 px, noisy, dim | tesseract.js | 21/30 | 93.0% | 95.7% | ~220 |
| 10 px | tesseract.js, upscale 2x | 22/30 | 97.7% | 98.7% | ~165 |
| 13 px | Windows OCR | n/a | 87% | 90% | ~10 |
| 10 px | Windows OCR | n/a | 22-69% | 27-74% | ~10 |

- A hard black/white threshold before Tesseract cost ~17 points: keep the greys.
- Typical slips: rn to m (Thorny to Thomy), the backtick in Teir`Dal dropped, I to l, Slot to Slat,
  9/6/5 to 8/8/3, colon to semicolon, a missed title line. The item name is the weakest field,
  and Gaps already knows the name from the log, so the name is checked against the row, not read.
- Synthetic text is an upper bound. Real windows (EQ's own font rendering, UI scale, the window's
  art behind the text) are the open risk; question 3.

### First real screenshot (owner, 2026-10-21: Ruined Robe, 336x420 snip of the item window)

- Text: init 174 ms, read 586 ms, confidence 72. Every line came back, plus the tab row
  ("Description", "Lore") as junk on top and stray characters at line ends.
- **One wrong number: `Weight: 2.0` read as `Weight 20`** (the decimal point lost). Weight always
  has one decimal in the game, so a missing point is detectable; still flagged, never guessed.
- **The game window is not wiki layout.** Two columns (`Size: MEDIUM` beside `AC: 1`, `Charisma:
  -20` beside the `SV.` column), long names (`Weight:`, `Charisma:`, `SV. Magic:`), the slot as a
  bare word (`Chest`), the name in red, an `Unmodified` line at the bottom. The synthetic benchmark
  drew wiki layout, so it measured the wrong thing for the line split. Phase 2 needs a mapping
  from the game's window to the wiki's lines, e.g. for this item:
  `Lore Equipped, No Trade, Temporary` (WIKI.md: the tooltip form is kept as-is), `Slot: CHEST`,
  `AC: 1`, `CHA: -20`, `SV MAGIC: -15` ..., `Size: MEDIUM WT: 2.0`, `Class: NEC WIZ MAG ENC`,
  `Race: ALL`.
- **The window's own icon cannot be matched.** It is drawn at ~60% size and nearly black over the
  window's stone texture (max brightness 90 of 255); the top scores sat within 1% of each other
  and no robe icon ranked. The icon finder takes the icon from an inventory slot or the cursor (full
  40 px colour, the wiki's own Icon Finder workflow), not from the item window.
- Real-window fixtures needed: a weapon (Skill, Atk Delay, DMG), an Effect line, a long class list,
  the Lore tab.

### What the prototype changes in the design

- Text engine: **tesseract.js** (option A). Windows OCR is fast but too weak on small text.
- The decoder handles DXT5, DXT3 and raw ARGB sheets.
- Fix-ups use the closed vocabularies (Slot, Size, class and race codes, `SV` names, the item name
  from the Gaps row); numbers are never corrected, only flagged when `parseStatsBlock` rejects the
  line.
- Node 24.19 gave a wrong re-rank score about 1 run in 10 until the hot loop sat in its own
  function (gone under `--no-maglev`; 30 of 30 clean since). The in-app matcher gets a test that
  scores a known icon against itself many times.
