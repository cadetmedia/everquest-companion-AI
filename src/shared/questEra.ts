// questEra.ts — is a catalog quest playable on this server? The QUEST side of the app's one era
// rule, kept here (shared) so a renderer view never filters the catalog itself (owner ruling 4).
//
// THE WITNESS is the quest page's own era banner (`QuestEntry.eraTag`, read by `parsePageEraTag`
// at scrape time) and THE RULE is `eraBadgeOverrides` — the same predicate that lets an item
// page's `Out of Era` banner overrule its drop zones. So `{{Kunark Era}}` is out until
// `CURRENT_ERA` reaches Kunark and then in, with no second table to move; the tokens that name no
// expansion (`FearHateRevamp`, `Epics`, `Unknown`) stay out on the register's word.
//
// ONE DIRECTION ONLY: a page with no banner, or an `in` one, is offered. Silence is not evidence
// that a quest is out (166 of 900 catalog pages state no banner, most of them classic newbie
// quests), and hiding them would cost the player real work the wiki merely forgot to label.

import { CURRENT_ERA, eraBadgeOverrides, type Era } from './planner/era'
import type { QuestEntry } from './types'

/** True when the quest page's banner places it outside `era` (default: what the server ships). */
export function questOutOfEra(quest: Pick<QuestEntry, 'eraTag'>, era: Era = CURRENT_ERA): boolean {
  return eraBadgeOverrides(quest.eraTag, era)
}

/** The quests a player on `era` can actually do — the catalog minus the out-of-era banners. */
export function inEraQuests(quests: readonly QuestEntry[], era: Era = CURRENT_ERA): QuestEntry[] {
  return quests.filter((q) => !questOutOfEra(q, era))
}
