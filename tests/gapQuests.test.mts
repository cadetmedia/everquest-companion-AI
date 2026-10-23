// The Quests domain, NPC roles, fished items and silent hand-overs (owner, 2026-10-22), on the
// owner's own lines of that night (eqlog_Drywrought_oggok.txt): Something Fishy from Nikko Canti,
// What`s going on here? through Zultor, Blergagh, Neuven, Konro and Nikko, Call for Aid from Dorian
// G`Wyn, and Solusek Petition, which no log line named.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { distinctiveWords, questAction, questCatalogFinder, questRewards, questRowLines, questTitleKey, silentGiver, withQuestPages, type QuestLog } from '../src/shared/gapQuests'
import { questDraftPage, questPageGaps, questRowMissing, questRowPage, questUpdateText, rowFactLines } from '../src/shared/gapQuestPage'
import { fishedNote, roleClass } from '../src/shared/gapRoles'
import { questFactLines, questNote } from '../src/shared/itemQuestFacts'
import { gapJob } from '../src/shared/gapJob'
import { GAP_DOMAIN_HELP, GAP_DOMAIN_LABELS, type GapRow } from '../src/shared/gaps'
import { wikiPageText } from '../src/shared/wikiPage'

const fishy: QuestLog = {
  giver: 'Nikko Canti',
  zone: 'Lake Nerius',
  npcs: ['Nikko Canti'],
  reruns: 2,
  steps: [
    {
      at: '2026-10-22 21:00:12',
      kind: 'assigned',
      npc: 'Nikko Canti',
      zone: 'Lake Nerius',
      talk: [
        { who: 'You', text: 'Hail, Nikko Canti' },
        { who: 'Nikko Canti', text: 'Oi, you there! Are you the one who\'s been sneak thieving my fish!? Well come on now was it you or [not]?' },
        { who: 'You', text: 'help' },
        { who: 'Nikko Canti', text: "That's so kind of you! Here I have an old fishing pole you can use, and some bait!" }
      ]
    },
    { at: '2026-10-22 21:37:19', kind: 'updated', zone: 'Lake Nerius 4 (Refined)' },
    {
      at: '2026-10-22 21:46:03',
      kind: 'updated',
      npc: 'Nikko Canti',
      zone: 'Lake Nerius',
      offered: ['Defiled Fish Scales'],
      given: ['Defiled Fish Scales'],
      factions: [{ faction: 'Nerius Trade Association', line: 'Your faction standing with Nerius Trade Association has been adjusted by 10.' }],
      experience: true,
      next: 'Alchemical Solution'
    }
  ]
}

const callForAid: QuestLog = {
  giver: 'Nikko Canti',
  zone: 'Lake Nerius',
  npcs: ['Nikko Canti', 'Dorian G`Wyn'],
  reruns: 0,
  steps: [
    { at: '2026-10-22 23:16:54', kind: 'assigned', npc: 'Nikko Canti', zone: 'Lake Nerius' },
    {
      at: '2026-10-22 23:17:17',
      kind: 'updated',
      npc: 'Dorian G`Wyn',
      zone: 'Lake Nerius',
      talk: [
        { who: 'You', text: 'alleviate the threat' },
        { who: 'Dorian G`Wyn', text: "I have been working franticly to find a way to end these threats. ... And so I've been quietly searching for the right contacts to petition for aid." }
      ]
    }
  ]
}

test('A QUEST TITLE FOLDS THE BACKTICK AND THE TRAILING ?, AND THE CATALOG FINDS ITS PAGE', () => {
  assert.equal(questTitleKey('What`s going on here?'), questTitleKey("What's going on here"))
  const find = questCatalogFinder([{ name: "What's Going On Here", page: "What's Going On Here" }])
  assert.equal(find('What`s going on here?')?.page, "What's Going On Here")
  assert.equal(find('Call for Aid'), undefined)
  const snap = { rows: [{ domain: 'quest', name: 'What`s going on here?' }, { domain: 'quest', name: 'Call for Aid' }] }
  assert.deepEqual(withQuestPages(snap, find).rows.map((r) => r.page), ["What's Going On Here", undefined])
  assert.equal(withQuestPages({ rows: [{ domain: 'quest', name: 'Call for Aid' }] }, find).rows[0].page, undefined)
})

