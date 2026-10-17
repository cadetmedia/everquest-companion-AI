// "Reset overlay positions" (shared/overlayReset.ts): what the patch resets and keeps, and the
// localStorage sweep the menu runs while the overlays are closed.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { clearOverlayLocalKeys, overlayResetPatch, resetKinds } from '../src/shared/overlayReset'
import { OVERLAY_KINDS } from '../src/shared/types'
import type { OverlayConfig } from '../src/shared/types'

test('the patch drops the stored rectangle and takes the kind default lock and alpha', () => {
  const def: OverlayConfig = { open: true, locked: true, bgAlpha: 0.72, bounds: undefined, drill: null }
  const patch = overlayResetPatch(def)
  assert.ok('bounds' in patch, 'bounds must be in the patch, so the merge overwrites the stored one')
  assert.equal(patch.bounds, undefined)
  assert.equal(patch.locked, true)
  assert.equal(patch.bgAlpha, 0.72)
  assert.equal(patch.textScale, 1)
  assert.equal(patch.drill, null)
})

test('the patch never touches whether a window is open or what it shows', () => {
  const patch = overlayResetPatch({ open: false, locked: false, bgAlpha: 0.72, drill: null })
  for (const k of ['open', 'toast', 'alertBanner', 'conCard', 'xpRows', 'xpSlice']) {
    assert.ok(!(k in patch), `${k} is a choice, not a lost window`)
  }
})

function fakeStorage(init: Record<string, string>) {
  const m = new Map(Object.entries(init))
  return {
    get length() {
      return m.size
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => {
      m.delete(k)
    },
    keys: () => [...m.keys()].sort()
  }
}

test('the sweep removes only keys under the given prefixes', () => {
  const s = fakeStorage({ 'eq.pins.a': '1', 'eq.pins.b': '2', 'eq.maps.track': 'x', other: 'y' })
  assert.equal(clearOverlayLocalKeys(s, ['eq.pins.']), 2)
  assert.deepEqual(s.keys(), ['eq.maps.track', 'other'])
})

test('a reset names one overlay, several, or (named none) all of them, and never an unknown kind', () => {
  assert.deepEqual(resetKinds(['xp']), ['xp'])
  assert.deepEqual(resetKinds(['respawn', 'nonsense', 'fight']), ['fight', 'respawn'])
  assert.deepEqual(resetKinds(undefined), OVERLAY_KINDS)
  assert.deepEqual(resetKinds('xp'), OVERLAY_KINDS)
})

test('the main process closes the reset overlays before it writes the reset', () => {
  const src = readFileSync(new URL('../src/main/overlayReset.ts', import.meta.url), 'utf8')
  assert.ok(src.indexOf('await Promise.all(open.map(closeAndWait))') < src.indexOf('setOverlayConfig(kind'))
})

test('a reset button only asks: the reset runs from the popup Reset button and nowhere else', () => {
  const src = readFileSync(new URL('../src/renderer/src/components/OverlayResetDialog.tsx', import.meta.url), 'utf8')
  assert.equal(src.match(/runReset\(/g)?.length, 2, 'declared once, called once')
  assert.match(src, /confirm: \(\) => \{\s+if \(pending != null\) void runReset\(pending\)/)
  const bar = readFileSync(new URL('../src/renderer/src/components/TitleBar.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(bar, /runReset|resetOverlays\(/, 'the menu rows never reset directly')
})

test('a reset tells the app window the per-overlay sizes and alphas, pane open or not', () => {
  const ipc = readFileSync(new URL('../src/main/ipc/windowControls.ts', import.meta.url), 'utf8')
  const handler = ipc.slice(ipc.indexOf('IPC.overlayReset'), ipc.indexOf('IPC.overlayGetConfig'))
  assert.match(handler, /broadcastOverlayTextScales\(\)/)
  assert.match(handler, /broadcastOverlayBgAlphas\(\)/)
  // Preferences is unmounted while another view shows; App.tsx keeps its warm snapshot current.
  const app = readFileSync(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /onOverlayTextScales\(\(m\) => \{\s+recordPref\('overlayTextScales', m\)/)
  assert.match(app, /onOverlayBgAlphas\(\(m\) => \{\s+recordPref\('overlayBgAlphas', m\)/)
})
