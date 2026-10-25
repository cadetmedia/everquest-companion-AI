// The combat-activity ping reaches the meter overlays as well as the main window (perf review,
// 2026-10-20: the overlays only had their 1 s fallback poll, so they lagged the Combat tab).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../src/main/dataServer/serveDeltas.ts', import.meta.url), 'utf8')
const overlayHook = readFileSync(new URL('../src/renderer/src/overlay/useOverlayCombat.ts', import.meta.url), 'utf8')

test('every combat-activity send goes through the one fan-out, never to the main window alone', () => {
  const body = src.slice(src.indexOf('function notifyCombatActivity'))
  assert.doesNotMatch(body.slice(0, body.indexOf('\n}\n')), /sendToMain\(IPC\.onCombatActivity\)/)
  assert.equal((body.match(/sendCombatActivity\(\)/g) ?? []).length, 2, 'the leading and the trailing ping')
})

test('the fan-out names all four meter kinds, the ones useOverlayCombat serves', () => {
  for (const kind of ['fight', 'overall', 'heal-fight', 'heal-overall']) assert.match(src, new RegExp(`'${kind}'`))
  assert.match(src, /webContents\.send\(IPC\.onCombatActivity\)/)
  assert.match(overlayHook, /onCombatActivity\(/, 'the overlay hook still listens for the ping')
})
