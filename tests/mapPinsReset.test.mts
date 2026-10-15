// The Map pins overlay and "Reset overlay positions" (shared/overlayReset.ts), and the Auto-hide
// trap a tester hit on 2026-10-14: hidden while unlocked, the overlay drew no chip to turn it off.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { OVERLAY_LOCAL_KEY_PREFIXES } from '../src/shared/overlayReset'

const dir = new URL('../src/renderer/src/overlay/', import.meta.url)

test('every localStorage key the overlay windows define is cleared by the Map pins reset', () => {
  const keys: string[] = []
  for (const f of readdirSync(dir)) {
    const src = readFileSync(new URL(f, dir), 'utf8')
    for (const m of src.matchAll(/const \w*KEY\w* = '(eq\.[^']+)'/g)) keys.push(m[1])
  }
  assert.ok(keys.length >= 4, `found ${keys.join(', ')}`)
  for (const k of keys) {
    assert.ok((OVERLAY_LOCAL_KEY_PREFIXES.mapPins ?? []).some((p) => k.startsWith(p)), `${k} survives a reset`)
  }
})

test('Auto-hide hides the Map pins overlay only while it is pinned', () => {
  const src = readFileSync(new URL('MapPinsOverlay.tsx', dir), 'utf8')
  assert.match(src, /const hidden = locked && follow && gameMap === false/)
})
