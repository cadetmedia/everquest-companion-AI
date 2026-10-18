// QUEST-CATALOG TESTS: the pure quest-page wikitext parser (scripts/sources/questPage.ts)
// plus identity checks on the committed dataset it produces
// (src/renderer/src/data/eqlegends/quests.json, written by `npm run scrape:quests`).
//
// WHY the catalog exists: an item page only names a quest when someone filled in its
// `|relatedquests` field, so classic turn-in items read as quest-less from the item side.
// The linkage lives on the QUEST pages — the scraper indexes them item-first, and
// src/main/itemLookup.ts merges that index in as a second LOCAL source (before the wiki).
//
// The wikitext fixtures below are VERBATIM excerpts of real eqlwiki quest pages
// (fetched 2026-08-02), trimmed to the structures the parser reads. They are wiki text,
// not game log, so the fixture-scrub law doesn't apply.
//
// Dataset assertions are IDENTITIES ("this item resolves to >= 1 quest", "givers are
// non-empty strings") — never frozen counts of a scrape that will grow.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dedupe,
  isEmptyParse,
  linkTargets,
  parseCoinCost,
  parseFactionHits,
  parseQuestPage,
  parseTopTable,
  splitSections,
  stripMarkup,
  transclusionTargets
} from '../scripts/sources/questPage'
import { MAX_ATTACHED_REWARDS, buildQuestItemIndex, questItemKey } from '../src/main/questItemIndex'
import questsJson from '../src/renderer/src/data/eqlegends/quests.json'
import type { QuestData } from '../src/shared/types'

// --- verbatim wikitext fixtures --------------------------------------------------

// "Ale for Beur": the canonical shape — questTopTable header, a Reward section whose item
// is a {{:Name}} transclusion box, and the turn-in item as a plain [[link]] in prose.
const ALE_FOR_BEUR = `{{Classic Era}}
[[File:npc_beur_tenlah.png|frame|Beur Tenlah]]
{| class="questTopTable"
! ''' Start Zone: '''
| [[Freeport|East Freeport]]
|-
! ''' Quest Giver: '''
| [[Beur Tenlah]]
|-
! ''' Minimum Level: '''
| 1
|-
! ''' Classes: '''
| [[Warrior]], [[Ranger]], [[Bard]], [[Rogue]]
|-
! ''' Related Zones: '''
| None
|-
! ''' Related NPCs: '''
| [[Harkin Duskfoot]]
|}

== Reward ==

<ul><li>  {{:Used Merchants Gloves}}
</li></ul>

== Walkthrough ==

You say, 'Hail, Beur Tenlah'

'''Bring him some [[Dwarven Ale]].'''

{{YouGainExperience}}

'''This leads in to the [[Note for Janam]] quest as Harkin Dustfoot is stood next to him.'''

[[Category:Quests]]
[[Category:East Freeport]]`

// "Corrupt Guards": a Minimum Level cell carrying PROSE, "All" classes, a many-item Reward
// list, the {{exp}} spelling of the experience marker, and a turn-in item ([[Guard Bracelet]])
// buried in prose next to NPC and zone links that must NOT become items.
const CORRUPT_GUARDS = `{{Classic Era}}
{| class="questTopTable"
! ''' Start Zone: '''
| [[Northern Karana]]
|-
! ''' Quest Giver: '''
| [[Capt Linarius]]
|-
! ''' Minimum Level: '''
| 15 (lowest level of the guard you need to kill is 30)
|-
! ''' Classes: '''
| All
|-
! ''' Related Zones: '''
| [[Western Karana]]
|-
! ''' Related NPCs: '''
| [[Guard McCluskey]]
|}

== Reward ==

<ul><li>  {{:Bunker Battle Blade}}
</li><li> {{:Fine Steel Dagger}}
</li></ul>

== Walkthrough ==

A [[Guard Bracelet]] (identifies as "Corrupt Guard Bracelet") drops from [[Guard McCluskey]] in [[Western Karana]].

{{exp}} (About 48,000 exp per bracer)

[[Category:Quests]]`

