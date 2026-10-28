// itemPageCategories.ts — the two categories an item page files itself under that the Gaps tab
// checks against the log (shared/gapForage.ts): `[[Category:Foraged]]` for a forage, and
// `[[Category:Tradeskill Ingredient]]` for a loot line that stored the item in the tradeskill depot
// (owner, 2026-10-21). Both sit after the template; a comment is never read. Measured on the cached
// item pages: Foraged on 137 (2026-10-21), Tradeskill Ingredient on 870, one spelling (2026-10-27).

import type { ItemKnowledge } from '../shared/types'

/** `<!-- … -->`, an unclosed one running to the end, as MediaWiki reads it. */
const HTML_COMMENT_RE = /<!--[\s\S]*?(?:-->|$)/g
const FORAGED_CATEGORY_RE = /\[\[\s*Category\s*:\s*Foraged\s*(\|[^\]]*)?\]\]/i
const INGREDIENT_CATEGORY_RE = /\[\[\s*Category\s*:\s*Tradeskill[ _]Ingredient\s*(\|[^\]]*)?\]\]/i

/** Each category as `true` when the page files itself under it, else `undefined`. */
export function itemPageCategories(wikitext: string): Pick<ItemKnowledge, 'foragedCategory' | 'ingredientCategory'> {
  const page = wikitext.replace(HTML_COMMENT_RE, '')
  return {
    foragedCategory: FORAGED_CATEGORY_RE.test(page) ? true : undefined,
    ingredientCategory: INGREDIENT_CATEGORY_RE.test(page) ? true : undefined
  }
}
