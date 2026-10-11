// eqlwiki.com link helpers — the ONE place a wiki page title becomes a URL.
//
// URL CONVENTION (verified 2026-08-02 against the live site, 5 titles + the MediaWiki API):
//   https://eqlwiki.com/<Page_Title_With_Underscores>       → 200
//   https://eqlwiki.com/wiki/<Page_Title>                   → 404
// eqlwiki serves articles from the ROOT, not from a `/wiki/` path (the `/wiki/` form is
// itself interpreted as an article title "Wiki/…" and 404s). Redirect titles resolve fine —
// `Bard_Plane_of_Sky_Tests` is a redirect into `Plane of Sky#Plane of Sky Class Quests` and
// still returns 200 — so a class page link is safe for every class.
//
// Links are opened in the user's DEFAULT BROWSER, never in an app window: every renderer uses
// `<a target="_blank">` and main's `setWindowOpenHandler` turns that into `shell.openExternal`
// + `{action:'deny'}` (index.ts — both the main window and each overlay window).

/** Absolute URL for a wiki page title (spaces → underscores). Empty title ⇒ undefined. */
export function wikiPageUrl(title: string | undefined | null): string | undefined {
  const t = (title ?? '').trim()
  if (!t) return undefined
  return `https://eqlwiki.com/${encodeURI(t.replace(/ /g, '_'))}`
}

/**
 * The wiki page that documents a class's Plane of Sky test QUESTS (the quest page, not the
 * reward item page): `<Class> Plane of Sky Tests`. Same convention PoskyView already links.
 * Verified: Enchanter/Paladin are real pages; Bard redirects into the Plane of Sky section.
 *
 * The scraped posky dataset carries only `source: "Plane of Sky"` per quest (there is NO
 * per-quest wiki page — `Bard Test of Tone` etc. are all missing on the wiki), so this
 * class page is the most specific HONEST quest link available.
 */
export function skyQuestPage(className: string | undefined | null): string | undefined {
  const c = (className ?? '').trim()
  if (!c) return undefined
  return `${c} Plane of Sky Tests`
}

/**
 * The wiki page for a quest an item or a mob is tied to (owner ask, 2026-10-11: quest names
 * link to the wiki wherever an item or a mob shows one). A posky use's `page` is the dataset's
 * "Plane of Sky" source line, not a quest page, so it goes to the class's Sky Tests page — the
 * class read off a `Class::Name` key when the use carries one, else off its "Class · Name"
 * label. Every other use links `page` (the catalog page, or a `[[Page|Label]]` target) and
 * falls back to the quest name, which the catalog spells as the page title.
 */
export function questWikiUrl(use: {
  quest: string
  page?: string
  source?: string
  poskyKey?: string
}): string | undefined {
  if (use.source === 'posky') {
    const cls = use.poskyKey?.split('::')[0] ?? use.quest.split(' · ')[0]
    return wikiPageUrl(skyQuestPage(cls))
  }
  return wikiPageUrl(use.page ?? use.quest)
}
