// The picture folder (owner, 2026-10-22): a picture already in it counts as saved ("sometimes i may
// put an image in the directory, if I do, the tool should see that the image is there and not ask for
// it still in the app"), and its layout keeps every kind of picture ("<dir-they-chose>/npc,
// <dir-they-chose>/item, <dir-they-chose>/spell ... this way all items pasted get stored"). Pure parts
// only: main lists the folders and writes the files (main/ipc/shotPicture.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { folderPictures, heldPicture, keptPictureFile, NO_FOLDER_PICTURES, partPicture, PICTURE_FOLDER, pictureFile, pictureRoot, rowPicture, rowPictures } from '../src/shared/mobPicture'
import { pictureIn } from '../src/main/shot/pictureFiles'
import { openNeeds } from '../src/shared/gapReady'
import { IMAGE_NEED } from '../src/shared/wikiPage'
import { screenshotLabel, PICTURED_LABEL } from '../src/renderer/src/overlay/feedGapTags'
import type { GapRow } from '../src/shared/gaps'
import type { FeedEvent } from '../src/shared/types'

const ROOT = 'C:\\Users\\p\\Desktop\\eqlwiki'
const NPC = `${ROOT}\\npc`
const listing = folderPictures([
  { dir: NPC, files: [{ name: 'npc_initiate_of_rodcet.png', path: `${NPC}\\npc_initiate_of_rodcet.png` }] },
  {
    dir: ROOT,
    files: [
      { name: 'NPC_Disciple_of_Rodcet.PNG', path: `${ROOT}\\NPC_Disciple_of_Rodcet.PNG` },
      { name: 'npc_initiate_of_rodcet.png', path: `${ROOT}\\npc_initiate_of_rodcet.png` },
      { name: 'notes.txt', path: `${ROOT}\\notes.txt` }
    ]
  }
])

const row = (domain: GapRow['domain'], name: string, extra: Partial<GapRow> = {}): GapRow => ({ domain, name, kinds: [], count: 1, first: '', last: '', details: { samples: [] }, ...extra })

test('A FOLDER LISTING KEEPS .PNG FILES BY LOWER-CASED NAME; THE NPC FOLDER WINS A NAME BOTH HOLD', () => {
  assert.deepEqual(listing.dirs, [NPC, ROOT])
  assert.equal(listing.files['npc_disciple_of_rodcet.png'], `${ROOT}\\NPC_Disciple_of_Rodcet.PNG`)
  assert.equal(listing.files['npc_initiate_of_rodcet.png'], `${NPC}\\npc_initiate_of_rodcet.png`)
  assert.equal(listing.files['notes.txt'], undefined)
})

test("A PICTURE PUT IN THE FOLDER BY HAND IS HELD, IN ANY CASE (THE OWNER'S npc_disciple_of_rodcet.png)", () => {
  const file = pictureFile(row('mob', 'Disciple of Rodcet'))
  assert.equal(file, 'npc_disciple_of_rodcet.png')
  assert.equal(heldPicture(file, {}, listing), `${ROOT}\\NPC_Disciple_of_Rodcet.PNG`)
  assert.equal(heldPicture('npc_a_bandit.png', {}, listing), undefined)
  assert.equal(heldPicture(file, {}, NO_FOLDER_PICTURES), undefined)
})

test('A PICTURE SAVED FROM THE TAB IS HELD; ONE SAVED INTO A LISTED FOLDER AND GONE FROM IT IS NOT', () => {
  // Saved elsewhere (a dialog to another folder): the listing cannot say, so the save stands.
  assert.equal(heldPicture('npc_a_bandit.png', { 'npc_a_bandit.png': { path: 'D:\\pics\\npc_a_bandit.png' } }, listing), 'D:\\pics\\npc_a_bandit.png')
  // Saved into the npc folder, and the player deleted it since.
  assert.equal(heldPicture('npc_a_bandit.png', { 'npc_a_bandit.png': { path: `${NPC}\\npc_a_bandit.png` } }, listing), undefined)
  assert.equal(heldPicture('npc_a_bandit.png', { 'npc_a_bandit.png': { path: `${NPC.toLowerCase().replace(/\\/g, '/')}/npc_a_bandit.png` } }, listing), undefined)
})