// "Bone Chips Quests": a disambiguation HUB — no top table, no reward, only links to the
// real quest pages. Must parse to nothing so the scraper LISTS it as skipped.
const BONE_CHIPS_HUB = `{{Disambiguation}}
: [[File:Item_804.png]] There are many quest iterations regarding turning in '''[[Bone Chips]]''' for city/guard faction.

*[[Bone Chips Felwithe|Yeolarn ('''Felwithe''')]] - In the Cleric guild.
*[[Assist the Great Xelha|Xelha ('''Freeport''')]] - give 4 Bone Chips to [[Xelha Nevagon]].

[[Category: Quests]]
[[Category: Repeatable Turn-in Quests]]`

// The item-title set the scraper supplies (in the real run: every page embedding
// Template:Itempage + Category:Quest Items). Only these titles may become items.
const ITEMS = new Set(
  [
    'Dwarven Ale',
    'Used Merchants Gloves',
    'Guard Bracelet',
    'Bunker Battle Blade',
    'Fine Steel Dagger',
    'Bone Chips'
  ].map((s) => s.toLowerCase())
)
const isItem = (t: string): boolean => ITEMS.has(t.toLowerCase())

// --- parser tests -----------------------------------------------------------------

test('Ale for Beur: top table, transcluded reward, prose turn-in item, exp marker', () => {
  const q = parseQuestPage('Ale for Beur', ALE_FOR_BEUR, isItem)
  assert.equal(q.hasTopTable, true)
  assert.equal(q.startZone, 'East Freeport') // [[Freeport|East Freeport]] → the LABEL
  assert.equal(q.giver, 'Beur Tenlah')
  assert.equal(q.minLevel, 1)
  assert.deepEqual(q.classes, ['Warrior', 'Ranger', 'Bard', 'Rogue'])
  assert.deepEqual(q.relatedZones, []) // "None" is not a zone
  assert.deepEqual(q.relatedNpcs, ['Harkin Duskfoot'])
  assert.deepEqual(q.rewards, ['Used Merchants Gloves'])
  assert.deepEqual(q.requiredItems, ['Dwarven Ale'])
  assert.equal(q.expReward, true)
  assert.equal(isEmptyParse(q), false)
})

test('Corrupt Guards: prose Minimum Level, All classes, {{exp}}, NPC/zone links are not items', () => {
  const q = parseQuestPage('Corrupt Guards', CORRUPT_GUARDS, isItem)
  assert.equal(q.minLevel, 15) // numeric part only…
  assert.equal(q.minLevelText, '15 (lowest level of the guard you need to kill is 30)') // …prose kept
  assert.deepEqual(q.classes, ['All'])
  assert.deepEqual(q.rewards, ['Bunker Battle Blade', 'Fine Steel Dagger'])
  assert.deepEqual(q.requiredItems, ['Guard Bracelet'])
  // The walkthrough also links an NPC and a zone — neither is in the item set.
  assert.equal(q.requiredItems.includes('Guard McCluskey'), false)
  assert.equal(q.requiredItems.includes('Western Karana'), false)
  assert.equal(q.expReward, true)
})

test('a reward item is never ALSO listed as required (Reward section is excluded from the body)', () => {
  const q = parseQuestPage('Corrupt Guards', CORRUPT_GUARDS, isItem)
  for (const r of q.rewards) assert.equal(q.requiredItems.includes(r), false)
})

test('Bone Chips Quests: a disambiguation hub parses to nothing and is flagged, not dropped', () => {
  const q = parseQuestPage('Bone Chips Quests', BONE_CHIPS_HUB, isItem)
  assert.equal(q.disambiguation, true)
  assert.equal(q.hasTopTable, false)
  assert.equal(q.rewards.length, 0)
  // [[Bone Chips]] IS an item, so the hub isn't literally empty of item links — the
  // "empty" verdict is about quest FIELDS (no table, no giver, no zone, no reward).
  assert.equal(q.giver, undefined)
  assert.equal(
    isEmptyParse({ ...q, requiredItems: [] }),
    true
  )
})

test('link/transclusion extraction: labels vs targets, namespaces skipped, dedupe', () => {
  assert.deepEqual(linkTargets('[[Freeport|East Freeport]] and [[Dwarven Ale]]'), ['Freeport', 'Dwarven Ale'])
  assert.deepEqual(linkTargets('[[File:x.png|frame|Cap]] [[Category:Quests]] [[Bone Chips]]'), ['Bone Chips'])
  assert.deepEqual(transclusionTargets('<li> {{:Small Tattered Belt}} </li>{{Classic Era}}'), [
    'Small Tattered Belt'
  ])
  assert.deepEqual(dedupe(['Bone Chips', 'bone chips', 'Rusty Dagger']), ['Bone Chips', 'Rusty Dagger'])
  assert.equal(stripMarkup("''' [[Freeport|East  Freeport]] '''"), 'East Freeport')
})

