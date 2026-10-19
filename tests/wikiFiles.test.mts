// The wiki's file list, for mob pages with no image (owner ask, 2026-10-18: Marda's page named
// npc_marda.png and no such file existed). Fixtures only, no network.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileKey, markNoImage } from '../scripts/scrape-wiki-files'
import { parseMobPage } from '../scripts/sources/mobPage'

test('a file name keys the way the wiki keys it', () => {
  assert.equal(fileKey('npc_marda.png'), 'Npc_marda.png')
  assert.equal(fileKey('File:Npc marda.png'), 'Npc_marda.png')
})

test('a mob page names its image; a missing or unnamed one is marked', () => {
  assert.equal(parseMobPage('Marda', '{{Namedmobpage\n| imagefilename     = npc_marda.png\n| name = Marda\n}}')?.image, 'npc_marda.png')
  assert.equal(parseMobPage('X', '{{Namedmobpage\n| imagefilename = \n| name = X\n}}')?.image, undefined)
  const mobs: { image?: string; noImage?: true }[] = [{ image: 'npc_marda.png' }, { image: 'npc_drizda_tunesinger.png', noImage: true }, {}]
  assert.equal(markNoImage(mobs, new Set(['Npc_drizda_tunesinger.png'])), 2)
  assert.deepEqual(mobs.map((m) => m.noImage === true), [true, false, true])
})