test('THE QUESTS TAB SAYS WHAT IT LISTS, AND A ROW IS A NEW PAGE OR AN UPDATE', () => {
  assert.equal(GAP_DOMAIN_LABELS.quest, 'Quests')
  assert.equal(GAP_DOMAIN_HELP.quest, 'Quests your log took part in: make the page, or fill what its page is missing.')
  const row = { domain: 'quest', name: 'Call for Aid', kinds: ['assigned'], count: 1, first: '', last: '', details: { samples: [] } } as unknown as GapRow
  assert.equal(gapJob(row), 'new')
  assert.equal(gapJob({ ...row, page: 'Call for Aid' }), 'update')
  assert.equal(questAction(row).label, 'Make page')
  assert.equal(questAction({ name: 'What`s going on here?' }).href, "https://eqlwiki.com/index.php?title=What's_going_on_here%3F&action=edit&redlink=1")
  assert.equal(questAction({ name: 'X', page: 'X' }).label, 'Update page')
})

test('THE REWARDS ARE THE LAST STEP WITH A FACTION LINE OR EXPERIENCE', () => {
  assert.deepEqual(questRewards(fishy), {
    // The scales were handed in at that step: a turn-in is never its own reward.
    items: [],
    factions: [{ faction: 'Nerius Trade Association', line: 'Your faction standing with Nerius Trade Association has been adjusted by 10.' }],
    experience: true,
    next: 'Alchemical Solution'
  })
  assert.equal(questRewards(callForAid), undefined)
  const lines = questRowLines(fishy)
  assert.equal(lines[0], 'Given by Nikko Canti in Lake Nerius')
  assert.equal(lines[1], '21:00:12 assigned · Nikko Canti · said "help"')
  assert.ok(lines.includes('Reward: Nerius Trade Association, experience'))
  assert.ok(lines.includes('Done again 2 times (steps from the first run)'))
})

test('A QUEST THE WIKI LACKS GETS A DRAFT IN THE LAYOUT MOST CACHED QUEST PAGES SHARE', () => {
  const page = questDraftPage('Something Fishy', fishy, { journal: { minLevel: 1 } })
  for (const part of [
    '{{Classic Era}}',
    '[[File:npc_nikko_canti.png|thumb|Nikko Canti]]',
    '{| class="questTopTable"',
    // `Start Zone` on 885 of the ~930 pages, `Starts In` on 6 (owner, 2026-10-23: "validate that").
    "! ''' Start Zone: '''\n| [[Lake Nerius]]",
    "! ''' Quest Giver: '''\n| [[Nikko Canti]]",
    "! ''' Minimum Level: '''\n| 1",
    "! ''' Classes: '''\n| ?",
    "! ''' Related NPCs: '''\n| None\n|}",
    // Level-2 headings, as ~1,700 of the cache's headings are; the checklist under `Checklist`.
    '== Reward ==\n\n* Experience',
    '== Checklist ==\n{{CheckboxList}}',
    "* Say 'help' to [[Nikko Canti]] in [[Lake Nerius]].",
    '* Give [[Defiled Fish Scales]] to [[Nikko Canti]] in [[Lake Nerius]].',
    '* Receive the [[Alchemical Solution]] quest.\n{{End}}',
    // A blank line after every walkthrough line, so each renders as its own paragraph.
    "== Walkthrough ==\n\nYou say, 'Hail, Nikko Canti'\n\n: Nikko Canti says, 'Oi, you there!",
    ": Nikko Canti says, 'That's so kind of you! Here I have an old fishing pole you can use, and some bait!'\n\n",
    "'''You have been assigned the task 'Something Fishy'.'''\n\n",
    'Give [[Defiled Fish Scales]] to [[Nikko Canti]]:\n\n',
    "'''Your task 'Something Fishy' has been updated.'''",
    '<div class="facblock">\n* Your faction standing with [[Nerius Trade Association]] has been adjusted by 10.\n</div>\n{{YouGainExperience}}',
    '[[Category:Quests]]\n[[Category:Lake Nerius]]\n<!-- [[Category:All Classes Quests]] or [[Category:<Class> Quests]] -->'
  ]) {
    assert.ok(page.includes(part), part)
  }
  // No page writes `Required Faction: ?`: the row is left out when the log cannot know it.
  assert.ok(!page.includes('Required Faction'))
  assert.ok(!/^= [A-Z]/m.test(page), 'no level-1 heading')
  // The player's own name reads Soandso, as the wiki writes a player.
  const named: QuestLog = { ...fishy, steps: [{ ...fishy.steps[0], talk: [{ who: 'Nikko Canti', text: 'Thank you, Drywrought!' }] }] }
  assert.ok(questDraftPage('Something Fishy', named, { players: ['Drywrought'] }).includes(": Nikko Canti says, 'Thank you, Soandso!'"))
  // No level read: the wiki's own placeholder, never a guess.
  assert.ok(questDraftPage('Call for Aid', callForAid).includes("! ''' Minimum Level: '''\n| ?"))
  assert.ok(questDraftPage('Call for Aid', callForAid).includes("! ''' Related NPCs: '''\n| [[Dorian G`Wyn]]"))
})

