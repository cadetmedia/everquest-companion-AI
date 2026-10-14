# map-waypoints: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-13 | vorpaldicepress (Discord), via owner | On the Map tab, click a rare, NPC, zone line or point of interest to copy its coordinates as a `/way` command to paste into EQ, to wayfind to targets quickly. | built (copy button on every located sidebar row; the game's command is `/waypoint`, string 8326 of `eqstr_us.txt`) |
| 2026-10-13 | vorpaldicepress (Discord), via owner | That list as an overlay you can click. | built (Map pins overlay; click a pin while unlocked) |
| 2026-10-13 | owner | A new map overlay that shows only the tracked pins and the four corners of the map, so the user can size and align it over the in-game map. The map itself is not drawn in the overlay (two near-identical maps on top of each other would be annoying). | superseded by the owner, 2026-10-13 (map lines on a toggle, row below) |
| 2026-10-13 | owner | A mob the user clicked or added to a track list shows its spawn location with its own icon or colour. | built (tracked: purple ring on every spawn point; clicked: the existing selection ring) |
| 2026-10-13 | owner | Double-click a position (on the map) to get the waypoint command for it. | built (anywhere on the map; on a mob pin, its spawn point. Pin double-click no longer opens the mob page) |
| 2026-10-13 | owner | The waypoint command is also copyable from the Maps tab. | built |
| 2026-10-13 | owner | Mobs (and other points) can be added to the track list from the normal Maps tab. | built (row bookmark button, right-click on a pin; Tracked section in the sidebar) |
| 2026-10-13 | owner | The Maps tab and the overlay offer similar functions; the overlay is kept as short and simple as possible. | built (overlay: header, corners, pins, nothing else) |
| 2026-10-13 | owner | Every mob watched on the Timers tab is part of the map tracking automatically (Maps rings and Tracked list, Map pins overlay). | built (derived from the watch list, placed like the red timer pins; alarm icon in Tracked; unwatching removes it) |
| 2026-10-13 | owner | The Map pins overlay draws the map the user uses (the same pack as the Maps tab). Replaces the earlier "no map in the overlay" row by the owner's word, now behind a toggle. | built (Map chip) |
| 2026-10-13 | owner | The overlay shows the points of interest too (mobs, map labels), not only the tracked ones. | built (Points chip: map labels and named mobs) |
| 2026-10-13 | owner | Toggle chips in the overlay's header area for: the map's lines (walls), points of interest, timers, tracked mobs. | built (Map, Points, Timers, Tracked; shown while unlocked; remembered per machine) |
| 2026-10-13 | owner | A pin's label never runs off the right edge of the overlay; near the edge it ends at the pin instead. | built |
| 2026-10-13 | owner | Size the overlay to the game map's parchment and the pins match the game's whole-zone view (one scale, centred). | built (fitExtent) |
| 2026-10-13 | owner | Zoom and pan never redraw the Maps sidebar; make the map as fast as it can be. | built (Rathe Mountains, prod build: drag 6.4 s -> 0.24 s, 16 zoom steps 1.9 s -> 0.13 s of main-thread work) |
| 2026-10-13 | owner | The overlay is too busy with every name shown: only timer and tracked marks carry their labels; a point of interest shows its name while hovered. | built |
| 2026-10-13 | owner | The Map pins overlay can be made larger than the other overlays' 720x820 cap. | built |
| 2026-10-13 | owner | Zoom and pan the overlay by hand to match a zoomed in-game map, with a reset button back to the whole zone. | built (unlocked: scroll zooms at the cursor, drag pans, Fit chip resets; kept per zone) |
| 2026-10-13 | owner | A mob shown twice on the overlay (plain and with "due") is drawn once. | built (a tracked mark under a running clock is drawn as the timer mark only) |
| 2026-10-13 | owner | A timer button beside track on the Maps sidebar: it adds the mob to Timers and tracks it if not already tracked; clicked again it removes the timer. Track adds to tracking only. The Tracked list's alarm icon removes the timer. | built |
| 2026-10-13 | owner | A transparency slider on the Map pins overlay like the other overlays. | built (its own: 0 to 90%, default 20%, since the shared one starts at 72% and cannot go clear) |
| 2026-10-13 | owner | The overlay's chips, Fit and slider sit at the bottom like the XP overlay's controls. | built (footer bar, unlocked only) |
| 2026-10-13 | owner | Pinned (click-through), the overlay's points still take a click, so a /waypoint can be copied without unpinning. | built (marks reported as hover zones while pinned; untested headless, the cursor watcher is off in e2e) |
| 2026-10-13 | owner | A zoomed map does not run into the overlay's header and footer. | built (the map is clipped between the bars, which stay see-through so the game UI under them shows) |