test('parseTopTable returns null when the page has no questTopTable', () => {
  assert.equal(parseTopTable(BONE_CHIPS_HUB), null)
})

test('splitSections separates the lead from == Heading == blocks', () => {
  const { lead, sections } = splitSections(ALE_FOR_BEUR)
  assert.match(lead, /questTopTable/)
  assert.deepEqual(
    sections.map((s) => s.heading),
    ['Reward', 'Walkthrough']
  )
})

// --- committed dataset ------------------------------------------------------------

const data = questsJson as unknown as QuestData

/**
 * The item→quests index src/main/itemLookup.ts serves — the REAL builder, not a mirror of it.
 * It lives in its own pure module (src/main/questItemIndex.ts) precisely so this test can
 * import it: itemLookup itself imports `electron`, which cannot load outside an Electron
 * process, and a re-implemented index proves nothing about the shipped one.
 */
const byItem = buildQuestItemIndex(data)

test('quests.json loads with a sane, non-empty catalog', () => {
  assert.ok(data.scrapedAt)
  assert.ok(data.source.includes('eqlwiki'))
  assert.ok(data.quests.length > 200, `expected a substantial catalog, got ${data.quests.length}`)
  for (const q of data.quests) {
    assert.ok(q.name && q.page, 'every quest carries a name + page')
    assert.equal(typeof q.name, 'string')
  }
  // Deterministic output: sorted by page title.
  const pages = data.quests.map((q) => q.page)
  assert.deepEqual(pages, [...pages].sort((a, b) => a.localeCompare(b)))
  // No duplicate quest pages.
  assert.equal(new Set(pages).size, pages.length)
})

test('the byItem index answers classic turn-in items the ITEM pages never link', () => {
  // These items' own wiki pages carry no |relatedquests — the linkage lives on the quest
  // pages ("Ale for Beur", "Corrupt Guards", the Bone Chips turn-ins). That gap is the whole
  // reason the catalog exists, so each must resolve to at least one quest.
  for (const item of ['dwarven ale', 'bone chips', 'guard bracelet']) {
    const uses = byItem.get(item) ?? []
    assert.ok(uses.length >= 1, `${item} should resolve to at least one quest`)
    assert.ok(
      uses.some((u) => u.role === 'required'),
      `${item} should be a turn-in for at least one quest`
    )
  }
})

test('the index carries BOTH roles: reward items resolve too', () => {
  const rewardItems = [...byItem.entries()].filter(([, uses]) => uses.some((u) => u.role === 'reward'))
  assert.ok(rewardItems.length > 50, 'quest rewards should be indexed, not just turn-ins')
  const requiredItems = [...byItem.entries()].filter(([, uses]) => uses.some((u) => u.role === 'required'))
  assert.ok(requiredItems.length > 50, 'turn-in items should be indexed')
})

// --- reward attachment (Task #62) --------------------------------------------------
//
// A turn-in use now carries what the quest HANDS OUT, so the item hover card can answer
// "…and what do I get for it" one hop deep without a second lookup. Identity-style: the
// attached names must be exactly the quest's own reward names, capped — never invented,
// never on the wrong role.

test('a required-role use carries its quest rewards; a reward-role use never does', () => {
  let checkedRequired = 0
  for (const q of data.quests) {
    const rewardNames = (q.rewards ?? []).map((r) => r.name.trim()).filter(Boolean)
    for (const it of q.requiredItems ?? []) {
      const use = (byItem.get(questItemKey(it)) ?? []).find((u) => u.page === q.page && u.role === 'required')
      assert.ok(use, `${it} should carry a required use for ${q.page}`)
      if (rewardNames.length === 0) {
        // Law 1: a quest whose page names no reward attaches NOTHING, not an empty list.
        assert.equal(use.rewards, undefined, `${q.page}: no rewards known ⇒ no rewards field`)
      } else {
        assert.deepEqual(use.rewards, rewardNames.slice(0, MAX_ATTACHED_REWARDS))
        checkedRequired++
      }
    }
    for (const r of q.rewards ?? []) {
      const use = (byItem.get(questItemKey(r.name)) ?? []).find((u) => u.page === q.page && u.role === 'reward')
      assert.ok(use, `${r.name} should carry a reward use for ${q.page}`)
      assert.equal(use.rewards, undefined, 'a reward item is its own outcome — never re-listed')
    }
  }
  assert.ok(checkedRequired > 20, `expected many turn-ins to name an outcome, got ${checkedRequired}`)
})

