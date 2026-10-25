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

Not done, each needing a ruling or another branch (BRANCH_NOTES.md, "Unassigned open items"): `heal-*`
in `CHARACTER_AWARE_OVERLAYS`; `killFactions` out of the gaps snapshot; `gearOwnership` in a module
store; the map timer pins' clock.
