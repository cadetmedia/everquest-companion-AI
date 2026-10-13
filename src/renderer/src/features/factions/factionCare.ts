// factions/factionCare.ts — which of a quest's faction losses MATTER. PURE (no React, no IPC),
// node-testable — the factionQuests.ts arrangement.
//
// THE OWNER'S QUESTION (2026-10-12): "is there any Miners Guild 628 way to get faction up that
// doesn't damage a good faction?" Nearly every quest that raises one faction lowers another (463
// of the catalog's 601 faction quests do both), so "no loss at all" finds almost nothing. What
// the player can answer, and the catalog cannot, is which losses they do not mind: Riptide
// Goblins, Butcherblock Bandits, a rival city's rogue guild. The player marks those factions
// DON'T CARE, and a quest is CLEAN when every loss its page states lands on one of them.
//
// A quest whose page states NO faction effect is never clean: silence is not a receipt (the
// home-zone candidates' rule in factionQuests.ts), so the clean filter leaves them out.

import type { FactionQuestRef, ReceiptHit } from './factionQuests'

/** The losses on a quest's receipt that land on a faction the player has NOT marked don't-care. */
export function caredLosses(ref: FactionQuestRef, dontCare: ReadonlySet<string>): ReceiptHit[] {
  return ref.hits.filter((h) => !h.up && !dontCare.has(h.key))
}

/** Clean: the page states a receipt, and nothing on it costs a faction the player cares about. */
export function isCleanQuest(ref: FactionQuestRef, dontCare: ReadonlySet<string>): boolean {
  return ref.hits.length > 0 && caredLosses(ref, dontCare).length === 0
}
