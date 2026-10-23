// gapQuestLive.ts — the one wiki read the Gaps tab makes: a quest page's current wikitext, when the
// player presses Copy on a Quests row (owner, 2026-10-23: "COPY does a live lookup (i'd have to go
// look it up myself anyways ...)"; one page read per click, as their own visit would be).
//
// Never on a timer, a render or a list: only the click's IPC call reaches `readQuestPage`. The shared
// wiki client (wikiClient.ts) does the request, its own queue and its own Retry-After cooldown, as the
// item and mob lookups each have theirs. `redirects` follows a redirect (the wiki's `What`s going on
// here?` lands on `What's going on here`), so the answer carries the title it landed on.
//
// At most one more read on the same click, for one of two misses the game's title makes:
//   * a title ending in `?` the wiki lacks is asked without it (task names carry one pages drop);
//   * a page that is only a link to another spelling of its title (Unfortunate news, a stub that
//     links Unfortunate News, where the walkthrough is) is followed, and the stub is named.

import { ipcMain } from 'electron'
import { IPC } from '../shared/ipc'
import { stubLinkTarget, type LiveQuestPage } from '../shared/gapQuestMerge'
import { createWikiClient } from './wikiClient'

const wiki = createWikiClient()

/** The page, or the bare title's when the asked one ends in `?` and the wiki lacks it. */
async function pageOrBare(title: string): Promise<LiveQuestPage | null> {
  const page = await wiki.fetchPage(title)
  if (page?.text !== '' || !/\?\s*$/.test(title)) return page
  const bare = await wiki.fetchPage(title.replace(/\?+\s*$/, ''))
  return (bare?.text ?? '') === '' ? page : bare
}

/** A quest page as it stands on the wiki: null when it could not be read, text '' when it has none. */
export function readQuestPage(title: string): Promise<LiveQuestPage | null> {
  return wiki.enqueue(async () => {
    const page = await pageOrBare(title)
    const target = page === null || page.text === '' ? undefined : stubLinkTarget(page.title, page.text)
    if (page === null || target === undefined) return page
    const real = await wiki.fetchPage(target)
    return real === null || real.text === '' ? page : { ...real, stubOf: page.title }
  })
}

export function registerGapQuestLiveIpc(): void {
  ipcMain.handle(IPC.gapQuestPage, (_e, title: unknown) =>
    typeof title === 'string' && title.trim() !== '' && title.length <= 200 ? readQuestPage(title.trim()) : null
  )
}
