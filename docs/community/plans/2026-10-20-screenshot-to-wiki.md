# Screenshot to wiki: phase doc (2026-10-20)

Ask from the owner, 2026-10-20: the app reads a screenshot of an item, spell, mob or other game
window and pulls out what it can, to fill the wiki facts the log never carries. A throwaway
prototype was built outside the app first (section "Prototype"). Phases 1 to 5 are built on
`screenshot-to-wiki` (2026-10-21, sections "Built"); the owner's questions 1 and 2 were answered by
the ask to build it into a row's details. Rules first:
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
- In an item window the icon is the 40x40 cell at a fixed place (`IDW_IconButton`), unscaled; the
  finder subtracts the window's tiled rock texture (aligned from the same snip), then matches;
  the slot the OCR read is the fallback prior (measured on a real window, Prototype section). A paste of the icon alone works the same way.

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
  from the game's window to the wiki's lines.
- **The target, from the page the owner wrote for this item (2026-10-21):**

  ```
  |itemname = Ruined Robe
  |lucy_img_ID = 1126
  |notes = {{Item Lore|The Cloth Seems To Be Moving}}
  |statsblock =
  LORE ITEM  NO DROP  TEMPORARY<br>
  Slot: CHEST<br>
  AC: 1<br>
  CHA: -20<br>
  SV MAGIC: -15  SV FIRE: -15  SV COLD: -15  SV DISEASE: -15  SV POISON: -15<br>
  WT: 2.0  Size: MEDIUM<br>
  Class: NEC WIZ MAG ENC<br>
  Race: ALL<br>
  ```

  So the mapping: the flag line in classic caps, two spaces apart (`Lore Equipped` -> `LORE ITEM`,
  `No Trade` -> `NO DROP`, `Temporary` -> `TEMPORARY`); the bare slot word -> `Slot: CHEST`; long
  stat names -> short (`Charisma` -> `CHA`); every `SV.` row on ONE line, two spaces apart, in the
  window's order; `WT:` before `Size:`; Class and Race last; `Unmodified` dropped. Two cells per row
  in the window become separate wiki lines (`Size` / `AC`), not one. The Lore tab's text goes to
  `notes = {{Item Lore|...}}` (a second paste, of the Lore tab).
- **The window's icon is the real icon, at 1:1, but dark.** `EQUI_ItemDisplayWindow.xml`
  `IDW_IconButton`: a 44 px button at (10, 12) in the window, decal offset 2, so the 40x40 icon
  sits at a fixed place, unscaled. Icon 1126 itself peaks at 90 of 255, as does the snip: nothing
  dims it. Matching the owner's icon-only snip (45x65, the robe on the window's stone texture):
  - The finder as built: 1126 ranks 4th (837, 4249, 4201 above it, all close scores). Its content
    box comes from a brightness threshold of 48, which a dark icon on dark stone defeats.
  - Each icon's own alpha mask slid over the snip at 1:1: worse (1126 ranks 10th; small dark icons
    win) and slow (14.6 s for 12,715 icons). Dropped.
  - **The slot as a prior: 1126 ranks 1st.** `items.json` has 30 distinct icons on CHEST items;
    filtering the finder's list to them puts 1126 first (18 icons on items named "Robe": also 1st).
    The OCR gives the slot from the same paste.
  - Brightness as a first cut (owner's idea, 2026-10-21): the snip's mean is mostly stone (1126
    ranks 3,047th by it), and percentiles fail the same way; the snip's PEAK works (90, same as
    1126's): within 10% keeps 136 of 13,583 icons with 1126 in, but 1126 still ranks 3rd inside
    them. A cut, not a fix.
  - **Remove the texture: 1126 ranks 1st, score 148 against 604 for the runner-up, no prior.** The
    stone is the game's own `uifiles/default/wnd_bg_dark_rock.tga` (256x256, 24-bit TGA; the
    `WDT_Inner` template's background), tiled at 1:1. Aligning it to a blank patch of the full-window
    snip (below the text) fits to 0.8 RMS, gain 1.02; predicted background subtracted, pixels within
    10 of it set to black, then the normal finder. The window's border lines stay and are cropped.
- **Second window (owner, 2026-10-21: Black Lizard Scale, 217x327, no Lore tab, an item not in
  `items.json`, so a real Gaps case):** text in 336 ms, every line read, `BlackLizard` (space
  lost), and `Weight: 2.0` read as `Weight 20` AGAIN: the decimal loss is systematic (fix in
  preprocessing, or restore the one decimal weight always has). New line: `Value: 3 silver 8
  copper`, the vendor's base value, which maps to `merchant_value` (`3s 8c`). Texture aligned at
  0.9 RMS; the finder's winner **1225, score 333 against 1,403**, matches by eye, and
  `items.json` gives the same icon to Pristine Lizard Scale.
- So the icon step for an item window: align the window's texture, subtract it, find. Rank within
  the icons that items of the read slot use only as a fallback when the winner's margin is thin. The
  prototype's alignment is brute force (3.6 s over 256x256 offsets); a coarse-to-fine search or the
  window's own position makes it fast. Untested: a paste of the icon alone (little blank stone to
  align on) and other window skins (`default_light`, `default_modern`, custom UIs).
