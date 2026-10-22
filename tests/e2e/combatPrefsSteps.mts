// DRIVING THE COMBAT PREFERENCES FROM THE REAL UI (JOS-115).
//
// The You / Group / Everyone scope used to be a chip on every combat surface; it is now ONE
// preference in Preferences > Combat, read by the Combat tab, the Overview card and every floating
// overlay. That makes "set it" a two-window act rather than a click on the surface under test, so
// the door is here and every spec that needs it walks through the same one.
//
// IT CLICKS THE ACTUAL CONTROL, never `localStorage.setItem`. The write path is half the claim —
// a preference that persists but does not APPLY is the defect this ticket exists to avoid — and
// the cross-window half (the overlay hearing about it through the DOM's own 'storage' event, no
// IPC involved) can only be exercised by a real write from the main window's document.
//
// Its own module because combatSteps.mts and every e2e spec that would otherwise host it sit at
// or near the repo's max-lines budget: split, never ratchet (drill.mts set the precedent).

import type { Page } from 'playwright-core'
import { check, settle } from './appHarness.mjs'

/** The three scopes, exactly as `shared/roster.METER_SCOPES` spells them. */
export type Scope = 'you' | 'group' | 'everyone'

/** The Combat tab's read-only scope readout — a WORD, not a control, since JOS-115. */
export const SCOPE_LABEL_SEL = '[data-testid="meter-scope-label"]'
/** The control JOS-115 deleted from every combat surface. Asserted ABSENT, never used. */
export const RETIRED_SCOPE_CHIP = '[data-testid="meter-scope-chip"]'
/** …and its overlay twin. */
export const RETIRED_OVERLAY_CHIP = '[data-testid="overlay-scope-chip"]'
/**
 * The overlay header's read-only twin of SCOPE_LABEL_SEL, which JOS-115 kept in the TITLE BAR.
 * JOS-121 took it out of there; asserted ABSENT now, never read.
 */
export const RETIRED_OVERLAY_HEADER_LABEL = '[data-testid="overlay-scope-label"]'
/**
 * Where the overlay's scope word lives since JOS-121: understated background text on the METER
 * PANEL FLOOR (src/renderer/src/overlay/scopeFloor.tsx), out of the title bar so the fight
 * selector and the drag surface can have that width. Same sentence, same `chipLabel` helper.
 */
export const OVERLAY_SCOPE_FLOOR = '[data-testid="overlay-scope-floor"]'

/**
 * Set the meter scope through Preferences > Combat and return the app to `back`.
 *
 * `back` is a nav testid rather than "wherever we were": a caller always knows which surface it
 * is about to assert on, and guessing would leave the app somewhere the next step did not expect.
 */
export async function setMeterScope(page: Page, scope: Scope, back: string): Promise<void> {
  await page.click('[data-testid="nav-preferences"]', { timeout: 30_000 })
  await page.waitForSelector('[data-testid="prefs-rail-combat"]', { timeout: 20_000 })
  await page.click('[data-testid="prefs-rail-combat"]')
  const button = `[data-testid="pref-meter-scope-${scope}"]`
  await page.waitForSelector(button, { timeout: 20_000 })
  await page.click(button)
  // The CONDITION the click produces: MUI marks the chosen ToggleButton selected, and that is the
  // control agreeing it took the value — never a sleep.
  await settle(
    async () => (await page.$$(`${button}.Mui-selected`)).length,
    (n) => n === 1,
    { timeoutMs: 8_000 }
  )
  await page.click(`[data-testid="${back}"]`, { timeout: 30_000 })
}

/** The three pet layouts, exactly as `features/combat/combatPrefs.PET_LAYOUTS` spells them. */
export type PetLayout = 'nested' | 'separate' | 'grouped'

/**
 * Choose a PET LAYOUT through Preferences > Combat ('Where your pet's damage shows'), and return to
 * `back`. Clicks the control, as the scope step does, and waits for MUI to mark it selected.
 * Returns whether the control agreed.
 */
export async function setPetLayout(page: Page, layout: PetLayout, back: string): Promise<boolean> {
  await page.click('[data-testid="nav-preferences"]', { timeout: 30_000 })
  await page.waitForSelector('[data-testid="prefs-rail-combat"]', { timeout: 20_000 })
  await page.click('[data-testid="prefs-rail-combat"]')
  const button = `[data-testid="pref-pet-layout-${layout}"]`
  await page.waitForSelector(button, { timeout: 20_000 })
  if ((await page.$$(`${button}.Mui-selected`)).length === 0) await page.click(button, { timeout: 15_000 })
  const n = await settle(
    async () => (await page.$$(`${button}.Mui-selected`)).length,
    (v) => v === 1,
    { timeoutMs: 8_000 }
  )
  // The example meter under the control redraws for the choice (owner, 2026-10-21): its sample is
  // Kyle, you and your pet, so nested draws 2 bars, separate 3, and grouped 2 rows of 3 lines.
  const want = PREVIEW_SHAPE[layout]
  const got = await settle(() => previewShape(page), (s) => s === want, { timeoutMs: 8_000 })
  check(`the example under the pet layout control shows the ${layout} layout`, got === want, `${got}, want ${want}`)
  // Its grouped rows are a lone row (Kyle) over a pair: the case where the two box shapes must line up.
  if (layout === 'grouped') await checkBoxColumn(page, 'the Preferences example', '[data-testid="pref-pet-layout-preview"] ')
  await page.click(`[data-testid="${back}"]`, { timeout: 30_000 })
  return n === 1
}

