// gapQuestLive.ts — the one wiki read the Gaps tab makes: a quest page's current wikitext, when the
// player presses Copy on a Quests row (owner, 2026-10-23: "COPY does a live lookup (i'd have to go
// look it up myself anyways ...)"; one page read per click, as their own visit would be).
//
// Never on a timer, a render or a list: only the click's IPC call reaches `readQuestPage`. Serialized,
// one request at a time, and a 429/5xx silences it until the server's Retry-After, the same contract
// mobLookup.ts honours. `action=parse` with `redirects` follows a redirect (the wiki's `What`s going
// on here?` lands on `What's going on here`), so the answer carries the title it landed on.

import { ipcMain } from 'electron'
import { IPC } from '../shared/ipc'
import type { LiveQuestPage } from '../shared/gapQuestMerge'

const API = 'https://eqlwiki.com/api.php'
const UA = 'everquest-companion (github.com/kaltinril/everquest-companion)'
const TIMEOUT_MS = 8000
const RETRY_AFTER_FALLBACK_MS = 60_000

let cooldownUntil = 0
let queue: Promise<unknown> = Promise.resolve()

interface ParseAnswer {
  parse?: { title?: string; wikitext?: string }
  error?: { code?: string }
}

/** The answer's page: `{ text: '' }` for a page the wiki lacks, null for any other error. */
function pageOf(j: ParseAnswer, title: string): LiveQuestPage | null {
  if (j.error?.code === 'missingtitle') return { title, text: '' }
  if (j.error !== undefined) return null
  return { title: j.parse?.title ?? title, text: j.parse?.wikitext ?? '' }
}

/** A 429 or 5xx: quiet until the server's Retry-After. */
function coolDown(res: Response): void {
  const after = Number(res.headers.get('retry-after'))
  cooldownUntil = Date.now() + (Number.isFinite(after) && after > 0 ? after * 1000 : RETRY_AFTER_FALLBACK_MS)
}

/** One `action=parse` read: the page, `{ text: '' }` when the wiki has none, null when it could not be read. */
async function parsePage(title: string): Promise<LiveQuestPage | null> {
  if (Date.now() < cooldownUntil) return null
  const url = `${API}?${new URLSearchParams({ action: 'parse', page: title, prop: 'wikitext', redirects: '1', format: 'json', formatversion: '2' }).toString()}`
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal })
    if (res.status === 429 || res.status >= 500) {
      coolDown(res)
      return null
    }
    return res.ok ? pageOf((await res.json()) as ParseAnswer, title) : null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

/**
 * A quest page as it stands on the wiki. A title the wiki lacks with a trailing `?` is asked once more
 * without it, since the game's task names carry one its pages often drop (`questTitleKey`).
 */
export function readQuestPage(title: string): Promise<LiveQuestPage | null> {
  const run = async (): Promise<LiveQuestPage | null> => {
    const page = await parsePage(title)
    if (page?.text !== '' || !/\?\s*$/.test(title)) return page
    const bare = await parsePage(title.replace(/\?+\s*$/, ''))
    return (bare?.text ?? '') === '' ? page : bare
  }
  const next = queue.then(run, run)
  queue = next.catch(() => undefined)
  return next
}

export function registerGapQuestLiveIpc(): void {
  ipcMain.handle(IPC.gapQuestPage, (_e, title: unknown) =>
    typeof title === 'string' && title.trim() !== '' && title.length <= 200 ? readQuestPage(title.trim()) : null
  )
}