- Real-window fixtures needed: a weapon (Skill, Atk Delay, DMG), an Effect line, a long class list,
  the Lore tab.

### Other players' UIs (owner, 2026-10-21: "some users may have a different UI"; Malkil's
screenshots are being gathered)

- Each character's skin is `UISkin=` in `<EQ>/UI_<char>_<server>_LO1.ini` (all four of the
  owner's say `default`). A skin's files sit in `uifiles/<skin>/`; missing files fall back to
  `default`. The install ships `default`, `default_light`, `default_modern`; the backgrounds differ
  (`wnd_bg_light_rock.tga`, `wnd_bg_mid_rock.tga`, `eqls_wnd_bg_*_rock.tga` in `default_modern`).
- Plan: read the skin from the ini, take the window's background from that skin's
  `EQUI_Templates.xml`; when unsure, fit every `wnd_bg_*` texture the install has and keep the
  lowest RMS. A fit that stays high (window transparency over the 3D world, a custom UI with no
  texture) drops to the plain finder plus the slot prior.
- The text layout differs per skin too (`EQUI_ItemDisplayWindow.xml` is per skin), so the window
  to wiki mapping keys on labels (`Weight:`, `Value:`), never on positions.
- **Malkil's window (2026-10-21, Windstriker +10, 642x979):** an ornate silver scrollwork frame
  that none of the three stock skins draws (their frame sheets and `EQUI_Templates.xml` checked:
  the only filigree is the achievement window's), so most likely a custom UI in his
  `uifiles/<name>/`, named by his ini's `UISkin=`. The window background is see-through: the 3D
  world shows behind the text (the owner's `eqclient.ini` has `BGAlpha=247`, nearly opaque; his is
  likely far lower). Text ~1.5x the owner's size. The Merge/Place buttons, Tier bar and exaltation
  rows are stock (`IDW_Merge_Item_*` in default's `EQUI_ItemDisplayWindow.xml`); they show because
  the item upgrades.
  - Text: 1.65 s, confidence 79, every stat read across three columns (`Base Dmg: 90`, `Delay:
    60`, `Accuracy: +25%`, `SV. Void: 10`), the exaltation rows and the effect block. Faults: the
    title bar is junk; decimals lost again (`0.4` -> `04`, `Ratio 1.5` -> `15`: 3 windows of 3,
    so a preprocessing fault, not chance); rn -> m (`Omamentation`, `Wom`); `lll` for `III`.
  - Icon (about 1.9x, over the see-through world, so no texture to subtract): the plain finder
    puts the right icon 2nd (1104, the `items.json` icon of Windstriker; 597 first, 754 vs 747).
    The name read from the window (`Windstriker +10` -> `Windstriker`) or the `Range` slot settles
    it.
- **Malkil's same window over the sky (2026-10-21):** the background is the world through a
  translucent window, so it changes with the camera. Text: confidence 84 (better than over ground),
  same faults. Icon, plain finder: 1104 left the top 3 (it assumes icons on black; this is
  blue-grey). **Flat background removal** fixes it: the median colour of the crop's border ring is
  the background, pixels within 25-40 of it go black, then the normal finder. Sky: 1104 1st (435),
  597 2nd (462); ground: 597 1st (422), 1104 2nd (438); third place ~940-1010 on both. 597 and
  1104 are the same bow in two colours (1104 pale with purple tips, as his is), so the pair is a
  recolour tie the top-5 list, the name read from the window, or the slot settles.
- So the background step is: the skin's texture when it fits (opaque windows), else a flat colour
  from the ring (translucent windows), else nothing; take the step with the clearest winner.
- To collect from a player with an unknown UI: the `UISkin=` line of `UI_<char>_<server>_LO1.ini`,
  the `uifiles/<skin>/` folder name (and whether it is a downloaded UI), and the `BGAlpha`,
  `BRAlpha`, `FGAlpha` lines of `eqclient.ini`.

### What the prototype changes in the design

- Text engine: **tesseract.js** (option A). Windows OCR is fast but too weak on small text.
- The decoder handles DXT5, DXT3 and raw ARGB sheets.
- Fix-ups use the closed vocabularies (Slot, Size, class and race codes, `SV` names, the item name
  from the Gaps row); numbers are never corrected, only flagged when `parseStatsBlock` rejects the
  line.
- Node 24.19 gave a wrong re-rank score about 1 run in 10 until the hot loop sat in its own
  function (gone under `--no-maglev`; 30 of 30 clean since). The in-app matcher gets a test that
  scores a known icon against itself many times.

## Built (2026-10-21, `screenshot-to-wiki`)

- A box in a Gaps row's details (Items, Mobs, Merchants, Images): a click reads the clipboard (snip
  with Win+Shift+S first), Ctrl+V works while the row is open, a file can be dropped. Items: the
  statsblock (editable), the icon picker (top 5, drawn from the install), Value, focus effect; a
  second paste of the Lore tab adds `{{Item Lore|...}}`. Copy wiki page uses what is kept. Mobs:
  the picture is saved as `npc_<name>.png` (or the Images row's file name), the upload form a click
  away.
- Measured on the five fixture screenshots (`tests/fixtures/shots`): Ruined Robe's statsblock equals
  the owner's page; icons 1126 (window and icon alone), 1225 at rank 1, 1104 in the recolour pair
  with 597 on both of Malkil's shots. 0.5-2 s a paste; the index 4 s once.
- Changed from the design above: the background view with the lowest best score wins (not the
  widest margin); OCR reads TSV at about 3 MP; DMG is checked against the window's Ratio.
- Not built: local icons app-wide (question 4); the glyph-exact reader (D2); the hotkey for spell
  windows (no tab label to anchor on).

## Built, second round (2026-10-21, `screenshot-to-wiki`)

- Item page facts phase 5 (`plans/2026-10-20-gaps-item-page-facts.md`): a Lore tab on the window
  means the item has lore (the game draws the tab only then), so the page writes
  `{{Item Lore Missing}}` until the Lore tab is pasted. Slot lists every slot the window prints;
  the window is the only source of Slot. Labels taken from the client's strings
  (`eqstr_us.txt` 12999-13045): `End`, `End Regen`, `Dmg Bon`, `Rec Level`/`Req Level` (pages:
  `Recommended level of N.`), `Charges`, `Deity` (labelled or the god's name alone after Race),
  container `Capacity` / `Size Cap` (pages: `Capacity: 8 Size Capacity: GIANT`).
- D1 style (`shared/itemVocab.ts`): flags as the window prints them, `, ` between; `Size: X WT: Y`;
  values in caps, `except` lower; EAR/WRIST/FINGER/SHOULDERS; known values a guide: a slip snaps
  within edit distance 1 of one value (2 for 8+ letters), anything else kept and flagged.
- D3 (`shared/itemDelevel.ts`): a `+N` window's numbers run back through `itemUpgrade.ts` over every
  merge fraction; exact everywhere -> "Estimate +0 stats (a guess)"; else the lines that do not
  invert are listed (Weight's ceiling is many-to-one, so most weighted items at +N get no guess).
  Copy wiki page keeps the skeleton until the player takes the box to +0.
- Phase 4, spells (`shared/spellWindow.ts`): `|spellicon` = spells_us.txt field 76 (741 of 749 cached
  pages agree), `|description` = dbstr_us.txt type 6 at field 86 when it has no placeholder (621
  cached pages word for word). 19,720 of 35,888 descriptions hold placeholders (`#1`, `@1`, `%z`):
  the spell display window's numbers go into the file's words. No spell-window screenshot yet: the
  window's labels are assumed from eqstr_us.txt; synthetic tests only.
- Phase 3, hotkey and auto-find (`main/ipc/shotCapture.ts`, `main/shot/findWindow.ts`): the
  EverQuest window is captured (desktopCapturer, window source); the item window is found by the
  selected tab's yellow label (`max(r,g) >= 100, b*3 < r`, AustonZ's idea, MIT, no code), its height
  the scale (any UI scale, owner D4); sides = strongest vertical edges, bottom = first edge below
  which the sides stop. 10-30 ms on a 1920x1200 capture plus the read. Untested against a live
  game window (title match `EverQuest`; an exclusive-fullscreen client may capture black).
- Fixes from the owner's tests: a two-word lore was refused by the stray-picture sentence rule
  (Shrubbery); a wrapped lore kept one line (Sickly Maiden's Hair); the icon box was placed from a
  junk word OCR read off the icon (`By Class:`), Lizardman Mystic Scale's 1233 lost to its brown
  recolour 6911; Malkil's container lost Capacity, Size Cap and its deity.
- Fixtures now 9 (`tests/fixtures/shots`): the owner's Shrubbery Lore tab, Lizardman Mystic Scale,
  Vial of Swamp Water, and Malkil's Surefall Fletching Kit added.
