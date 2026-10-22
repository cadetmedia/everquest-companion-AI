// gapSpellFacts.ts — what the game's own spell files state about a spell the wiki lacks, so the Gaps
// tab's Copy wiki page can fill the Spell Page Blueprint (owner, 2026-10-19: "as long as this doesn't
// cause issues with any sort of EQL scanner"). The files are read at rest from the install, as the
// resist table already reads spells_us.txt; nothing touches the game process, nothing is shipped.
//
// Only what the files state outright, with the field map measured in resist/spellsUsParse.ts:
// 1 name, 4 range, 8 cast ms, 10 recast ms, 14 mana, 29 resist type, 78 resist adjust, 36..51 class
// levels WAR..BER (255 = cannot use). spells_us_str.txt: id, caster-me, caster-other, cast on you,
// cast on other, wears off. Duration (level-dependent formulas), target type and spell type have no
// measured mapping here, so they stay blank for the screenshot.
// Phase 4 of screenshot to wiki (2026-10-21): 76 is the icon (`|spellicon`, 741 of 749 cached pages
// that write a number agree), 86 the description's id in dbstr_us.txt (`<id>^6^<text>`; the text
// matched the wiki word for word on 621 pages, the rest add editors' notes). 19,720 of 35,888 texts
// hold placeholders the client fills; those wait for the spell window's screenshot (shared/spellWindow.ts).
//
// ELECTRON-FREE: the file read is the caller's; tests drive `spellFactsFrom` on strings.

import type { ClientSpellFacts } from '../shared/gaps'

/** The sixteen class-level fields' classes, in the file's order (WAR CLR PAL RNG SHD DRU MNK BRD …). */
const CLASSES = ['Warrior', 'Cleric', 'Paladin', 'Ranger', 'Shadow Knight', 'Druid', 'Monk', 'Bard', 'Rogue', 'Shaman', 'Necromancer', 'Wizard', 'Magician', 'Enchanter', 'Beastlord', 'Berserker']
const RESISTS: Record<number, string> = { 1: 'Magic', 2: 'Fire', 3: 'Cold', 4: 'Poison', 5: 'Disease' }

const seconds = (ms: number): string => (ms / 1000).toFixed(2)
const positive = (v: string | undefined): number | undefined => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** spells_us_str.txt rows by id: `[onYou, onOther, wearsOff]`. */
function messagesById(strText: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const line of strText.split(/\r?\n/)) {
    const f = line.split('^')
    if (f.length >= 6) out.set(f[0], [f[3], f[4], f[5]])
  }
  return out
}

/**
 * dbstr_us.txt's spell descriptions (type 6) for these ids, as the wiki writes text: the client's
 * colour tags dropped, `<BR>` as `<br>`.
 */
export function descriptionsById(dbText: string, ids: ReadonlySet<string>): Map<string, string> {
  const out = new Map<string, string>()
  for (const line of dbText.split(/\r?\n/)) {
    const f = line.split('^')
    if (f[1] !== '6' || !ids.has(f[0]) || f[2] === undefined) continue
    out.set(f[0], f[2].replace(/<c\s+"[^"]*">|<\/c>/gi, '').replace(/<br\s*\/?>/gi, '<br>').trim())
  }
  return out
}

function factsOf(f: readonly string[], msgs: string[] | undefined): ClientSpellFacts {
  const classes = CLASSES.flatMap((cls, i) => {
    const level = Number(f[36 + i])
    // 255 is "cannot use"; AA rows (Heroic Leap) carry 254, which is no scroll either.
    return Number.isFinite(level) && level > 0 && level < 254 ? [{ cls, level }] : []
  })
  const cast = positive(f[8])
  const recast = positive(f[10])
  const resist = RESISTS[Number(f[29])]
  const [onYou, onOther, gone] = msgs ?? []
  return {
    classes,
    ...(positive(f[14]) === undefined ? {} : { mana: positive(f[14]) }),
    ...(positive(f[4]) === undefined ? {} : { range: positive(f[4]) }),
    ...(cast === undefined ? {} : { castTime: seconds(cast) }),
    ...(recast === undefined ? {} : { recastTime: seconds(recast) }),
    ...(resist === undefined ? {} : { resist: `${resist} (${String(Number(f[78]) || 0)})` }),
    ...(onYou ? { msgOnYou: onYou.trim() } : {}),
    // The wiki writes the other-person message from "Someone". The file's text starts with its own
    // space (` staggers.`) or an apostrophe (`'s skin ignites.`), so it is joined as it stands.
    ...(onOther ? { msgOnOther: `Someone${onOther.trimEnd()}` } : {}),
    ...(gone ? { msgWearsOff: gone.trim() } : {})
  }
}

/**
 * The asked names' facts, by the name as asked: the first row (lowest id) named exactly so, case
 * folded, else the first named `<name> I` (a ranked spell). A name the files lack is left out.
 */
export function spellFactsFrom(usText: string, strText: string, names: readonly string[], dbText = ''): Record<string, ClientSpellFacts> {
  const keys = new Set(names.flatMap((n) => [n.trim().toLowerCase(), `${n.trim().toLowerCase()} i`]))
  // The first row (lowest id) per lower-cased name; the file is in id order.
  const firstRow = new Map<string, string[]>()
  for (const line of usText.split(/\r?\n/)) {
    const start = line.indexOf('^') + 1
    const name = line.slice(start, line.indexOf('^', start)).toLowerCase()
    if (keys.has(name) && !firstRow.has(name)) firstRow.set(name, line.split('^'))
  }
  const msgs = messagesById(strText)
  const descs = descriptionsById(dbText, new Set([...firstRow.values()].map((f) => f[86] ?? '')))
  const out: Record<string, ClientSpellFacts> = {}
  for (const n of names) {
    const key = n.trim().toLowerCase()
    const f = firstRow.get(key) ?? firstRow.get(`${key} i`)
    if (f === undefined) continue
    const description = descs.get(f[86] ?? '')
    // 0 is the file's blank, as in the other fields read here.
    const icon = positive(f[76]) === undefined ? {} : { icon: Number(f[76]) }
    out[n] = { ...factsOf(f, msgs.get(f[0])), ...icon, ...(description ? { description } : {}) }
  }
  return out
}
