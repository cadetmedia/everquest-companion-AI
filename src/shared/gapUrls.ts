// shared/gapUrls.ts — the wiki links a Gaps row's chips and buttons open: its search, its editor on
// a page that exists or a new one, its upload form. Links the person clicks, never an app fetch. Apart
// from gaps.ts, which sits at its size ceiling; gaps.ts re-exports them.

/** The wiki's own search for a name — a link the person clicks, never an app fetch. */
export function wikiSearchUrl(name: string): string {
  return `https://eqlwiki.com/index.php?search=${encodeURIComponent(name.trim())}`
}

/** The wiki's editor on an existing page. */
export function wikiEditUrl(page: string): string {
  return `https://eqlwiki.com/index.php?title=${encodeURIComponent(page.trim().replace(/ /g, '_'))}&action=edit`
}

/** The wiki's upload form with the file name filled in. */
export function wikiUploadUrl(file: string): string {
  return `https://eqlwiki.com/index.php?title=Special:Upload&wpDestFile=${encodeURIComponent(file.trim())}`
}

/** The wiki's editor on a new page titled with the name, as its own red links open it (owner ask, 2026-10-18). */
export function wikiCreateUrl(name: string): string {
  return `https://eqlwiki.com/index.php?title=${encodeURIComponent(name.trim().replace(/ /g, '_'))}&action=edit&redlink=1`
}
