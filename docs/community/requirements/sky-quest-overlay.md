# sky-quest-overlay: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-16 | owner | A Quest overlay that shows quests, their steps, the items needed, zones and turn-ins. Start with Plane of Sky only. | open (Sky first, rows below; other quests and steps not started) |
| 2026-10-16 | owner | The Sky Quest overlay makes it easier to gather items for quests and hand them in. It lists the quests in the Sky tab's favorites. | built (the quests starred on the Sky tab; a quest that "Favorites only" shows just because it needs a starred item is not listed) |
| 2026-10-16 | owner | Each quest is one row, like a row on the Quests tab but a single line with less text where possible. | built (one line), then the items moved to their own indented line by the owner's later ask (row below) |
| 2026-10-16 | owner | Each row shows the class, the reward, the turn-in NPC, the required items and whether you have each, and a sign that the quest is ready to turn in. | built (READY in green, else how many items are held; class code; reward, or the quest name when the data names none; the NPC; each item ticked when held, with have/need when more than one is needed. Unlocked, a row opens the quest on the Sky tab) |
| 2026-10-16 | owner | A button at the top of the Quests tab and the Ready tab adds every quest in the list, as filtered, to the favorites at once, like a checkbox at the top of a column that checks every visible row. | built (star checkbox "Favorite all shown (N)": Quests tab over every filtered quest on every page, Ready tab after its first-time toggle and class pick; half star when some are starred; when all are starred it unstars them) |
| 2026-10-16 | owner | A stronger visual separation between each quest on the overlay: alternating backgrounds, lines, or something like them. | built (rows alternate two shades, a divider line between quests, and a thicker coloured left edge: green when ready) |
| 2026-10-16 | owner | On the overlay, a quest's items sit on their own line under it, indented slightly, so it is plain where the next quest starts. | built (items always on a second line, indented under the quest's first line) |
| 2026-10-16 | owner | Each item on the overlay shows its icon, small, no taller than the item chip, so the rows do not grow. | built (the item's wiki icon at the chip's text height, from the committed item database through items:marks, never the network; no icon when the database names none) |
| 2026-10-17 | owner | A toggle, button or chip at the bottom of the overlay to show or hide the item icons, on by default, for players who do not want them. | built (Icons chip in the footer, shown while unlocked like the other controls; remembered in the overlay's own saved settings) |
| 2026-10-17 | owner | Duplication clean-up (DRY without going overboard): where whole functions or components are copies with the same behaviour, keep one (the more efficient one that loses no functionality) and use it everywhere; 1-3 identical lines are fine; nothing may change what a feature does. | asked |
