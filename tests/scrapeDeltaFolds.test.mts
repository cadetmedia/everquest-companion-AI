// scrape-delta's spell and quest folds: spells join by pageid and take the page title as their
// name; quests fold by title through scrape-quests.ts's own catalog builder.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveSpells, foldSpells } from '../scripts/sources/deltaSpells'
import { foldQuests, redirectTarget, type QuestCache } from '../scripts/sources/deltaQuests'
import { buildCatalog } from '../scripts/scrape-quests'
import type { PageIds, PageTexts } from '../scripts/sources/deltaPages'

const spell = (spellname: string): string => `{{Spellpagesmart|\n| spellname = ${spellname}\n| mana = 10\n}}`

function ids(rows: [string, number, number?][]): PageIds {
  return {
    pageids: new Map(rows.map(([t, id]) => [t, id])),
    revids: new Map(rows.map(([t, id, rev]) => [t, rev ?? id + 1000]))
  }
}

test('Healing Water (57458): a page whose |spellname is stale is named by its title', () => {
  const universe = { 57458: 'Healing Water' }
  const pages: PageTexts = new Map([['Healing Water', spell('Greater Healing')]])
  const fold = foldSpells(universe, pages, ids([['Healing Water', 57458, 170001]]))
  assert.deepEqual(fold.fresh, [{ pageid: 57458, title: 'Healing Water', content: spell('Greater Healing'), revid: 170001 }])
  const { spells } = deriveSpells(fold.titles, () => spell('Greater Healing'))
  assert.deepEqual(spells.map((s) => s.name), ['Healing Water'])
})

test('spells: a deleted page leaves, a moved page keeps its pageid under the new title', () => {
  const universe = { 100: 'Doomed Spell', 101: 'Old Name', 102: 'Stays' }
  const pages: PageTexts = new Map([
    ['Doomed Spell', null],
    ['New Name', spell('Old Name')],
    ['Old Name', '#REDIRECT [[New Name]]']
  ])
  const fold = foldSpells(universe, pages, ids([['New Name', 101], ['Old Name', 900]]))
  assert.deepEqual(fold.titles, { 101: 'New Name', 102: 'Stays' })
  assert.deepEqual(fold.removed, ['Doomed Spell'])
  const texts: Record<number, string> = { 101: spell('Old Name'), 102: spell('Stays') }
  const { spells, missing } = deriveSpells(fold.titles, (id) => texts[id] ?? null)
  assert.deepEqual(spells.map((s) => s.name), ['New Name', 'Stays'])
  assert.deepEqual(missing, [])
})

test('spells: a page that is no spell page now leaves the universe; a new spell page joins', () => {
  const universe = { 100: 'Was A Spell' }
  const pages: PageTexts = new Map([['Was A Spell', 'prose now'], ['Fresh Spell', spell('Fresh Spell')]])
  const fold = foldSpells(universe, pages, ids([['Was A Spell', 100], ['Fresh Spell', 200]]))
  assert.deepEqual(fold.titles, { 200: 'Fresh Spell' })
  assert.deepEqual(fold.folded, ['Fresh Spell'])
  assert.deepEqual(fold.removed, ['Was A Spell'])
})

const QUEST = 'Hand it in.\n== Reward ==\n{{:Rusty Dagger}}\n'
const items = new Set(['rusty dagger', 'breastplate of ro'])

function questCache(): QuestCache {
  return {
    members: [{ pageid: 1, ns: 0, title: 'Armor Quest' }, { pageid: 2, ns: 0, title: 'Gone Quest' }],
    revs: { 1: 10, 2: 20 },
    itemTitles: items
  }
}

const catalog = (title: string, wt: string): ReturnType<typeof buildCatalog>['quests'] =>
  buildCatalog([{ pageid: 0, ns: 0, title }], () => wt, (t) => items.has(t.toLowerCase())).quests

test('quests: a Gear Set reward is folded in, a deleted quest leaves the list and the catalog', () => {
  const cache = questCache()
  const quests = [...catalog('Armor Quest', QUEST), ...catalog('Gone Quest', QUEST)]
  const gained = `${QUEST}{{Gear Set|Breastplate of Ro}}\n`
  const pages: PageTexts = new Map([['Armor Quest', gained], ['Gone Quest', null]])
  const fold = foldQuests(cache, quests, { pages, ids: ids([['Armor Quest', 1, 11]]), aux: new Map() })
  assert.deepEqual(fold.quests.map((q) => q.page), ['Armor Quest'])
  assert.deepEqual(fold.quests[0].rewards?.map((r) => r.name), ['Rusty Dagger', 'Breastplate of Ro'])
  assert.deepEqual(fold.members, [{ pageid: 1, ns: 0, title: 'Armor Quest' }])
  assert.deepEqual(fold.fresh, [{ pageid: 1, content: gained, revid: 11 }])
  assert.deepEqual(fold.gone, [2])
})

test('quests: a move renames the entry and the listed title; the redirect left behind is not the quest', () => {
  const cache = questCache()
  const quests = catalog('Armor Quest', QUEST)
  const pages: PageTexts = new Map([['Armor Quest', '#REDIRECT [[Armour Quest]]'], ['Armour Quest', QUEST]])
  const fold = foldQuests(cache, quests, { pages, ids: ids([['Armour Quest', 1], ['Armor Quest', 5]]), aux: new Map() })
  assert.deepEqual(fold.quests.map((q) => q.page), ['Armour Quest'])
  assert.equal(fold.members.find((m) => m.pageid === 1)?.title, 'Armour Quest')
  assert.deepEqual(fold.gone, [])
})

test('quests: a listed page turned redirect is read through its target, as scrape:quests does', () => {
  const cache = questCache()
  assert.equal(redirectTarget('#redirect [[armor_quest#Steps]]'), 'Armor quest')
  const pages: PageTexts = new Map([['Gone Quest', '#REDIRECT [[Other Page]]']])
  const unread = foldQuests(cache, [], { pages, ids: ids([['Gone Quest', 2]]), aux: new Map() })
  assert.deepEqual(unread.unapplied, ['Gone Quest'])
  const aux: PageTexts = new Map([['Other Page', QUEST]])
  const read = foldQuests(cache, [], { pages, ids: ids([['Gone Quest', 2, 21]]), aux })
  assert.deepEqual(read.quests.map((q) => q.page), ['Gone Quest'])
  assert.deepEqual(read.fresh, [{ pageid: 2, content: QUEST, revid: 21 }])
})
