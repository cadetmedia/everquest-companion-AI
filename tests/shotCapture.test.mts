// Capturing from the game, the half that needs no Electron (phase 3 of screenshot to wiki; owner,
// 2026-10-21): finding an item window in a capture of the whole game window by its yellow tab label
// (src/main/shot/findWindow.ts), reading it (captureRead.ts), filing it on a row (itemShotKeep.ts
// captureRow), and what starts a capture (shared/shotTrigger.ts: the macro's log line, the debounce;
// owner: "i like the macro log thing ... avoid C", C a system-wide hotkey). The captures are built from the owner's
// and Malkil's window screenshots set into a noisy scene with yellow that is not a tab; the owner's
// ruling (D4: "we can not force users to use a specific UI scale") is tested with a window resized
// by a non-whole factor.

import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readCapture } from '../src/main/shot/captureRead.ts'
import { tabLabels, windowAround } from '../src/main/shot/findWindow.ts'
import { stopOcr } from '../src/main/shot/ocr.ts'
import type { Rgba } from '../src/main/shot/pixels.ts'
import { readItemShot, type ShotReaders } from '../src/main/shot/readItemShot.ts'
import { captureRow } from '../src/shared/itemShotKeep.ts'
import { captureChannel, captureGate, captureHowTo, channelNumbers, isCaptureLine, RECENT_MS } from '../src/shared/shotTrigger.ts'
import { readPng } from './shotPng.mts'

const SHOTS = join(import.meta.dirname, 'fixtures', 'shots')
const textOnly: ShotReaders = { index: () => Promise.resolve(null), cell: () => null, textures: () => [] }
after(() => stopOcr())

/** The window resized by `k` (bilinear), as a UI scale that is not a whole number draws it. */
function scaled(img: Rgba, k: number): Rgba {
  const w = Math.round(img.w * k)
  const h = Math.round(img.h * k)
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [sx, sy] = [Math.min(img.w - 1.001, x / k), Math.min(img.h - 1.001, y / k)]
      const [x0, y0] = [Math.floor(sx), Math.floor(sy)]
      const [fx, fy] = [sx - x0, sy - y0]
      for (let c = 0; c < 4; c++) {
        const at = (xx: number, yy: number): number => img.data[(yy * img.w + xx) * 4 + c]
        const v = (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy
        data[(y * w + x) * 4 + c] = Math.round(v)
      }
    }
  }
  return { w, h, data }
}

/** A 1600x1000 capture: a noisy scene, a yellow gauge and a yellow word, the window at (ox, oy). */
function capture(win: Rgba, ox: number, oy: number): Rgba {
  const W = 1600
  const H = 1000
  const data = new Uint8Array(W * H * 4)
  let seed = 7
  const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < W * H; i++) {
    const v = 40 + 60 * rnd() + 40 * Math.sin(i / 9000)
    data.set([v, v * 0.9, v * 0.8, 255], i * 4)
  }
  const paint = (x0: number, y0: number, w: number, h: number): void => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) data.set([230, 200, 20, 255], (y * W + x) * 4)
  }
  paint(100, 20, 300, 12) // an experience bar
  paint(100, 900, 70, 11) // a yellow chat word about a tab's shape
  for (let y = 0; y < win.h; y++) data.set(win.data.subarray(y * win.w * 4, (y + 1) * win.w * 4), ((y + oy) * W + ox) * 4)
  return { w: W, h: H, data }
}

// The box may stop at the pane inside the frame (a few pixels in): the text is all inside the pane.
const inside = (box: { x: number; y: number; w: number; h: number }, { x, y, w, h }: { x: number; y: number; w: number; h: number }): boolean =>
  box.x <= x + 20 && box.y <= y + 4 && box.x + box.w >= x + w - 20 && box.y + box.h >= y + h - 24