test('A QUEST WITH A PAGE GETS ONLY WHAT THE PAGE LACKS, NEVER A WALKTHROUGH', () => {
  const entry = { name: 'Call for Aid', page: 'Call for Aid', startZone: 'Lake Nerius', giver: 'Nikko Canti', relatedNpcs: ['None'] }
  assert.deepEqual(questPageGaps(entry, callForAid, { journal: { minLevel: 1 } }), [
    ['Minimum Level', '1'],
    ['Related NPCs', '[[Dorian G`Wyn]]']
  ])
  const row = { domain: 'quest', name: 'Call for Aid', quest: callForAid }
  const text = questRowPage(row, { entry })
  assert.equal(text, "! ''' Related NPCs: '''\n| [[Dorian G`Wyn]]\n")
  assert.ok(!text.includes('Walkthrough'))
  assert.deepEqual(questRowMissing(row, { entry }), ['Related NPCs (Dorian G`Wyn)', 'Minimum Level (paste its Quest Journal to read it)'])
  const full = { ...entry, minLevel: 1, relatedNpcs: ['Dorian G`Wyn'] }
  assert.match(questUpdateText(questPageGaps(full, callForAid)), /^Nothing the log or the Quest Journal can add/)
  assert.ok(rowFactLines(row, { questEntry: () => entry }).includes('Page lacks: Related NPCs (Dorian G`Wyn)'))
})

test('AN ITEM NO LOG LINE NAMED IS GUESSED TO THE QUEST STEP WHOSE NPC SAID ITS WORD', () => {
  // A place's name ties nothing: Solusek, Freeport and Neriak are zones.
  assert.deepEqual(distinctiveWords('Solusek Petition'), ['petition'])
  assert.deepEqual(distinctiveWords('Plea to Freeport'), [])
  assert.deepEqual(distinctiveWords('Appeal of Neriak'), ['appeal'])
  const quests = [
    { name: 'Something Fishy', log: fishy },
    { name: 'Call for Aid', log: callForAid }
  ]
  assert.deepEqual(silentGiver('Solusek Petition', '2026-10-22 23:29:31', quests), { npc: 'Dorian G`Wyn', quest: 'Call for Aid', at: '2026-10-22 23:17:17', zone: 'Lake Nerius' })
  assert.equal(silentGiver('Solusek Petition', '2026-10-22 23:00:00', quests), undefined, 'only a step before the export')
  assert.equal(silentGiver('Appeal of Neriak', '2026-10-22 23:29:31', quests), undefined, 'no NPC said appeal or neriak')
  // Shown as a guess, never written into the page.
  const facts = { givenBy: { npc: 'Dorian G`Wyn', zone: 'Lake Nerius', guess: true as const, quest: 'Call for Aid' } }
  assert.deepEqual(questFactLines(facts), ['Probably given by Dorian G`Wyn during Call for Aid (check)'])
  assert.equal(questNote(facts), undefined)
  assert.deepEqual(questFactLines({ turnInGuess: { npc: 'Lord Lyfyx', quest: 'Call for Aid' } }), ['Probably turned in to Lord Lyfyx for Call for Aid (check)'])
})

