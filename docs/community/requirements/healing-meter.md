# healing-meter: what was asked for

Every request the healing meter has taken, newest at the bottom. Read it before changing the
meter (the Combat tab's Healing view, the heal overlays, `engine/crates/fold/src/combat/healing.rs`
and the heal routing in `routing.rs`); nothing listed here is removed or narrowed without the
owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-26 | owner | Your heals on anyone other than yourself or your pet counted nowhere (about 340 `You healed <other>` lines, about 175k HP, on the 2026-10-17 log). Asked whether to count them on your healer row: "weird yeah fix the healing meter". They count on your own row (`you`), as your healing output, per spell lane, with overheal from the `(M)` form as for self-heals, and into the fight they land in. They are not healing you received. A heal you land on an engaged hostile stays enemy healing. | built (fix-heal-others, not yet tested in the app): on the 10-17 log your row gains 349 lines, 183,167 HP and 15,997 overheal across every zone stay; enemy healing, incoming healing and damage unchanged |
| 2026-10-26 | owner | A heal your pet casts on a group mate: "sure if my pet can be truely tracked to me and healed a group mate sure". It counts on your pet's own healer row (the row its heals on you already use), per spell, with overheal from the `(M)` form. Only when the healer is a pet bound to you by evidence at that moment (a leader answer, a Master tell, a pet-buff landing, or a corroborated charm; a charm still awaiting corroboration does not count) and the target is a roster member or a pet bound to a roster member. A same-named creature with no bind, a heal from before the bind, or a target outside the group stays uncounted. A heal on an engaged hostile stays enemy healing. | built (fix-pet-heal-others, not yet tested in the app): the 10-17 log has 7 heals from pet-named healers on other players or pets, and none comes from a pet bound to you at that moment healing a group member, so its totals are unchanged |