for (const [file, k] of [['vial-of-swamp-water.png', 1], ['surefall-fletching-kit.png', 1], ['vial-of-swamp-water.png', 1.37]] as const) {
  test(`AUTO-FIND: ${file} AT ${String(k)}x IS FOUND BY ITS TAB LABEL AND READS AS THE SNIP DOES`, async () => {
    const win = k === 1 ? readPng(join(SHOTS, file)) : scaled(readPng(join(SHOTS, file)), k)
    const img = capture(win, 640, 120)
    const label = tabLabels(img).find((l) => l.x > 640)
    assert.ok(label !== undefined, JSON.stringify(tabLabels(img)))
    const box = windowAround(img, label)
    assert.ok(box !== null && inside(box, { x: 640, y: 120, w: win.w, h: win.h }), `${JSON.stringify(box)} for ${String(win.w)}x${String(win.h)}`)
    const got = await readCapture(img, textOnly)
    const want = await readItemShot(win, textOnly)
    assert.equal(got.reply?.read.statsblock, want.read.statsblock)
  })
}

test("TWO ITEM WINDOWS SIDE BY SIDE (THE OWNER'S, 2026-10-21) ARE TWO READINGS, EACH ONLY ITS OWN LINES", async () => {
  const got = await readCapture(readPng(join(SHOTS, 'mud-stained-tunic-and-rusty-axe.png')), textOnly)
  assert.deepEqual(got.windows.map((w) => w.reply.read.name), ['Mud Stained Skin Tunic', 'Rusty Battle Axe'])
  const block = (i: number): string[] => got.windows[i].reply.read.statsblock.split('\n').filter(Boolean)
  assert.deepEqual(block(0), ['Lore Equipped, No Trade<br>', 'Slot: CHEST<br>', 'AC: 4<br>', 'Size: MEDIUM WT: 1.6<br>', 'Class: WAR<br>', 'Race: ALL<br>'])
  // The Legends lines (Base Dmg, Delay, Ratio, Tier, Modified, Ornamentation) map or stay out.
  assert.deepEqual(block(1), [
    'No Trade, Placeable<br>',
    'Slot: PRIMARY SECONDARY<br>',
    'Skill: 1H Slashing  Atk Delay: 42<br>',
    'DMG: 6<br>',
    'Size: MEDIUM WT: 8.5<br>',
    'Class: WAR PAL RNG SHD BRD ROG<br>',
    'Race: ALL<br>'
  ])
  assert.equal(got.windows[0].reply.read.loreTab, true)
})

test('A CAPTURE WITH NO ITEM WINDOW FINDS NONE (THE PLAYER IS SENT TO THE SNIP, NEVER TO A GAME SETTING)', async () => {
  const got = await readCapture(capture({ w: 1, h: 1, data: new Uint8Array(4) }, 0, 0), textOnly)
  assert.equal(got.reply, undefined)
})

test('A CAPTURE IS FILED ON THE ONE ROW ITS NAME MATCHES; NONE WHEN NO ROW OR SEVERAL DO', () => {
  const rows = ['Black Lizard Scale', 'Vial of Swamp Water', 'Ruined Robe']
  assert.equal(captureRow('BlackLizard Scale', rows), 'Black Lizard Scale')
  assert.equal(captureRow('Vial of Swamp Water', rows), 'Vial of Swamp Water')
  assert.equal(captureRow('Windstriker', rows), undefined)
  assert.equal(captureRow('Robe A', ['Robe B', 'Robe C']), undefined)
  assert.equal(captureRow(undefined, rows), undefined)
})

