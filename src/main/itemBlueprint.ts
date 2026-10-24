// itemBlueprint.ts — an Item Page Blueprint saved with its placeholders unfilled (owner, 2026-10-24:
// eight new Nektropos Castle pages dropped from `Mob_Name`, served `Quest_Name` and fit
// `Slot: PRIMARY / SECONDARY / RANGE / AMMO / ANY ...` with every stat `+?`). Its placeholders are no
// facts: the page exists, and only its era banner and icon are read (itemLookupParse.ts).

const PLACEHOLDER = /\b(?:Mob_Name|Quest_Name|Effect_Name|Zone_Name)\b/
const EVERY_SLOT = /Slot:\s*PRIMARY \/ SECONDARY \/ RANGE \/ AMMO/

export function isUnfilledItemBlueprint(wikitext: string): boolean {
  return PLACEHOLDER.test(wikitext) || EVERY_SLOT.test(wikitext)
}
