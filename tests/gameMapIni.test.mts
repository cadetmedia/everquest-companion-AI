// Reading the in-game map's open/closed state off the game's UI file (map-waypoints).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMapShown, pickUiIni } from '../src/shared/gameMapIni'

const INI = ['[Main]', 'Show=1', '[MapViewWnd]', 'XPos=0.39%', 'Show=0', 'Width=621', '[MapViewWnd_1]', 'Show=1'].join('\r\n')

test("the map window's Show, not another section's", () => {
  assert.equal(parseMapShown(INI), false)
  assert.equal(parseMapShown(INI.replace('Show=0', 'Show=1')), true)
  assert.equal(parseMapShown('[Main]\nShow=1'), null)
})

test("the character's UI file, the newest when several match, case folded", () => {
  const files = [
    { name: 'UI_Drywrought_oggok_LO1.ini', mtime: 5 },
    { name: 'ui_drywrought_oggok.ini', mtime: 9 },
    { name: 'UI_Dralldar_halas_LO1.ini', mtime: 99 },
    { name: 'UI_Drywrought_oggok_LO1.bak', mtime: 50 }
  ]
  assert.equal(pickUiIni(files, 'Drywrought', 'oggok'), 'ui_drywrought_oggok.ini')
  assert.equal(pickUiIni(files, 'Nobody', 'oggok'), null)
})