test('attached rewards are capped and are real, non-empty names', () => {
  for (const uses of byItem.values()) {
    for (const u of uses) {
      if (!u.rewards) continue
      assert.equal(u.role, 'required')
      assert.ok(u.rewards.length > 0 && u.rewards.length <= MAX_ATTACHED_REWARDS)
      for (const r of u.rewards) assert.ok(r.trim().length > 0 && !r.includes('[['), `clean reward name: ${r}`)
    }
  }
})

test('the index keys items the way itemLookup does (base name, case-folded)', () => {
  // `+N` upgrade variants share the base item's knowledge (Task #42) — the index must key
  // the same way itemLookup's cacheKey does or a looted "Sphinx Claw +1" resolves to nothing.
  assert.equal(questItemKey('  Dwarven Ale '), questItemKey('dwarven ale'))
  assert.equal(questItemKey('Guard Bracelet +2'), questItemKey('Guard Bracelet'))
})

test('quest metadata survives the scrape (givers, zones, levels are real values)', () => {
  const withGiver = data.quests.filter((q) => q.giver)
  assert.ok(withGiver.length > 100, `expected many quests to name a giver, got ${withGiver.length}`)
  for (const q of withGiver) {
    assert.ok(q.giver && q.giver.length > 1 && !q.giver.includes('[['), `clean giver on ${q.page}`)
  }
  for (const q of data.quests) {
    if (q.minLevel != null) assert.ok(q.minLevel >= 0 && q.minLevel <= 100, `sane minLevel on ${q.page}`)
    for (const z of q.relatedZones ?? []) assert.ok(!/^none$/i.test(z))
  }
})

// --- faction receipt lines (the factions tab's data, 2026-09-05) -----------------

test('parseFactionHits reads both wiki dialects and dedupes per faction', () => {
  const wt = [
    "''Your faction standing with [[Clerics of Underfoot]] has been adjusted by 10.''",
    "''Your faction standing with [[Miners Guild 249]] has been adjusted by 7.''",
    "''Your faction standing with [[Kerra Isle]] got better.''",
    "''Your faction standing with [[Heretics]] got worse.''",
    "''Your faction standing with [[High Guard of Erudin]] has been adjusted by -300.''",
    "''Your faction standing with [[Deepwater Knights]] has been adjusted by (+7).''",
    "''Your faction standing with [[Kerra Isle]] got better.''", // repeat: deduped
    // a later numeric line upgrades an earlier direction-only one for the same faction
    "''Your faction standing with [[Heretics]] has been adjusted by -1.''"
  ].join('\n')
  assert.deepEqual(parseFactionHits(wt), [
    { name: 'Clerics of Underfoot', up: true, amount: 10 },
    { name: 'Miners Guild 249', up: true, amount: 7 },
    { name: 'Kerra Isle', up: true },
    { name: 'Heretics', up: false, amount: -1 },
    { name: 'High Guard of Erudin', up: false, amount: -300 },
    { name: 'Deepwater Knights', up: true, amount: 7 }
  ])
})

test('parseFactionHits takes the link TARGET when the line labels it, and skips junk', () => {
  const wt = "Your faction standing with [[Guards of Qeynos|the Qeynos guards]] got better.\n" +
    'Your faction standing with nobody got worse.\n' // no link: not a receipt line
    + 'faction standing with [[Category:Quests]] got better.' // namespaced: never a faction
  assert.deepEqual(parseFactionHits(wt), [{ name: 'Guards of Qeynos', up: true }])
})

