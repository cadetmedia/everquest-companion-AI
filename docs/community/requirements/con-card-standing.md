# con-card-standing: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19). Rows
before 2026-10-10 were gathered that day from agent notes and the branch history.

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-08 | xievas (upstream #75) | The /con card shows the con colour and the faction standing. | built (bottom line, not a full-card tint; approved by the requester) |
| 2026-10-23 | owner | "add in so that when you con something it can stay up a little longer, and also, shows the faction hits it could give if you kill it!": the con card lingers longer, and lists the faction changes a kill of that mob gives (the wiki's `factions`/`factionAmounts` on its mob page, and what the player's own log measured on kills). | built (con-card-standing 44c16954, e02c89be: the hold defaults to 8 s, an old stored 3 s default reads as 8 s; "On kill (wiki):" lists the mob page's faction hits, green up, red down; "Factions: Unknown" when the page names none. Open: hits measured from the player's own kills, which would cover mobs the wiki has no factions for, need the Gaps engine's killFactions served to the con card) |