test('READY: A MOB OR IMAGES ROW WHOSE PICTURE IS IN THE FOLDER NO LONGER NEEDS ITS IMAGE', () => {
  assert.deepEqual(openNeeds(row('mob', 'Disciple of Rodcet'), ['factions (a kill of your own)', IMAGE_NEED], { pictures: {}, folder: listing }), ['factions (a kill of your own)'])
  assert.deepEqual(openNeeds(row('mob', 'A bandit'), [IMAGE_NEED], { pictures: {}, folder: listing }), [IMAGE_NEED])
  assert.deepEqual(openNeeds(row('image', 'Initiate of Rodcet', { image: 'npc_initiate_of_rodcet.png' }), [IMAGE_NEED], { pictures: {}, folder: listing }), [])
  assert.deepEqual(openNeeds(row('image', 'Initiate of Rodcet', { image: 'npc_initiate_of_rodcet.png' }), [IMAGE_NEED], { pictures: {} }), [IMAGE_NEED])
})

test("THE EVENT LOG'S NO-PICTURE MARK SAYS SAVED ONCE THE PLAYER HOLDS THE PICTURE", () => {
  const con: FeedEvent = { id: 'c1', kind: 'con', ts: 1, title: 'Disciple of Rodcet', needsImage: true }
  const none = new Set<string>()
  assert.equal(screenshotLabel(con, none), 'no picture · screenshot it')
  assert.equal(screenshotLabel(con, none, (f) => heldPicture(f, {}, listing) !== undefined), PICTURED_LABEL)
  assert.equal(screenshotLabel(con, new Set(['image:disciple of rodcet']), () => true), undefined)
})

test('THE LAYOUT: NPC, ITEM (WINDOW AND LORE TAB) AND SPELL FOLDERS; ITEM AND SPELL PICTURES NAMED AS npc_ ARE', () => {
  assert.deepEqual(PICTURE_FOLDER, { npc: 'npc', item: 'item', lore: 'item', spell: 'spell' })
  assert.equal(keptPictureFile('item', 'Halfling Blood'), 'item_halfling_blood.png')
  assert.equal(keptPictureFile('lore', "Sickly Maiden's Hair"), 'item_sickly_maiden_s_hair_lore.png')
  assert.equal(keptPictureFile('spell', 'Burst of Flame'), 'spell_burst_of_flame.png')
  assert.equal(keptPictureFile('item', 'Bloodsoaked Guantlets'), 'item_bloodsoaked_guantlets.png')
  // No folder parts or characters Windows refuses ever reach a name.
  assert.equal(keptPictureFile('item', '..\\..\\evil:name*?'), 'item_evil_name.png')
  assert.equal(keptPictureFile('spell', '***'), 'spell_picture.png')
  assert.equal(partPicture('window'), 'item')
  assert.equal(partPicture('lore'), 'lore')
  assert.equal(partPicture('icon'), undefined)
})

test("A KIND'S FOLDER STANDS FOR ITS ROOT, SO THE LAST FOLDER SAVED TO NEVER NESTS (npc/npc)", () => {
  assert.equal(pictureRoot(NPC), ROOT)
  assert.equal(pictureRoot(`${ROOT}\\Item\\`), ROOT)
  assert.equal(pictureRoot(`${ROOT}/spell`), ROOT)
  assert.equal(pictureRoot(ROOT), ROOT)
  assert.equal(pictureRoot('C:\\npc'), 'C:\\')
  assert.equal(pictureRoot('npc'), 'npc')
})

