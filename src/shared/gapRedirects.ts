// shared/gapRedirects.ts — a name the wiki knows only through a redirect (owner, 2026-10-22:
// "redirect safeguard: if we can somehow protect against this without cause OTHER issues sure"). A
// redirect can be wrong (Halfling Blood was sent to Vial of Halfling Blood, a different item), so the
// engine files such a name as a row with `viaRedirect`, the page the redirect sends it to
// (gaps_redirects.rs). This words the check. Apart from gaps.ts, which sits at its size ceiling.

import { existingPageAction } from './gapExistingPage'
import { noticeAction } from './gapNotices'
import type { GapAction, GapRow, GapVerdict } from './gaps'

/** The redirect page itself, not where it sends you: the wiki's `redirect=no` view, to edit or replace it. */
export const redirectPageUrl = (name: string): string => `https://eqlwiki.com/index.php?title=${encodeURIComponent(name.trim().replace(/ /g, '_'))}&redirect=no`

const NOUN: Partial<Record<GapRow['domain'], string>> = { item: 'item', mob: 'mob', spell: 'spell' }

/** A redirect row's chip: check in game that the name and the page are one thing. */
export function redirectAction(row: GapRow): GapAction {
  const page = row.viaRedirect ?? ''
  const noun = NOUN[row.domain] ?? 'thing'
  return {
    kind: 'checkWiki',
    label: 'Check redirect',
    why: `The wiki sends ${row.name} to ${page}. Check it is the same ${noun} in game; if not, the redirect is wrong: replace it with a page of its own.`,
    href: redirectPageUrl(row.name)
  }
}

/**
 * The chip of a row about a page that exists and may be wrong: a notice row's, a redirect row's, or
 * one whose name the wiki has under other capitals or as free text (gapExistingPage.ts).
 */
export function pageCheckAction(row: GapRow, verdict: GapVerdict = 'unchecked'): GapAction | undefined {
  if (row.domain === 'notice') return noticeAction(row)
  return row.viaRedirect === undefined ? existingPageAction(verdict) : redirectAction(row)
}