test('parseFactionHits reads the receipt variants the wiki also pastes, and folds underscores', () => {
  const wt = [
    'Your faction with [[Claws_of_Veeshan]] got better.',
    'Your faction with [[Kromzek]] got worse.',
    'Your faction with [[Zlandicar_(Faction)]] has been adjusted by 5.',
    'Your faction standings with [[Hall_of_the_Ebon_Mask]] got worse.',
    'Your faction standing with [[Carson_McCabe]] has gotten better.',
    'Your faction standing with [[Coldain]] (+7) got better.',
    "Your faction standing with [[Tunare's Scouts]] <span class='oppfac'>(10+)</span> got better.",
    'Your faction standing with [[Pirates of Gunthak]] could not possibly get any worse.',
    'Your faction standing with Crushbone Orcs could not possibly get any worse.' // unlinked
  ].join('\n')
  assert.deepEqual(parseFactionHits(wt), [
    { name: 'Claws of Veeshan', up: true },
    { name: 'Kromzek', up: false },
    { name: 'Zlandicar (Faction)', up: true, amount: 5 },
    { name: 'Hall of the Ebon Mask', up: false },
    { name: 'Carson McCabe', up: true },
    { name: 'Coldain', up: true },
    { name: "Tunare's Scouts", up: true },
    { name: 'Pirates of Gunthak', up: false }
  ])
})

test('the committed catalog carries the faction hits, and known rows read back exactly', () => {
  const withFactions = data.quests.filter((q) => q.factions?.length)
  assert.ok(withFactions.length > 400, `expected hundreds of quests with faction hits, got ${withFactions.length}`)
  const byName = new Map(data.quests.map((q) => [q.name, q]))
  assert.deepEqual(byName.get('Bone Chips (Kaladim)')?.factions, [
    { name: 'Clerics of Underfoot', up: true, amount: 10 },
    { name: 'Kazon Stormhammer', up: true, amount: 10 },
    { name: 'Miners Guild 249', up: true, amount: 7 }
  ])
  assert.deepEqual(byName.get('Rat Teeth')?.factions, [{ name: 'Kerra Isle', up: true }])
  for (const q of withFactions) {
    for (const f of q.factions ?? []) {
      assert.ok(f.name.length > 1 && !f.name.includes('[['), `clean faction name on ${q.page}`)
      if (f.amount !== undefined) assert.equal(f.up, f.amount >= 0, `direction matches sign on ${q.page}`)
    }
  }
})

// --- the coin turn-in (the guard-donation quests, 2026-09-05) ---------------------

test('parseCoinCost reads the measured donation spellings, first occurrence wins', () => {
  assert.equal(parseCoinCost('Give him 2 gold to raise your standing.'), '2 gold')
  assert.equal(parseCoinCost('hand him 1000pp for the turn-in'), '1000 platinum')
  assert.equal(parseCoinCost('Hand him 1 platinum.'), '1 platinum')
  assert.equal(parseCoinCost('Give her 10 gold. Later, give her 10 gold again.'), '10 gold')
  assert.equal(parseCoinCost('donate 5 gp at the temple'), '5 gold')
  // Word-numbers are items, not coin ("give him two sapphires"), and stay unmatched.
  assert.equal(parseCoinCost('give him two sapphires'), undefined)
  assert.equal(parseCoinCost('no donations here at all'), undefined)
})

test('the committed catalog carries the coin costs, and a known donation quest reads back', () => {
  const coined = data.quests.filter((q) => q.coin !== undefined)
  assert.ok(coined.length >= 40, `expected the measured ~43 coin quests, got ${coined.length}`)
  const scrolls = data.quests.find((q) => q.name === 'Blank Scrolls')
  assert.ok(scrolls)
  assert.equal(scrolls.coin, '2 gold')
  assert.ok((scrolls.factions?.length ?? 0) > 0, 'a faction quest whose whole cost is coin')
  for (const q of coined) assert.match(q.coin ?? '', /^\d+ (gold|platinum|silver|copper)$/)
})

test('a quest page era banner rides onto each use built from it, and an untagged quest adds nothing', () => {
  const index = buildQuestItemIndex({
    scrapedAt: '',
    source: 'fixture',
    quests: [
      { name: 'Revamp Quest', page: 'Revamp Quest', eraTag: 'FearHateRevamp', requiredItems: ['Fear Shard'] },
      { name: 'Plain Quest', page: 'Plain Quest', requiredItems: ['Fear Shard'] }
    ]
  })
  const uses = index.get(questItemKey('Fear Shard')) ?? []
  assert.equal(uses.find((u) => u.page === 'Revamp Quest')?.eraTag, 'FearHateRevamp')
  const plain = uses.find((u) => u.page === 'Plain Quest')
  assert.ok(plain && !('eraTag' in plain), 'absent, never undefined')
})
