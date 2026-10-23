// wikiTemplates.ts — whether a page's text is the kind of page the app reads: an item page opens
// {{Itempage}}, a mob page {{Namedmobpage}} or {{MerchantPage}} (scripts/sources/mobPage.ts). A page
// of the right name without its template is free text the scrapes never keep, so the Gaps tab says
// "a page exists, fix it" instead of sending the player to create a second one (owner, 2026-10-22:
// "Drake lava powder" was free text and the owner made "Drake Lava Powder" beside it).

/** Does this wikitext open an item page's template? Any case and spacing. */
export const hasItemTemplate = (wikitext: string): boolean => /\{\{\s*Itempage\b/i.test(wikitext)

/** Does this wikitext open a mob or merchant page's template? */
export const hasMobTemplate = (wikitext: string): boolean => /\{\{\s*(Namedmobpage|MerchantPage)\b/i.test(wikitext)
