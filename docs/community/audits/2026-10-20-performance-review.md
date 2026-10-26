# Performance review, 2026-10-20

The owner reported that every tab click took 500 ms or more. This page records what was measured, what
has been fixed and what is left, in ranked order. Read it before any performance work. Numbers come
from a production build (`npm run build`), run hidden and isolated against copies of the owner's logs,
unless they say otherwise.

## Measured

- **Tab switch, owner's setup** (dev server, 9 overlays open, live log lines arriving): about 480 ms
  on average. Roughly 270 ms of that is dev-mode overhead: the dev server is 2.2x slower than a
  build on every tab. About 90 ms was the Wiki Gaps overlay's background list, and about 110 ms is
  the app's own work.
- **Production, no overlays:** a repeat switch averages 112 ms of settle and 62 ms of long tasks. The
  worst tabs on a repeat visit: Gaps 457 ms, Loot 358 ms, Maps 224 ms, Posky 152 ms, Buffs 122 ms.
- **Startup:** about 10 s in dev, 7 s of it "Interface drawn". The production profile (v1.10.0) draws
  the interface in 607 ms, so the 7 s is a dev-mode cost.
- **Engine reads are fast:** `module.snapshot` takes 16–86 ms for gaps, 35–72 ms for loot and ≤1 ms
  for the rest. A trivial IPC call's p50 is 0–1 ms. Its spikes always matched the renderer's own
  long task.