test("THE MACRO LINE: THE PLAYER'S OWN LINE ON AN EQC CHANNEL, ANY CASE; NO OTHER SPEAKER, NO PUBLIC SAY (THE OWNER'S LOG, 2026-10-21)", () => {
  // The owner's log, eqlog_Drywrought_oggok.txt: after /join eqckaltinril, the macro's line.
  assert.equal(isCaptureLine("[Wed Oct 21 19:24:38 2026] You tell eqckaltinril:2, 'eqc capture'"), true)
  assert.equal(isCaptureLine("[Wed Oct 21 19:24:38 2026] You tell eqckaltinril:2, 'EQC Capture'"), true)
  assert.equal(isCaptureLine("[Wed Oct 21 19:24:38 2026] You tell eqcdrywrought:11, 'eqc capture' "), true)
  const ts = '[Wed Oct 21 19:24:38 2026] '
  for (const line of [
    // another player on the same channel: their line starts with their name
    "Bob tells eqckaltinril:2, 'eqc capture'",
    // public, or no text at all
    "You say, 'eqc capture'",
    'Talking to yourself again?',
    // another channel, another phrase
    "You tell general:1, 'eqc capture'",
    "You tell eqckaltinril:2, 'eqc capture now'",
    "Bob tells you, 'eqc capture'",
    'eqc capture'
  ]) {
    assert.equal(isCaptureLine(ts + line), false, line)
  }
  assert.equal(isCaptureLine("You tell eqckaltinril:2, 'eqc capture'"), false)
})

test("THE CHANNEL'S NUMBER FROM THE LATEST CHANNELS LINE, AND THE MACRO THE PLAYER IS SHOWN", () => {
  assert.equal(captureChannel('Kaltinril'), 'eqckaltinril')
  const channels = channelNumbers('[Wed Oct 21 19:24:18 2026] Channels: 1=General(214), 2=eqckaltinril(1)')
  assert.deepEqual(channels, { general: 1, eqckaltinril: 2 })
  assert.equal(channelNumbers("[Wed Oct 21 19:24:38 2026] You tell eqckaltinril:2, 'eqc capture'"), null)
  assert.deepEqual(captureHowTo('Kaltinril', channels ?? {}), {
    join: '/join eqckaltinril',
    macro: '/2 eqc capture',
    text: 'Type /join eqckaltinril once, then make a social macro: /2 eqc capture'
  })
  // No Channels line seen yet: the shape, and where the number comes from.
  const unknown = captureHowTo('Kaltinril', {})
  assert.equal(unknown.macro, undefined)
  assert.match(unknown.text, /^Type \/join eqckaltinril once, then make a social macro: \/<channel number> eqc capture\. The number is eqckaltinril's in the Channels: line/)
  assert.equal(captureHowTo(null, {}).join, '/join eqc<yourname>')
})

test('THE GATE: PRESSES WITHIN THE DEBOUNCE ARE ONE; AN OLD MARKER LINE NEVER CAPTURES', () => {
  const gate = captureGate(1500)
  const t = 1_800_000_000_000
  assert.equal(gate(t, t - 2000), true)
  assert.equal(gate(t + 1000, t + 1000), false)
  assert.equal(gate(t + 1600), true)
  // A line from before the clock's window (a replayed or late line) is refused, and spends nothing.
  assert.equal(gate(t + 10_000, t + 10_000 - RECENT_MS - 1), false)
  assert.equal(gate(t + 10_001, t + 10_000), true)
  // A line stamped ahead of the clock by more than the window is refused too.
  assert.equal(gate(t + 20_000, t + 20_000 + RECENT_MS + 1), false)
})

test('NO SYSTEM-WIDE KEY: the app registers no globalShortcut (owner, 2026-10-21: "avoid C")', () => {
  const under = (dir: URL): URL[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? under(new URL(`${e.name}/`, dir)) : /\.tsx?$/.test(e.name) ? [new URL(e.name, dir)] : []
    )
  for (const dir of ['main', 'preload', 'renderer', 'shared']) {
    for (const file of under(new URL(`../src/${dir}/`, import.meta.url))) {
      // Comments may say what was removed and why; code may not use it.
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
      assert.equal(/\bglobalShortcut\b/.test(code), false, file.pathname)
    }
  }
})

test('the camera sits on the Event log overlay and the Wiki Gaps overlay (owner, 2026-10-21: "sure it can be on wiki gaps, overlay")', () => {
  for (const name of ['EventLogOverlay.tsx', 'GapsOverlay.tsx']) {
    const code = readFileSync(new URL(`../src/renderer/src/overlay/${name}`, import.meta.url), 'utf8')
    assert.match(code, /action=\{SHOT_CAPTURE_ACTION\}/, name)
  }
})
