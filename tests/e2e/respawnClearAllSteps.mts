// respawnClearAllSteps — CLEAR ALL, AND THE TYPED NUMBER THAT OUTLIVES ITS WATCH (owner ruling,
// 2026-10-17).
//
// Its own module for the reason the round 7-9 steps are: the spec that uses it
// (`respawn-timers.e2e.mts`) is at the repo's 400-code-line factoring ceiling, and this step needs no
// second renderer.
//
// WHAT ONLY THE REAL APP CAN SHOW. The writes are pinned in tests/respawnWatchList.test.mts; what
// they cannot claim is that the tab's button sends the keys its scope SHOWS, that the dialog asks
// before anything moves and Cancel moves nothing, that one confirm takes every clock off the page,
// and that the respawn typed on one of those mobs is in MAIN'S store afterwards and comes back on
// the next Watch — which crosses the renderer, two IPC doors, the store and the engine push.
//
// IT RUNS LAST: it empties the watch list, and nothing after it needs one.
//
// WAIT FOR THE CONDITION, NEVER FOR THE CLOCK (wave E3): every read goes through `settle`.

import type { Page } from 'playwright-core'
import { check, settle } from './appHarness.mjs'

interface RowRead {
  mob: string
  source: string
}

function rows(page: Page): Promise<RowRead[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="respawn-row"]')].map((e) => ({
      mob: e.getAttribute('data-respawn-mob') ?? '',
      source: e.getAttribute('data-respawn-source') ?? ''
    }))
  )
}

interface Stored {
  watches: { key: string; customSec?: number }[]
  keptCustom?: { key: string; customSec: number }[]
}

interface Bridge {
  eq: {
    getRespawn: () => Promise<Stored>
    setRespawnCustom: (key: string, display: string, sec: number | null) => Promise<boolean>
  }
}

const stored = (page: Page): Promise<Stored> =>
  page.evaluate(() => (window as unknown as Bridge).eq.getRespawn())

/** A number nothing else in the spec types, so finding it proves where it came from. */
const TYPED_SEC = 1234

async function clickAway(page: Page, selector: string): Promise<void> {
  await page.click(selector, { timeout: 15_000 })
  await page.mouse.move(0, 0)
}

/** Clear all's dialog, opened: its text, or '' when it did not open. */
async function openClearAll(page: Page): Promise<string> {
  await clickAway(page, '[data-testid="respawn-clear-all"]')
  return settle(
    () => page.evaluate(() => (document.querySelector('[data-testid="respawn-clear-all-dialog"]') as HTMLElement | null)?.innerText ?? ''),
    (t) => t.length > 0,
    { timeoutMs: 15_000 }
  )
}

export async function stepClearAll(page: Page): Promise<void> {
  await clickAway(page, '[data-testid="respawn-scope-all"]')
  const before = await settle(() => rows(page), (r) => r.length > 0, { timeoutMs: 20_000 })
  if (!check('Clear all has clocks to clear in the all-zones view', before.length > 0, JSON.stringify(before))) return
  const mob = before[0]?.mob ?? ''

  // A TYPED NUMBER ON ONE OF THEM, through the edit modal's own door.
  await page.evaluate(
    ([k, s]) => (window as unknown as Bridge).eq.setRespawnCustom(k, k, s),
    [mob, TYPED_SEC] as [string, number]
  )
  const typed = await settle(() => rows(page), (r) => r.find((x) => x.mob === mob)?.source === 'custom', { timeoutMs: 20_000 })
  check('…one of them carrying a respawn the player typed', typed.find((x) => x.mob === mob)?.source === 'custom', JSON.stringify(typed))

  // IT ASKS FIRST, AND CANCEL MOVES NOTHING.
  const asked = await openClearAll(page)
  check('Clear all asks first, stating the count and the scope', asked.includes(`Clear all ${String(before.length)} clock`) && asked.includes('all zones'), asked)
  await clickAway(page, '[data-testid="respawn-clear-all-cancel"]')
  const kept = await settle(() => rows(page), (r) => r.length === before.length, { timeoutMs: 10_000 })
  check('…and Cancel clears nothing', kept.length === before.length, JSON.stringify(kept))

  // CONFIRM: every clock goes, in one press.
  await openClearAll(page)
  await clickAway(page, '[data-testid="respawn-clear-all-confirm"]')
  const gone = await settle(() => rows(page), (r) => r.length === 0, { timeoutMs: 30_000 })
  check('confirming takes every clock in scope off the tab', gone.length === 0, JSON.stringify(gone))
  const after = await stored(page)
  check('…and out of the store', after.watches.length === 0, JSON.stringify(after))
  check(
    '…while the typed respawn is kept aside in the store',
    after.keptCustom?.some((k) => k.key === mob && k.customSec === TYPED_SEC) === true,
    JSON.stringify(after)
  )
  check(
    '…and the button has nothing left to clear',
    await page.evaluate(() => (document.querySelector('[data-testid="respawn-clear-all"]') as HTMLButtonElement | null)?.disabled === true)
  )

  // WATCH IT AGAIN, AND THE NUMBER IS BACK.
  await clickAway(page, `[data-testid="respawn-candidate"][data-respawn-mob="${mob}"] [data-testid="respawn-watch"]`)
  const back = await settle(() => rows(page), (r) => r.find((x) => x.mob === mob) !== undefined, { timeoutMs: 30_000 })
  check('watching it again brings back the clock numbered by the typed respawn', back.find((x) => x.mob === mob)?.source === 'custom', JSON.stringify(back))
  check(
    '…the same number, from the store',
    (await stored(page)).watches.some((w) => w.key === mob && w.customSec === TYPED_SEC)
  )
}