test('A ROLE FROM THE TARGET LINE IS THE PAGE CLASS, AND A MERCHANT TAKES THE MERCHANT LAYOUT', () => {
  assert.equal(roleClass('Banker'), '[[Banker]]')
  assert.equal(roleClass('Warrior GM'), 'GM [[Warrior]]')
  assert.equal(roleClass('Shadowknight GM'), 'GM [[Shadow Knight]]')
  assert.equal(roleClass(undefined), undefined)
  const mob = (role: string): GapRow => ({ domain: 'mob', name: 'Neuven F`Lok', kinds: ['considered'], count: 1, first: '', last: '', details: { samples: [] }, role }) as unknown as GapRow
  assert.match(wikiPageText(mob('Banker'), [], {}), /\| class {13}= \[\[Banker\]\]/)
  assert.match(wikiPageText(mob('Banker'), [], {}), /^\{\{Classic Era\}\}\n\{\{Namedmobpage/)
  assert.match(wikiPageText(mob('Merchant'), [], {}), /\{\{MerchantPage[\s\S]*\| class {13}= \[\[Merchant\]\]/)
  assert.deepEqual(rowFactLines(mob('Banker')), ["Role: Banker (the client's target line)"])
})

test('A FISHED ITEM SAYS WHERE IT WAS FISHED UP, AND NOT WHERE IT IS CAUGHT ANYWHERE', () => {
  assert.equal(fishedNote(['Lake Nerius', 'Lake Nerius']), 'Fished up in [[Lake Nerius]].')
  assert.equal(fishedNote(['A', 'B', 'C', 'D', 'E']), 'Fished up in many zones.')
  const row = { domain: 'item', name: 'Fetid Lake Muck', kinds: ['fished'], count: 5, first: '', last: '', details: { samples: [] }, fishedIn: ['Lake Nerius'] } as unknown as GapRow
  assert.match(wikiPageText(row, [], {}), /\|notes = Fished up in \[\[Lake Nerius\]\]\.\n\|statsblock = /)
  assert.deepEqual(rowFactLines(row), ['Fished up in Lake Nerius'])
})

test('REPEATS ARE A COUNT, AND A STEP READS IN THE ORDER THE LOG PRINTED IT', () => {
  const fish: QuestLog = {
    giver: 'Nikko Canti', zone: 'Lake Nerius', npcs: ['Nikko Canti'], reruns: 0,
    steps: [{
      at: '2026-10-22 21:46:03', kind: 'updated', npc: 'Nikko Canti', zone: 'Lake Nerius',
      offered: ['Fresh Fish', 'Fresh Fish', 'Fresh Fish'], offeredMs: [1000, 1001, 1002],
      talk: [{ who: 'You', text: 'Hail, Nikko Canti', ms: 900 }, { who: 'Nikko Canti', text: 'My fish! Thank you!', ms: 1500 }]
    }]
  }
  const page = questDraftPage('Something Fishy', fish)
  assert.ok(page.includes('* Give 3 [[Fresh Fish]] to [[Nikko Canti]] in [[Lake Nerius]].'))
  assert.equal(page.split('Give 3 [[Fresh Fish]] to [[Nikko Canti]]:').length - 1, 1)
  // The hail, then the hand-in, then the reply it caused.
  const order = ["You say, 'Hail, Nikko Canti'", 'Give 3 [[Fresh Fish]] to [[Nikko Canti]]:', ": Nikko Canti says, 'My fish! Thank you!'"].map((l) => page.indexOf(l))
  assert.deepEqual([...order].sort((a, b) => a - b), order)
  assert.ok(order.every((i) => i >= 0))
})

test("A CHAINED QUEST'S DETAILS SAY WHICH QUEST IT FOLLOWS, NOT WHO HANDED OVER THE OTHER QUEST", () => {
  const log: QuestLog = { giver: 'Lord Lyfyx of Burwood', zone: 'The Temple of Solusek Ro', npcs: [], steps: [], reruns: 0, chainedFrom: 'Call for Aid' }
  assert.equal(questRowLines(log)[0], 'Follows Call for Aid')
})

test('task lines back to back, seconds apart (three fish caught), are one line on the page', () => {
  const upd = (at: string): QuestLog['steps'][number] => ({ at, kind: 'updated', npc: 'Nikko Canti' })
  const log: QuestLog = {
    giver: 'Nikko Canti', zone: 'Lake Nerius', npcs: ['Nikko Canti'], reruns: 0,
    steps: [{ at: '2026-10-22 21:00:12', kind: 'assigned', npc: 'Nikko Canti' }, upd('2026-10-22 21:10:00'), upd('2026-10-22 21:12:30'), upd('2026-10-22 21:15:02')]
  }
  const page = questDraftPage('Something Fishy', log)
  assert.equal(page.split("'''Your task 'Something Fishy' has been updated.'''").length - 1, 1)
})
