# spell-upgrades: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19). Rows
before 2026-10-10 were gathered that day from agent notes and the branch history.

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-09-10 | owner | A Spells area: spellbook, which upgrades are worth buying, and a loadout. | built (behind UNRELEASED until the telemetry deploy) |
| 2026-09-12 | owner | Mana-regen buffs (Breeze) count in buff lists. | built |
| 2026-09-12 | owner | A utility pane: slow, charm, dispel, debuffs, lull, pet, mez, illusion. | built |
| 2026-09-12 | owner | One gem per spell line in the combat set. | built |
| 2026-09-26 | Garrett (via owner) | Buff stacking for the whole group, not only your own classes. | built (group buff set) |
| 2026-09-26 | owner | A colour per group member, settable; Keep up grouped by caster; /who suggestions. | built |
| 2026-09-26 | owner | Show no stacking where the game says it does not stack (Wolf form vs Bih`Li movement). | built (triggered spells contest) |
| 2026-10-11 | owner | No lag (app-wide sweep): the Spellbook settles 110 to 117 ms on every keystroke with a 91 ms open stall; rows are not memoized. Memoize rows, trim the per-key work. | built (corpus read once, rows filtered per keystroke, SpellRow memoized, screenful in a transition; open stall to none, settle 62-80 ms) |
| 2026-10-17 | owner | Duplication clean-up (DRY without going overboard): where whole functions or components are copies with the same behaviour, keep one (the more efficient one that loses no functionality) and use it everywhere; 1-3 identical lines are fine; nothing may change what a feature does. | reviewed, unchanged (nothing a whole-function copy) |
| 2026-10-18 | owner | New at this level shows AAs at the level they unlock ("sure add the missing AA's into it"): Harm Touch left the list when the wiki moved it from the Shadow Knight skill table to the AA table. | built (each rank at the level its Requirements clause states, for the classes the wiki lists the AA under; the 34 archetype AAs name no classes on the wiki and the 30 general AAs apply to every class, so neither is listed yet: owner to choose) |
| 2026-10-20 | owner | "i don't think that the upgrades tab is respecting the classes i am using or selecting": the Upgrades list showed lines from other class combos the character once held. Decision: "spellbooks, we should just add the same existing control from the other spellbook tabs on this tab reusing the existing code". | building (Upgrades filters by the Spellbook's class control, shared; lines from other classes counted in a caption) |
| 2026-10-20 | owner | "RAGE is missing from this list?" (the Loadout buff set, MNK/SHM/WAR). Decision on the wider effect (20 kept, Harnessing of Spirit left out behind Infusion of Spirit + Talisman of Altuna + Strength + Dexterity): "Merge it". | built (a block/overwrite stacking directive bites only in the slot it names; the log shows Rage and Harnessing up together; the ground-truth corpus still matches 40 of 40) |
| 2026-10-21 | owner | General and archetype AAs in New at this level: "sure include it if we can and if it makes sense". | built (the 30 General AAs for every class, each rank at its level: all at 1, chipped General AA after the class rows; the 34 Archetype AAs left out: the wiki's table states no archetype or class for them) |