/** Every total box's left edge and width, and its text's width (a Range over the box's contents). */
interface BoxColumn {
  lefts: number[]
  widths: number[]
  texts: number[]
}

/**
 * THE BOX COLUMN of the grouped layout (Malkil, 2026-10-21: the fixed box was "much wider than it
 * needs to be"). The boxes under `within` line up in one column, and the column is the widest box's
 * text plus its padding (6 px a side), or the 48 px floor, and no wider.
 */
export async function checkBoxColumn(page: Page, where: string, within = ''): Promise<void> {
  const col = await page.$$eval(`${within}[data-testid="meter-group-total"]`, (boxes) => {
    const out: BoxColumn = { lefts: [], widths: [], texts: [] }
    for (const b of boxes) {
      const r = b.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(b)
      out.lefts.push(Math.round(r.left))
      out.widths.push(Math.round(r.width))
      out.texts.push(range.getBoundingClientRect().width)
    }
    return out
  })
  if (col.widths.length === 0) return
  const fit = Math.max(48, Math.max(...col.texts) + 12)
  const aligned = new Set(col.lefts).size === 1 && new Set(col.widths).size === 1
  check(`every total box on ${where} sits in one column`, aligned, JSON.stringify(col))
  check(`the box column on ${where} is as wide as its widest total needs`, Math.abs(col.widths[0] - fit) <= 2, `${String(col.widths[0])} px, text needs ${fit.toFixed(1)}`)
}

const PREVIEW_SHAPE: Record<PetLayout, string> ={ nested: 'bars 2', separate: 'bars 3', grouped: 'rows 2 lines 3' }

/** What the example meter in Preferences draws: plain bars, or grouped rows and their lines. */
function previewShape(page: Page): Promise<string> {
  return page.$eval('[data-testid="pref-pet-layout-preview"]', (el) => {
    const rows = el.querySelectorAll('[data-testid="meter-group-row"]').length
    if (rows > 0) return `rows ${String(rows)} lines ${String(el.querySelectorAll('[data-testid="meter-group-line"]').length)}`
    return `bars ${String(el.querySelectorAll('[data-testid="meter-row"]').length)}`
  })
}

/**
 * Turn the PET NESTING preference on or off through Preferences > Combat, and return to `back`.
 * On is the 'Inside your bar' layout, off is 'Its own bar' (the switch became a three-way choice).
 *
 * The same two-window act as the scope above, and for the same reason it CLICKS THE CONTROL: this
 * preference reaches four surfaces through localStorage plus the DOM's own 'storage' event, and a
 * `setItem` from the test would exercise none of that path. It is also the exact route JOS-170's
 * owner took — flip it in Preferences, come back to a Combat tab that has meanwhile unmounted and
 * re-hydrated its drill — which is what makes the number's staleness observable at all.
 *
 * Idempotent: asking for the state it is already in clicks nothing and still waits for the
 * control to agree, so a caller may state what it wants rather than track what it did.
 */
export async function setCombinePet(page: Page, on: boolean, back: string): Promise<boolean> {
  return setPetLayout(page, on ? 'nested' : 'separate', back)
}

/**
 * Which scope Preferences shows as CHOSEN, read from the control itself and not from the store,
 * then back to `back`. On a fresh profile this is the answer to "does an absent key resolve to
 * Everyone" (JOS-229) — the half of the default the meters' own wording cannot carry, because a
 * meter reading `Everyone` looks identical whether the user picked it or never opened this tab,
 * and only one of those is what a fresh-state default claims.
 */
export async function scopeFromPrefs(page: Page, back: string): Promise<string> {
  await page.click('[data-testid="nav-preferences"]', { timeout: 30_000 })
  await page.waitForSelector('[data-testid="prefs-rail-combat"]', { timeout: 20_000 })
  await page.click('[data-testid="prefs-rail-combat"]')
  await page.waitForSelector('[data-testid="pref-meter-scope"]', { timeout: 20_000 })
  const chosen = await settle(
    () =>
      page.evaluate(() => {
        const on = document.querySelector('[data-testid="pref-meter-scope"] .Mui-selected')
        return on?.getAttribute('data-testid')?.replace('pref-meter-scope-', '') ?? ''
      }),
    (v) => v !== '',
    { timeoutMs: 8_000 }
  )
  await page.click(`[data-testid="${back}"]`, { timeout: 30_000 })
  return chosen
}
