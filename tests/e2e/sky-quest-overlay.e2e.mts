/**
 * Headless Electron spec for the SKY QUEST OVERLAY and the Sky tab's "Favorite all shown" checkbox
 * (sky-quest-overlay, owner ask 2026-10-16).
 *
 * WHAT ONLY THE REAL APP CAN SHOW. The payload's order and parsing are pinned in
 * tests/skyQuestOverlay.test.mts. What none of that can claim is the wiring: that the window opens
 * as its own `?kind=skyQuests` window, that a star set on the Sky tab of the MAIN window reaches the
 * OVERLAY window through the storage the two share, and that the checkbox stars exactly the quests
 * the filtered list shows.
 *
 * Run: `npm run test:e2e -- sky-quest-overlay` (or node --import tsx this file).
 */
import type { ElectronApplication, Page } from 'playwright-core'
import { buildIfStale, check, countOf, dumpArtifacts, failures, reportRun, settle, settleGone } from './appHarness.mjs'
import { mainWindow, overlayWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'

const NAV_SKY = '[data-testid="nav-posky"]'
const COUNTS = '[data-testid="posky-counts"]'
const SEARCH = '[data-testid="posky-search"] input'
const FAV_ALL = '[data-testid="posky-favorite-all"]'
const QUEST_ROW = '[data-testid="posky-quest-row"]'
const OVERLAY = '[data-testid="sky-overlay"]'
const OVERLAY_ROW = '[data-testid="sky-overlay-row"]'
const OVERLAY_EMPTY = '[data-testid="sky-overlay-empty"]'
/** One quest by its name: Bard Test of Tone, whose reward is Mask of Song (posky.json). */
const QUEST = 'Bard Test of Tone'
const REWARD = 'Mask of Song'

interface OverlayBridge {
  toggleOverlay: (k: string) => Promise<boolean>
}

async function dismissFirstRunNotice(page: Page): Promise<void> {
  const notice = '[data-testid="telemetry-notice"]'
  await page.waitForSelector(notice, { timeout: 30_000 }).catch(() => undefined)
  if ((await countOf(page, notice)) === 0) return
  await page.click('[data-testid="telemetry-notice-off"]')
  await settleGone(page, notice, { timeoutMs: 8_000 })
}

const text = (p: Page, sel: string): Promise<string> =>
  p.$eval(sel, (el) => el.textContent ?? '').catch(() => '')

async function stepOpen(page: Page, app: ElectronApplication): Promise<Page | null> {
  await page.evaluate(() => (window as unknown as { eq: OverlayBridge }).eq.toggleOverlay('skyQuests'))
  const overlay = await overlayWindow(app, 'skyQuests')
  check('the Overlay menu opens a ?kind=skyQuests window', overlay !== null)
  if (!overlay) return null
  const mounted = await settle(() => countOf(overlay, OVERLAY), (n) => n === 1, { timeoutMs: 20_000 })
  check('the window draws the Sky quest overlay', mounted === 1)
  const empty = await settle(() => text(overlay, OVERLAY_EMPTY), (t) => t.includes('No starred quests'), {
    timeoutMs: 30_000
  })
  check('with nothing starred it says how to add a quest', empty.includes('No starred quests'), empty)
  return overlay
}

async function stepFavoriteFiltered(page: Page, overlay: Page): Promise<void> {
  await page.click(NAV_SKY, { timeout: 30_000 })
  await page.waitForSelector(COUNTS, { timeout: 60_000 })
  await page.fill(SEARCH, QUEST)
  const shown = await settle(() => countOf(page, QUEST_ROW), (n) => n >= 1 && n < 10, { timeoutMs: 15_000 })
  check('the search narrows the list', shown >= 1 && shown < 10, `${String(shown)} rows`)
  await page.click(`${FAV_ALL} input`)
  const rows = await settle(() => countOf(overlay, OVERLAY_ROW), (n) => n === shown, { timeoutMs: 15_000 })
  check('"Favorite all shown" stars exactly the filtered quests, and the overlay lists them', rows === shown, `${String(rows)} overlay rows for ${String(shown)} shown`)
  const line = await text(overlay, OVERLAY_ROW)
  check('a row names the reward and the turn-in NPC', line.includes(REWARD) && line.includes('Cilin Spellsinger'), line)
  await page.click(`${FAV_ALL} input`)
  const gone = await settle(() => countOf(overlay, OVERLAY_ROW), (n) => n === 0, { timeoutMs: 15_000 })
  check('clicked again with every shown quest starred, it unstars them all', gone === 0, `${String(gone)} rows left`)
  await page.fill(SEARCH, '')
}

async function main(): Promise<void> {
  buildIfStale()
  const { app, close } = await launchOnFixture('e2e-leveling.log')
  const page = await mainWindow(app)
  const consoleErrors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  try {
    await dismissFirstRunNotice(page)
    const overlay = await stepOpen(page, app)
    if (overlay) {
      overlay.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push(`sky overlay: ${m.text()}`)
      })
      await stepFavoriteFiltered(page, overlay)
    }
    check('no renderer console errors in either window', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
  } catch (err) {
    check('the spec ran to completion', false, String(err))
  } finally {
    if (failures.length > 0) await dumpArtifacts(page, 'sky-quest-overlay')
    await close()
  }
  reportRun()
}

void main()