test("A ROW'S DETAILS SHOW ITS PICTURE: A MOB'S HELD ONE, AN ITEM'S OR SPELL'S KEPT WINDOW; NONE FOR THE REST (OWNER, 2026-10-22)", () => {
  const ITEM = `${ROOT}\\item`
  const SPELL = `${ROOT}\\spell`
  const folder = folderPictures([
    { dir: NPC, files: [{ name: 'npc_missionary_of_rodcet.png', path: `${NPC}\\npc_missionary_of_rodcet.png` }] },
    { dir: ITEM, files: [{ name: 'item_halfling_blood.png', path: `${ITEM}\\item_halfling_blood.png` }, { name: 'item_halfling_blood_lore.png', path: `${ITEM}\\item_halfling_blood_lore.png` }] },
    { dir: SPELL, files: [{ name: 'spell_burst_of_flame.png', path: `${SPELL}\\spell_burst_of_flame.png` }] }
  ])
  assert.equal(rowPicture(row('mob', 'Missionary of Rodcet'), {}, folder), `${NPC}\\npc_missionary_of_rodcet.png`)
  // The window, not its Lore tab.
  assert.equal(rowPicture(row('item', 'Halfling Blood'), {}, folder), `${ITEM}\\item_halfling_blood.png`)
  assert.equal(rowPicture(row('spell', 'Burst of Flame'), {}, folder), `${SPELL}\\spell_burst_of_flame.png`)
  assert.equal(rowPicture(row('item', 'Rusty Mace'), {}, folder), undefined)
  assert.equal(rowPicture(row('faction', 'Death Fist Orcs (a Deathfist templar)'), {}, folder), undefined)
  // A mob picture saved from the tab into a folder the listing did not read still shows.
  assert.equal(rowPicture(row('mob', 'a bat'), { 'npc_a_bat.png': { path: 'D:\\pics\\npc_a_bat.png' } }, NO_FOLDER_PICTURES), 'D:\\pics\\npc_a_bat.png')
})

test('MAIN SHOWS ONLY A .PNG DIRECTLY IN A PICTURE FOLDER: NO OTHER TYPE, NO SUBFOLDER, NO WAY OUT WITH ..', () => {
  const root = join('C:', 'pics', 'eqlwiki')
  const dirs = [join(root, 'npc'), join(root, 'item'), root]
  assert.ok(pictureIn(join(root, 'npc', 'npc_a_bat.png'), dirs))
  assert.ok(pictureIn(join(root, 'npc', 'NPC_A_BAT.PNG'), dirs))
  assert.ok(pictureIn(join(root, 'notes.png'), dirs))
  assert.ok(!pictureIn(join(root, 'npc', 'secret.txt'), dirs))
  assert.ok(!pictureIn(join(root, 'npc', 'deeper', 'x.png'), dirs))
  assert.ok(!pictureIn(join(root, 'npc', '..', '..', 'other.png'), dirs))
  assert.ok(!pictureIn(join('C:', 'Windows', 'x.png'), dirs))
})

test("AN ITEM ROW STEPS THROUGH ITS WINDOW AND ITS LORE TAB; A MOB HAS ITS ONE PICTURE (OWNER, 2026-10-22: LEFT/RIGHT ARROWS)", () => {
  const ITEM = 'C:/pics/item'
  const names = ['item_encoded_missive.png', 'item_encoded_missive_lore.png', 'item_lore_only_lore.png']
  const folder = folderPictures([{ dir: ITEM, files: names.map((n) => ({ name: n, path: `${ITEM}/${n}` })) }])
  assert.deepEqual(rowPictures({ domain: 'item', name: 'Encoded Missive' }, {}, folder), [
    { label: 'Item window', path: `${ITEM}/item_encoded_missive.png` },
    { label: 'Lore', path: `${ITEM}/item_encoded_missive_lore.png` }
  ])
  assert.deepEqual(rowPictures({ domain: 'item', name: 'Lore Only' }, {}, folder), [{ label: 'Lore', path: `${ITEM}/item_lore_only_lore.png` }])
  assert.deepEqual(rowPictures({ domain: 'item', name: 'Nothing Here' }, {}, folder), [])
})