- **Snapshot sizes** (from the owner's saved Gaps file): loot 1.23 MB (9,787 rows); gaps 648 KB, of
  which `killFactions` is 535 KB (raw sample lines) and the gap rows only 82 KB; kills 226 KB.

## Done (2026-10-20)

- **Wiki Gaps overlay background list** (`gaps-overlay`): with the tab closed, it derives only the
  domain shown and takes new game data every 15 s (`lib/useThrottled.ts`).
- **Gaps derivation** (`gaps-tab`, `gapMemo.ts`, `gapDerive.ts`): the catalog indexes are built once
  and `ties()` no longer rescans the catalog. Factions 58 → 7 ms, drops 234 → 38 ms, images
  44 → 8 ms; a revisit with unchanged data takes 0.1 ms. The first visit in a session takes about
  185 ms.
- **`start_companion.ps1 -Prod`:** builds once and runs the build, which halves tab-switch time
  compared with the dev server. The owner plays on this.
- **Overlays stacked under other windows** (`overlay-reset`, `overlayBuried.ts`): the presence
  watcher checks the real stacking after each foreground change (about 1 ms a walk).

In progress at the time of writing: `perf-tab-switch` (date formatters, the Maps/Buffs/Loot render
cost) and `perf-main-stall` (the first Gear visit blocks main for 310–350 ms; the Maps cache write is
synchronous).

## The structural findings, ranked

Each entry gives the problem, the better design, an estimated gain and the effort. "Creator" means
the code is on `main`, so a fix there is an upstream pull request candidate.

1. **The big modules are watched on every tab.**
   - Problem: `MetInLogFeed` (App.tsx, useMetInLog.ts) and `AppCelebrations` (useProgress,
     useBossKills, useLevelUpToast) are always mounted. So `loot`, `kills`, `consider` and
     `progression` always have a reader, and moduleStore's "no reader, no fetch" gate never closes
     for them. Each loot or kill line re-fetches the 1.2 MB loot snapshot and re-runs about 7 full
     loot passes (posky/useProgress.ts) on whatever tab is open.
   - Better design: the engine serves the small facts these readers need, such as a "met" module of
     name sets and held counts.
   - Effort M. Fork code (metInLog) and creator code (useProgress).
2. **Whole snapshots instead of slices.**
   - Problem: `gaps` re-sends 535 KB of `killFactions` samples that only a detail panel reads, on
     every hail, con, loot or kill.
   - Short term (S): move the samples behind an on-demand op or into their own module, which makes
     each gaps fetch about 5x smaller.
   - Long term (L): move loot, kills and gaps readers onto the existing `useView` sources. The
     engine already builds the diffs, and this is the creator's stated plan.
3. **One slow snapshot blocks every read.**
   - Problem: main has one engine connection. The engine dispatches each connection's requests
     serially (conn.rs) and rebuilds a module's whole `serde_json::Value` on every ask
     (ingest.rs answer_asks). A gaps or loot build therefore delays every combat poll and stalls the
     tail.
   - Better design: serialize straight from typed structs, keep the last serialized bytes per module
     cursor, and dispatch asks concurrently.
   - Effort M. Creator code.
4. **Combat is polled 3–5 times over.**
   - Problem: the Combat tab, Overview and each meter overlay poll `combat.snapshot` once a second,
     each with different options, and none is gated on the game running or the window being visible.
   - Bug: `combat:activity` is sent to the main window only (serveDeltas.ts → `sendToMain`), so
     overlay meters lag up to 1 s. The `heal-*` overlays are also missing from
     `CHARACTER_AWARE_OVERLAYS` (worldRebuilt.ts).
   - Better design: one fetch per option set on the activity edge, pushed to the windows that need
     it, or the `combat.live` view.
   - Effort S for the bug, M for the shared feed. Creator code.
5. **Overlays fetch on their own.**
   - Problem: `useOverlayModule` and the hand-rolled fetchers in BuffsOverlay and EventLogOverlay
     have no shared store. The buffs and debuffs windows each fetch and sort the same timer rows.
   - Better design: one `createModuleStore` per overlay window. It takes the overlay bridge
     already.
   - Effort S–M. Creator code.
6. **Renderer derivations that belong in the engine.**
   - The candidates: the Gaps derived domains (factions, drops, images), Posky held counts and
     reconcile, the met-in-log sets, and `killIndex`. Each runs over all rows on every push and
     every remount; the engine could fold them once per log line.
   - The domain-munging lint covers only `src/renderer/**`, so derivations placed in `src/shared/`
     escape it.
   - Effort M–L.
7. **Tabs rebuild on every visit.**
   - Problem: tabs are conditional renders, so a visit loses every `useMemo`. Only Gear uses
     `lib/kept.ts`, and nothing else keys a derivation on snapshot identity.
   - Better design: per-site module caches (a `WeakMap<snapshot, derived>` or `kept()`).
   - Prefer this to keeping tabs mounted: hidden tabs would stay subscribed and make item 1 worse.
   - Effort S per site.
   - Sites found:
     - Leveling: `attributeSales` returns a new progression object, which breaks every memo
       downstream; it also runs twice per mount.
     - Posky and Loot: `getProgress` is fetched again on every mount and its 7 loot passes rerun.
     - Gear, Plan and Character: `gearOwnership`, `plannerInventory` and `characterSheet` are
       fetched again on every mount (null, then the map, so everything renders twice). Plan's
       `candidatePool` (11k rows) runs twice per mount.
     - Maps: three full mob-catalog scans for the same zone (`mobsInZone`, `timerZone`,
       `zoneBandOf`).
     - Mobs: `rosterInZone`.
     - Achievements/Slayer: `planZones`, two to three passes over 7.9k mobs.
     - Factions: `gearMaps`.
     - Overview: `buildDpsSeries`, plus no kept combat snapshot, so every visit opens on
       "Reading log…".
     - Raid Targets: `allStatuses` is computed in an effect, which forces a second render.
8. **Data weight.**
   - The main bundle is 16.4 MB, with items.json (8.9 MB) inlined. The renderer chunk is 4.8 MB,
     about 3.5 MB of it mobs.json and quests.json, imported eagerly. Each corpus is held three times
     over: engine, main and renderer.
   - Better design: load lazily, or answer through the engine's `knowledge.*` ops.
   - Effort M. Creator code.
9. **Idle wakeups.**
   - The presence worker polls the foreground every 160 ms and runs `EnumProcesses` every 5 s.
   - The engine naps 25 ms at a time, even with EQ closed.
   - `livePerfProbe` runs two 250 ms timers.
   - `ToastOverlay` ticks every 100 ms whether or not there are cards.
   - The Buffs, Timers and Respawn views re-render their whole tree every second even with no rows.
   - `gameMapWatch` calls `statSync` every 500 ms on main.
   - Effort S each.
10. **Every overlay window loads all 12 kinds' code** (about 686 KB). `React.lazy` per kind would
    fix it. Effort S, small gain.

## Quick wins

Done 2026-10-25 (BRANCHES.md rows of perf-tab-switch, fix-combat-reading-log, coin-and-deaths):
`combat:activity` to the meter overlays; the in-flight guard on `useOverviewCombat`; Overview keeps
its last combat answer; ToastOverlay and the Buffs tab's clock tick only with something to time;
`attributeSales` cached by (progression, loot); `plannerInventory` and `characterSheet` held per
window (`lib/dumpStore.ts`); the Timers tab, Respawn and Buffs overlays' 1 s clocks run only with
something to time, and `getProgress` is held per window (`posky/progressStore.ts`) (catch_all 72, 73).

Not done: `gearOwnership` in a module store (it would change the visible per-window "read at" time;
owner asked).

## Done 2026-10-26 (optimization pass 1, on the trunk)

- #2 (short term): the gaps snapshot no longer carries the kill-faction sample lines; the engine
  serves them as the `killFactionSamples` module, read only when a faction row's details open or a
  Copy runs (`gapKillFactionSamples.ts`). Saved files and archives keep the old shape. Owner's
  October log: gaps 951 KB to 482 KB; the rest is gap rows (199 KB) and quest talks (99 KB).
- #4: combat polling gated on visibility and activity (`features/combat/combatPoll.ts`): a hidden
  window reads nothing; a settled one reads every 10 s instead of every 1 s; in a fight, unchanged.
  Identical reads were already joined main-side (`readShim.serveShared`). Parked overlays fade by
  opacity, so only the activity gate applies to them.
- #5: skipped. No overlay window reads a module twice, so a per-window store saves nothing; the
  buffs/debuffs duplication is across processes (#3's per-cursor cache is the fix).
- #7: Maps/Mobs (one zone join per catalog and zone), Slayer plans, Plan corpora and pool, Factions
  `gearMaps`, Overview `buildDpsSeries` and Raid Targets (computed in render) kept across visits
  (`lib/kept.ts`, `mobZone.ts`). Raid Targets now shows an empty roster while the kills snapshot is
  null during a character switch.
- #9: `gameMapWatch` reads with `fs/promises`, one look at a time. `livePerfProbe` stays (a
  production instrument the feedback timeline needs; 0.075% of a core). The presence worker stays
  (off main on its own thread; 0.06-0.16% of a core; backing off would slow overlay response).
- #10: overlay surfaces `React.lazy` per kind: 715 KB of JS per overlay window to 269-376 KB.
- Quick wins: `heal-fight`/`heal-overall` in `CHARACTER_AWARE_OVERLAYS`; the map timer pins' clock
  runs only with a pin placed.
- #3 (part) and the engine's idle nap (perf-engine): the last `module.snapshot` answer is kept per
  module until its cursor moves (respawn never kept); the tail's nap backs off to the poll interval
  after 3 s of a quiet log (44.5 to 2.8 idle context switches/s). Asks are still served one at a
  time per connection.

## Re-measured 2026-10-26 (after pass 1 and perf-engine)

Trunk `c8398d395`. Production build (`npm run build`, release engine built from the same tree), run
hidden (`EQ_E2E=1`, `EQ_UNRELEASED=1`) on an isolated userData against a staged copy of the owner's
install: the live log is the October log (2026-10-06 to 10-25, 106 MB, 1.26M lines) plus the
current one, with the August archive segments, the dumps, `spells_us.txt` and the map packs.

Method, one line each:

- Tab switch: a probe spec clicks each nav row (and the Gear area's tabs); settle is the last DOM
  mutation of the burst the click starts (a gap of 400 ms ends it), long tasks are the
  `longtask` entries in the 2.5 s after the click. Round 0 is the first visit, rounds 1-3 repeats.
  Background throttling off, so the hidden window reads `visible` (as the owner's does).
- "No overlays" = the fresh-install defaults (toast and con card windows). Owner setup = the 9
  overlays he runs (toast, fight, overall, respawn, xp, events, conCard, gaps, buffs) with lines
  appended to the log copy: 2 combat lines every 500 ms, a kill, XP and loot every 8 s, a con.
- Module reads: `eq.getModuleSnapshot` timed from the renderer (round trip, 1 first + 10 repeats);
  engine side: `read_path_bench.rs` and `snapshot_build_costs` on the October log copy.
- Idle CPU: `TotalProcessorTime` per pid over 60 s, quiet log, Overview (resolution 0.026%).
- Live CPU attribution: a 30 s CDP profile of the main window plus a count of every IPC invoke.
- Derivations: the bench scripts in [2026-10-26-perf-bench.md](2026-10-26-perf-bench.md).
- Not the same: the 10-20 tab numbers had no stated harness, its live-setup figure was taken on the
  dev server (this one is production), its sizes came from the saved Gaps file (these from the
  served snapshot), and the log has grown (loot rows 9,787 to 11,102).

| Measure | 2026-10-20 | 2026-10-26 |
| --- | --- | --- |
| Repeat switch, no overlays (settle / long tasks) | 112 / 62 ms | 83 / 36 ms |
| Gaps repeat settle | 457 ms | 192 ms (median 154) |
| Loot repeat settle | 358 ms | 219 ms (median 106; one 466 ms) |
| Maps repeat settle | 224 ms | 56 ms |
| Posky repeat settle | 152 ms | 138 ms |
| Buffs repeat settle | 122 ms | 57 ms |
| Slowest repeats now | - | Loot 219, Gaps 192, Posky 138, Character 167, Unlocks 166, Plan 135 ms |
| First visit (cold), mean / worst | not measured | 149 ms; Loot 504, Gear 457, Gaps 390, Character 281 |
| Owner setup, 9 overlays + live lines | ~480 ms (dev server) | 83 / 46 ms (production; Overview and Combat excluded: live redraws never let them settle, their long tasks 0-33 ms) |
| Startup, "Interface drawn" | 607 ms (v1.10.0 profile) | 250-349 ms (4 launches; owner's -Prod today 403 ms) |
| Startup total to replay done | - | 1.3-1.9 s; engine serving after 24-37 s (106 MB fold) |
| Trivial IPC p50 | 0-1 ms | 0.5 ms (p95 0.6) |
| `module.snapshot` gaps (renderer round trip) | 16-86 ms | 11 ms (engine: first 87, repeat 9) |
| `module.snapshot` loot | 35-72 ms | 31-42 ms (engine: first 37, repeat 24) |
| `module.snapshot` the rest | ≤1 ms | buffs 37-43, kills 12-16, progression 9-14, killFactionSamples 5, others ≤4.5 ms |
| Same reads under live lines (owner setup) | - | kills ~150, gaps ~146, buffs ~143, loot 33-48 ms a read |
| Small ask on a 2nd connection while the 1st hammers loot/gaps/kills | - | p50 0.1, max 0.3 ms |
| Loot snapshot | 1.23 MB (9,787 rows) | 1.40 MB (11,102 rows) |
| Gaps snapshot | 648 KB (535 KB samples) | 482 KB (rows 195, killFactions 130, talks 97 KB); samples 533 KB on demand |
| Kills snapshot | 226 KB | 274 KB |
| Other big snapshots | - | buffs 1.29 MB (1.22 MB of it the message-overlay diagnostics), progression 749 KB |
| Overlay window JS | 715 KB | 242 KB shared + 27-136 KB per kind (269-378 KB) |
| Main bundle / renderer chunk | 16.4 / 4.8 MB | 16.8 / 6.2 MB (mobs.json 3.1 to 5.4 MB from the delta scrapes) |
| Idle CPU, quiet log, % of a core | - | main 0-0.05, renderer 0.4-1.8, overlays 0-0.2 each, engine 0.03 |
| Live lines, owner setup, Overview, % of a core | - | main 6.6, renderer 18.7 (JS 11), overlays ~6.5 together, engine 5.9, GPU 1.9 |
| First appended line folded after 1 s / 5 s quiet | - | p50 108 / 227 ms (the nap back-off) |
| Bench: Maps zone join, cold / repeat | ~3 ms / ~3 ms | 3.1-4.6 / 0.00-0.01 ms |
| Bench: Slayer `planZones` | 25-45 ms | 16-35 ms (per call; kept across visits) |
| Bench: Plan `candidatePool` | 15-30 ms | 12-30 ms (per call; kept across visits) |
| Bench: Factions `gearMaps` | ~5 ms | 2.9-4.4 ms (kept per gear index) |
| Bench: Overview `buildDpsSeries` 2k / 6k events | - | 0.1-0.7 / 0.2-0.5 ms |

Live-lines attribution (30 s, Overview, owner setup):

- `combat:snapshot` asked ~3.8 times a second by each of main, fight and overall (115 each); the
  appender wrote 2 batches a second. The Overview re-renders at that rate (MUI styling dominates
  the profile); the same 30 s on the Combat tab cost 5.4% of a core in JS against 11%.
- `progression` read every second by main and by the xp overlay (30 each, ~14 ms a read).
- The met-in-log feed re-folds every zone, mob and item name each time `progression` moves:
  `zoneKey`, `mobKey`, `setMet` ~330 ms per 30 s on every tab.
- `kills`, `loot` (main and xp) and `gaps` (the overlay feed) re-read on each kill; the buffs overlay
  re-reads the 1.29 MB `buffs` snapshot on each buff change.

## Second pass, ranked

Gains are from the numbers above; size S/M/L, risk in one clause.

1. **Combat read rate in a fight** (#4's shared feed, new evidence). ~11 `combat.snapshot` reads a
   second across 3 windows; Overview at 11% of a core in JS. Throttle the activity-ping read to one
   per window per second (S), or push one `combat.live` answer per option set (M). Expected:
   Overview JS from ~11% to ~5% of a core in a fight, main and engine reads down ~3x. Risk: meter
   lag if the throttle drops the last ping (read on the trailing edge).
2. **The always-watched modules** (#1). The met-in-log fold costs ~11 ms a second on every tab
   while lines arrive, and loot (1.40 MB) and kills re-fetch on every kill whatever the tab. Short
   step (S): skip the zone/mob/item fold when only `progression`'s non-zone fields moved (key on
   `zoneName` length and last value). Full step (M): an engine "met" module of name sets and held
   counts, so no window holds loot/kills for this. Expected: ~1% of a core and ~2 MB of reads per
   kill off non-loot tabs. Risk: the era verdicts must keep the same evidence (test on metInLog).
3. **Buffs snapshot slice** (new). 1.22 of its 1.29 MB is the message-overlay diagnostics only the
   Buffs tab's diagnostics panel reads; the buffs overlay and Loadout fetch it on every change
   (engine 106 ms first, 36 ms repeat; renderer 37-43 ms). Serve the overlay on demand, the
   `killFactionSamples` pattern. S. Expected: buffs reads ~30x smaller, ~30 ms off each. Risk:
   low; saved shapes unaffected.
4. **One connection, served in order** (#3's remainder). A second connection waits nothing (0.1 ms
   p50 while the first hammers), but main has one, so under live lines kills/gaps/buffs reads take
   ~145-150 ms against 6-12 ms quiet. Give combat and health their own connection, or dispatch
   asks concurrently in the engine. M, creator code. Expected: combat reads stop queueing behind
   big snapshots (up to ~140 ms a collided read). Risk: reply ordering assumptions in main.
5. **Heavy tab renders** (new). Kept derivations made repeats cheap where data was the cost; what is
   left is render: repeat long tasks Gaps 145, Character 129, Plan 103, Loot 79, Factions 77 ms;
   first visits Loot 504, Gear 457, Gaps 390 ms. Profile each and window/memo the row lists. S-M
   per tab. Expected: 50-100 ms off each of those switches. Risk: low.
6. **Derivations into the engine** (#6). Per call they cost what they did (bench above) but now run
   once per session, so the gain is the first visit and first push only (~15-35 ms each). L. Do
   after 1-5.
7. **Data weight** (#8). Renderer chunk 6.2 MB and growing with each scrape (mobs.json +2.3 MB since
   10-20); startup is not the problem (Interface drawn ≤350 ms), memory and parse are. Lazy-load
   mobs/quests or answer through `knowledge.*`. M. Expected: ~5 MB renderer heap per window that
   loads them. Risk: every mobs/quests reader turns async.
8. **Loot snapshot growth** (#2 long term). 1.40 MB and growing with play (+13% rows since 10-20);
   Loot first visit 504 ms. Move Loot onto a `useView` source. L. Do with 2.

Idle needs nothing more: every process is under 0.5% of a core on a quiet log except the main
renderer's one 1.8% sample (0.4% in the second).
