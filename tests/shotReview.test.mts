// The 2026-10-21 pre-release review of screenshot to wiki: a failed save answers instead of throwing
// (#1), a stale answer is dropped (#2), the picture decode is capped and direct (#3), and a saved
// picture is always a .png whatever name the renderer asked for (#5).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deleteSafely, writeSafely } from '../src/main/shot/pictureFiles.ts'
import { bgraToRgba, MAX_PICTURE_PIXELS } from '../src/main/shot/pixels.ts'
import { pictureFileName } from '../src/shared/mobPicture.ts'
import { latestOnly } from '../src/renderer/src/features/gaps/latestOnly.ts'

test('#1 A WRITE THAT FAILS ANSWERS IN WORDS, IT NEVER THROWS; A GOOD ONE WRITES', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eq-pic-'))
  try {
    const bad = writeSafely(join(dir, 'no-such-folder', 'npc_x.png'), new Uint8Array([1, 2, 3]))
    assert.equal(bad.ok, false)
    assert.match(bad.ok ? '' : bad.message, /Could not save .*npc_x\.png: that folder is gone\./)
    const path = join(dir, 'npc_x.png')
    assert.deepEqual(writeSafely(path, new Uint8Array([7, 8])), { ok: true })
    assert.deepEqual([...readFileSync(path)], [7, 8])
    assert.equal(deleteSafely(path), true)
    assert.equal(deleteSafely(path), true, 'already gone counts as done')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('#2 ONLY THE NEWEST TICKET COUNTS: AN ANSWER FOR AN EARLIER SAVE IS DROPPED', () => {
  const t = latestOnly()
  const a = t.start()
  assert.ok(t.isLatest(a))
  const b = t.start()
  assert.ok(!t.isLatest(a), "A's late answer is stale once B is saved")
  assert.ok(t.isLatest(b))
})

test('#3 BGRA BECOMES RGBA BY INDEX; PAST THE PIXEL CAP, OR A SHORT BITMAP, IS REFUSED', () => {
  const rgba = bgraToRgba(new Uint8Array([10, 20, 30, 255, 1, 2, 3, 4]), 2, 1)
  assert.deepEqual([...(rgba?.data ?? [])], [30, 20, 10, 255, 3, 2, 1, 4])
  assert.equal(bgraToRgba(new Uint8Array(4), 2, 1), null)
  // the cap is checked before anything is allocated: a 5000x4000 (20 MP) picture is refused
  assert.ok(5000 * 4000 > MAX_PICTURE_PIXELS)
  assert.equal(bgraToRgba(new Uint8Array(0), 5000, 4000), null)
  assert.ok(3840 * 2160 <= MAX_PICTURE_PIXELS, 'a 4K screen fits')
})

test('#5 A SAVED PICTURE IS ALWAYS A .png, WITH NO FOLDER PARTS OR CHARACTERS WINDOWS REFUSES', () => {
  assert.equal(pictureFileName('npc_a_lesser_kobold.png'), 'npc_a_lesser_kobold.png')
  assert.equal(pictureFileName('x.bat'), 'x.png')
  assert.equal(pictureFileName('..\\..\\Windows\\evil.exe'), '_.._Windows_evil.png')
  assert.equal(pictureFileName('a:b*c?.png'), 'a_b_c_.png')
  assert.equal(pictureFileName('tab\there'), 'tab_here.png')
  assert.equal(pictureFileName(''), 'picture.png')
})
