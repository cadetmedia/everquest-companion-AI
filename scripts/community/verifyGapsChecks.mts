// verifyGapsChecks.mts — the Gaps checklist's items that read one character's tab (verify-gaps.mts
// runs them): each looks for a real case in the folded log, runs the tab's own functions on it and
// returns PASS or FAIL with the evidence, or SKIP with the reason when the log holds no case.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { doneKey, gapActions, uncertainGap, withoutDone, withoutUncertain, type GapDomain, type GapRow } from '../../src/shared/gaps'
import { groupGaps } from '../../src/shared/gapGroups'
import { zoneBaseName } from '../../src/shared/gapWikiZone'
import { zoneKey } from '../../src/shared/zones'
import { killsFor } from '../../src/shared/kills'
import { logStampKey } from '../../src/shared/logArchive/segment'
import { GAPS_DATA_DATE, IS_MOB, PAGE_EXTRAS, type TabView } from './verifyGapsView.mjs'
import { REPO_ROOT } from './verifyGapsFold.mjs'

export type Status = 'PASS' | 'FAIL' | 'SKIP' | 'CODE-CHECKED' | 'SEE'
export interface Outcome {
  status: Status
  evidence: string[]
}
export interface Check {
  id: number
  title: string
  run: () => Outcome | Promise<Outcome>
}

export const outcome = (ok: boolean, evidence: string[]): Outcome => ({ status: ok ? 'PASS' : 'FAIL', evidence })
export const skip = (why: string): Outcome => ({ status: 'SKIP', evidence: [why] })

/** A page's `| key = …` field with its block, as one quoted line of evidence. */
export function field(page: string, key: string): string {
  const lines = page.split('\n')
  const at = lines.findIndex((l) => new RegExp(`^\\|\\s*${key}\\s*=`).test(l))
  if (at < 0) return '(no such field)'
  const out = [lines[at] ?? '']
  for (let i = at + 1; i < lines.length && !(lines[i] ?? '').startsWith('|') && lines[i] !== '}}'; i++) out.push(lines[i] ?? '')
  return JSON.stringify(out.join('\n').trimEnd())
}

/** The first line of `text` holding `needle`, quoted. */
export function lineWith(text: string, needle: string): string {
  return JSON.stringify(text.split('\n').find((l) => l.includes(needle)) ?? '(absent)')
}

/** A bare Mobs row for a catalog mob, so its page can be built as the tab would build one. */
const mobRow = (name: string): GapRow => ({ domain: 'mob', name, kinds: [], count: 1, first: '', last: '', details: { samples: [] } })
const rowsOf = (v: TabView, d: GapDomain): GapRow[] => v.snap.rows.filter((r) => r.domain === d)
const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()
const zonesOf = (r: GapRow): string[] => r.details.zones?.all ?? r.details.zones?.entries.map((e) => e.name) ?? []

function mobsStillNeeded(v: TabView): Outcome {
  const mobs = rowsOf(v, 'mob')
  const needy = mobs.find((r) => v.needed(r).length > 0)
  if (needy === undefined) return outcome(false, [`none of ${String(mobs.length)} Mobs rows has a still-needed list`])
  const first = mobs[0]
  const hidden = withoutDone(mobs, new Set([doneKey(first)]))
  const ok = hidden.length === mobs.length - 1 && !hidden.includes(first) && withoutDone(mobs, new Set()).length === mobs.length
  return outcome(ok, [
    `"${needy.name}" still needs: ${v.needed(needy).join('; ')}`,
    `done key "${doneKey(first)}": ${String(mobs.length)} rows -> ${String(hidden.length)} hidden-done; Show done -> ${String(mobs.length)}`
  ])
}

/** For each name, whether a `says` followed a `You say, 'Hail, <name>'` within 10 s (gaps_players ANSWER_MS). */
export function hailAnswers(logPath: string, names: readonly string[]): Map<string, boolean> {
  const want = new Set(names.map((n) => n.toLowerCase()))
  const lastHail = new Map<string, number>()
  const out = new Map<string, boolean>()
  const stampMs = (line: string): number => Date.parse((logStampKey(line) ?? '').replace(' ', 'T'))
  for (const line of readFileSync(logPath, 'latin1').split('\n')) {
    const hail = /\] You say, 'Hail, ([^']+)'/.exec(line)
    if (hail !== null && want.has((hail[1] ?? '').toLowerCase())) lastHail.set((hail[1] ?? '').toLowerCase(), stampMs(line))
    const said = /\] (\S+) says, '/.exec(line)
    const who = (said?.[1] ?? '').toLowerCase()
    const at = lastHail.get(who)
    if (said !== null && at !== undefined && stampMs(line) - at <= 10_000) out.set(who, true)
  }
  return out
}

function oneWordNames(v: TabView): Outcome {
  const oneWord = rowsOf(v, 'mob').filter((r) => /^[A-Z][a-z'`]+$/.test(r.name))
  const hailed = oneWord.filter((r) => r.kinds.includes('hailed'))
  const answered = hailAnswers(v.fold.logPath, hailed.map((r) => r.name))
  const evidence: string[] = []
  let ok = true
  for (const name of ['Grapok', 'Rognok']) {
    const r = oneWord.find((x) => x.name === name)
    if (r === undefined) evidence.push(`${name}: no Mobs row (not in this log, or the catalog has it)`)
    else evidence.push(`${name}: filed, kinds ${r.kinds.join(',')}, maybePlayer=${String(r.maybePlayer === true)}, the log shows it answering a hail: ${String(answered.get(name.toLowerCase()) === true)}`)
  }
  const flagged = hailed.filter((r) => r.maybePlayer === true)
  const contradicted = flagged.filter((r) => answered.get(r.name.toLowerCase()) === true)
  evidence.push(`hailed one-word rows flagged maybePlayer: ${flagged.map((r) => r.name).join(', ') || '(none)'}`)
  if (flagged.length === 0 || contradicted.length > 0) ok = false
  if (contradicted.length > 0) evidence.push(`flagged although the log shows a hail answered: ${contradicted.map((r) => r.name).join(', ')}`)
  const capped = oneWord.filter((r) => (r.details.cons?.entries ?? []).some((e) => Number(/^L(\d+)/.exec(e.name)?.[1] ?? 0) > 50))
  evidence.push(`conned above 50: ${capped.map((r) => `${r.name} (${r.details.cons?.entries[0]?.name ?? ''}) maybePlayer=${String(r.maybePlayer === true)}`).join('; ') || '(none)'}`)
  if (capped.some((r) => r.maybePlayer === true)) ok = false
  return outcome(ok, evidence)
}

function zonesOnce(v: TabView): Outcome {
  const evidence: string[] = []
  let ok = true
  for (const d of ['item', 'mob', 'spell', 'drop', 'faction', 'image'] as const) {
    const heads = groupGaps(rowsOf(v, d), v.loot, PAGE_EXTRAS.zoneName).flatMap((e) => (e.kind === 'zone' ? [e.zone] : []))
    const dupes = heads.filter((z, i) => heads.findIndex((x) => same(x, z)) !== i)
    const tiered = heads.filter((z) => zoneBaseName(z) !== z)
    if (dupes.length > 0 || tiered.length > 0) ok = false
    const befallen = heads.filter((z) => z === 'Befallen').length
    evidence.push(`${d}: ${String(heads.length)} zone headings, Befallen ${String(befallen)}x, duplicates [${dupes.join(', ')}], with a tier tail [${tiered.join(', ')}]`)
  }
  return outcome(ok, evidence)
}

function mobPageZoneAndSpecials(v: TabView): Outcome {
  const zoneName = PAGE_EXTRAS.zoneName ?? ((z: string) => z)
  const tiered = rowsOf(v, 'mob').find((r) => zonesOf(r).some((z) => zoneName(z) !== z))
  if (tiered === undefined) return skip('no unknown mob was seen in a zone the wiki spells differently')
  const page = v.pageText(tiered)
  const raw = zonesOf(tiered).find((z) => zoneName(z) !== z) ?? ''
  const wiki = zoneName(raw)
  let ok = page.includes(`[[${wiki}]]`) && page.includes(`[[Category:${wiki}]]`) && !page.includes(`[[${raw}]]`)
  const evidence = [`"${tiered.name}" seen in "${raw}" -> wiki "${wiki}"`, `zone: ${field(page, 'zone')}`, `category: ${lineWith(page, `[[Category:${wiki}`)}`]
  const special = (v.engine.mobSpecials ?? []).find((s) => s.specials.length > 0)
  const unknown = rowsOf(v, 'mob').find((r) => (v.engine.mobSpecials ?? []).some((s) => same(s.mob, r.name)))
  if (special === undefined) return outcome(ok, [...evidence, 'special: SKIP, no mob was seen to Rampage or Flurry'])
  const who = unknown ?? mobRow(special.mob)
  const specials = (v.engine.mobSpecials ?? []).filter((s) => same(s.mob, who.name)).flatMap((s) => s.specials)
  const line = field(v.pageText(who), 'special')
  ok = ok && specials.every((s) => line.includes(s))
  const note = unknown === undefined ? ` (no unknown mob rampaged or flurried; "${who.name}" is a catalog mob, its page built as the tab builds one)` : ''
  return outcome(ok, [...evidence, `special for "${who.name}"${note}: ${line}`])
}

function spellPageFilled(v: TabView): Outcome {
  const spells = rowsOf(v, 'spell')
  const row = spells.find((r) => r.name === 'Specter Stun') ?? spells.find((r) => v.spellFacts[r.name] !== undefined)
  if (row === undefined) return skip('no unknown spell found in the install spell files')
  const facts = v.spellFacts[row.name]
  if (facts === undefined) return outcome(false, [`"${row.name}": spells_us.txt has no row of that name`])
  const page = v.pageText(row)
  // Each page field and the fact it is written from; a fact the file states as 0 is left off the page.
  const keys: [string, unknown][] = [
    ['mana', facts.mana],
    ['range', facts.range],
    ['casting_time', facts.castTime],
    ['recast_time', facts.recastTime],
    ['resist', facts.resist],
    ['msg_cast_on_you', facts.msgOnYou],
    ['msg_cast_on_other', facts.msgOnOther],
    ['msg_wears_off', facts.msgWearsOff]
  ]
  const stated = keys.filter(([, fact]) => fact !== undefined).map(([k]) => k)
  const unstated = keys.filter(([, fact]) => fact === undefined).map(([k]) => k)
  const missing = stated.filter((k) => !new RegExp(`^\\| ${k} = .+`, 'm').test(page))
  return outcome(missing.length === 0 && stated.length > 0, [
    `"${row.name}": the file states ${stated.join(', ')}; the page fills ${stated.filter((k) => !missing.includes(k)).join(', ')}${missing.length > 0 ? `; MISSING ${missing.join(', ')}` : ''}`,
    ...stated.map((k) => `${k}: ${field(page, k)}`),
    `not stated by the file (0 there, so left off): ${unstated.join(', ') || '(none)'}`,
    'duration: never filled, by design (src/main/gapSpellFacts.ts: no measured mapping for the duration formulas)'
  ])
}

function factionAmounts(v: TabView): Outcome {
  const rows = rowsOf(v, 'faction')
  const amounted = rows.filter((r) => r.adjust !== undefined)
  const wrong = amounted.filter((r) => !v.pageText(r).includes(`(${String(r.adjust)})`))
  const evidence = [`${String(amounted.length)} of ${String(rows.length)} Factions rows carry an amount; ${String(wrong.length)} copy without it`]
  const sample = amounted[0]
  if (sample !== undefined) evidence.push(`"${sample.name}": ${JSON.stringify(v.pageText(sample).trim())}`)
  const unknown = new Set(rowsOf(v, 'mob').map((r) => r.name.toLowerCase()))
  const capped = (v.engine.killFactions ?? []).filter((k) => k.adjust === undefined && k.raised === true)
  const pick = capped.find((k) => unknown.has(k.mob.toLowerCase())) ?? capped[0]
  if (pick === undefined) return outcome(wrong.length === 0 && amounted.length > 0, [...evidence, 'capped "better": SKIP, no kill printed one'])
  const row = rowsOf(v, 'mob').find((r) => same(r.name, pick.mob)) ?? mobRow(pick.mob)
  const page = v.pageText(row)
  const opposing = field(page, 'opposing_factions')
  const lowered = field(page, 'factions')
  const ok = opposing.includes(`[[${pick.faction}]]`) && !lowered.includes(`[[${pick.faction}]]`)
  return outcome(ok && wrong.length === 0 && amounted.length > 0, [...evidence, `capped "better" ${pick.faction} on "${pick.mob}": opposing_factions ${opposing}`])
}

function noSkeletalParts(v: TabView): Outcome {
  const names = ['Skeletal Finger', 'Skeletal Toe']
  const looted = v.loot.filter((e) => names.some((n) => e.item.toLowerCase().startsWith(n.toLowerCase())))
  const rows = rowsOf(v, 'item').filter((r) => names.some((n) => r.name.toLowerCase().startsWith(n.toLowerCase())))
  if (looted.length === 0) return skip('the log never looted a Skeletal Finger or Skeletal Toe')
  return outcome(rows.length === 0, [`looted ${String(looted.length)}x; Items rows: ${rows.map((r) => r.name).join(', ') || '(none)'}`])
}

/** A Gaps feature file's source, for the items only the UI shows. */
const gapsSource = (f: string): string => readFileSync(join(REPO_ROOT, 'src', 'renderer', 'src', 'features', 'gaps', f), 'utf8')

/** The chips get the date the tab computes: useGapsData's constant, GapsView's context, the chips' call. */
function chipsWired(): boolean {
  return (
    gapsSource('useGapsData.ts').includes("GAPS_DATA_DATE = ((mobsJson as { scrapedAt?: string }).scrapedAt ?? '').slice(0, 10)") &&
    gapsSource('GapsView.tsx').includes('CHIP_CONTEXT = { dataDate: GAPS_DATA_DATE') &&
    gapsSource('GapActionChips.tsx').includes('gapActions(row, verdict, ctx)')
  )
}

function chipDataDate(v: TabView): Outcome {
  const wired = chipsWired()
  const row = rowsOf(v, 'mob').find((r) => r.suggest === undefined) ?? rowsOf(v, 'item')[0]
  if (row === undefined) return skip('no Items or Mobs row to put chips on')
  const ctx = { dataDate: GAPS_DATA_DATE, isMob: IS_MOB }
  const [check] = gapActions(row, 'unchecked', ctx)
  const [rescrape] = gapActions(row, 'hasPage', ctx)
  if (check === undefined || rescrape === undefined) return outcome(false, [`"${row.name}" got no chips`])
  const named = check.why.includes(GAPS_DATA_DATE) && rescrape.why.includes(GAPS_DATA_DATE)
  return outcome(GAPS_DATA_DATE !== '' && wired && named, [
    `GAPS_DATA_DATE = "${GAPS_DATA_DATE}"; useGapsData/GapsView/GapActionChips wiring ${wired ? 'found' : 'NOT found'}`,
    `"${row.name}" ${check.label}: "${check.why}"`,
    `${rescrape.label}: "${rescrape.why}"`
  ])
}

function rowIconsStop(): Outcome {
  const src = gapsSource('GapRowButtons.tsx')
  const stop = src.includes('const stop = (e: MouseEvent): void => e.stopPropagation()')
  const iconStops = /<IconButton[\s\S]*?onClick=\{\(e\) => \{\s*stop\(e\)\s*onClick\?\.\(\)/.test(src)
  const compact = /<GapRowButtons [^>]*compact \/>/.test(gapsSource('GapsTable.tsx'))
  const evidence = `stop helper ${String(stop)}; the icon's onClick calls stop(e) before its action ${String(iconStops)}; the table row renders the icons (compact) ${String(compact)}`
  return { status: stop && iconStops && compact ? 'CODE-CHECKED' : 'FAIL', evidence: [evidence] }
}

function soldBy(v: TabView): Outcome {
  const row = rowsOf(v, 'item').find((r) => r.kinds.includes('bought'))
  if (row === undefined) return skip('no unknown item was bought')
  const page = v.pageText(row)
  return outcome(page.includes('{{ItemWhereTable|'), [`"${row.name}" bought from ${row.details.sources?.entries.map((e) => e.name).join(', ') ?? '?'}`, `soldby: ${field(page, 'soldby')}`])
}

function groupDropRate(v: TabView): Outcome {
  const groups = rowsOf(v, 'drop').filter((r) => r.details.drops !== undefined)
  if (groups.length === 0) return skip('no drop row is a group (a drop-list page)')
  const rated = groups.find((r) => {
    const kills = killsFor(v.kills, r.details.sources?.entries[0]?.name ?? '')?.count ?? 0
    return kills > 0 && r.count <= kills
  })
  if (rated === undefined) return skip(`${String(groups.length)} group drop rows, none with kills >= drops (a rate is left off then)`)
  const text = v.pageText(rated)
  return outcome(/\[Overall: ~[\d.]+%\]/.test(text), [`"${rated.name}": ${JSON.stringify(text.trim())}`])
}

function moneyDrops(v: TabView): Outcome {
  const coin = new Map((v.engine.mobCoin ?? []).filter((c) => c.n > 0).map((c) => [c.mob.toLowerCase(), c]))
  const mobs = rowsOf(v, 'mob')
  const paid = mobs.find((r) => coin.has(r.name.toLowerCase()))
  const unpaid = mobs.find((r) => !coin.has(r.name.toLowerCase()))
  if (paid === undefined || unpaid === undefined) return skip('need one unknown mob that paid coin and one that never did')
  const a = v.pageText(paid)
  const b = v.pageText(unpaid)
  const block = a.split('\n').filter((l) => l.includes('MONEY DROPS') || l.includes('<b>Platinums') || l.includes('<b>Coppers'))
  return outcome(a.includes('<b>MONEY DROPS</b>') && !b.includes('MONEY DROPS'), [
    `"${paid.name}" (${String(coin.get(paid.name.toLowerCase())?.n ?? 0)} paying kills): ${JSON.stringify(block.join('\n'))}`,
    `"${unpaid.name}" (no coin seen): MONEY DROPS ${b.includes('MONEY DROPS') ? 'PRESENT' : 'absent'}`
  ])
}

function cazicLink(v: TabView): Outcome {
  const cazic = (z: string): boolean => zoneKey(z) === zoneKey('Temple of Cazic-Thule')
  const rows = v.snap.rows.filter((r) => (r.domain === 'mob' || r.domain === 'merchant') && zonesOf(r).some(cazic))
  const items = rowsOf(v, 'item').filter((r) => v.loot.some((e) => cazic(e.zone ?? '') && same(e.item, r.name)))
  const all = [...rows, ...items]
  if (all.length === 0) return skip('no unknown row was seen in the Temple of Cazic-Thule')
  const link = '[[Cazic Thule (Zone)|Cazic Thule]]'
  const bad = all.filter((r) => !v.pageText(r).includes(link))
  const first = all[0]
  return outcome(bad.length === 0, [
    `${String(all.length)} rows (${all.map((r) => `${r.domain}:${r.name}`).join(', ')}); without the piped link: ${bad.map((r) => r.name).join(', ') || '(none)'}`,
    ...(first === undefined ? [] : [`"${first.name}": ${lineWith(v.pageText(first), link)}`, `category: ${lineWith(v.pageText(first), '[[Category:Cazic')}`])
  ])
}

function hideUncertain(v: TabView): Outcome {
  const rows = v.snap.rows
  const kept = withoutUncertain(rows)
  const gone = rows.filter((r) => !kept.includes(r))
  const maybe = rows.filter((r) => r.maybePlayer === true)
  const ok = gone.length === maybe.length && gone.every((r) => r.maybePlayer === true && uncertainGap(r))
  return outcome(ok, [`${String(rows.length)} rows -> ${String(kept.length)}; removed ${gone.map((r) => `${r.domain}:${r.name}`).join(', ') || '(none)'}; maybePlayer rows ${String(maybe.length)}`])
}

function eichvulLoot(v: TabView): Outcome {
  const hits = v.loot.filter((e) => e.item.includes('Eichvul') || (e.source ?? '').includes('Eichvul'))
  if (hits.length === 0) return skip('the log has no Eichvul loot line')
  const ok = hits.some((e) => e.item === 'Note from Eichvul' && e.source === 'erudite traveler')
  const shown = hits.map((e) => `item "${e.item}" source "${e.source ?? ''}"`).join('; ')
  const mobRowToo = rowsOf(v, 'mob').find((r) => r.name.includes('Eichvul'))
  return outcome(ok, [shown, ...(mobRowToo === undefined ? [] : [`and a Mobs row "${mobRowToo.name}" follows from it`])])
}

function factionsNone(v: TabView): Outcome {
  const row = rowsOf(v, 'mob').find((r) => r.name === 'a scout from zanivar') ?? rowsOf(v, 'mob').find((r) => {
    const own = r.details.killers?.entries.find((e) => e.name === 'you')?.n ?? 0
    return own > 0 && !(v.engine.killFactions ?? []).some((k) => same(k.mob, r.name)) && (killsFor(v.kills, r.name)?.credited ?? 0) === 0
  })
  if (row === undefined) return skip('no unknown mob killed by your own blows with no faction lines')
  const page = v.pageText(row)
  const own = row.details.killers?.entries.find((e) => e.name === 'you')?.n ?? 0
  const credited = killsFor(v.kills, row.name)?.credited ?? 0
  return outcome(page.includes('| factions = \n\n* None'), [`"${row.name}": ${String(own)} own kills, ${String(credited)} credited`, `factions: ${field(page, 'factions')}`])
}

/** Every checklist item that reads the attached character's tab, in the checklist's order. */
export function tabChecks(v: TabView): Check[] {
  return [
    { id: 1, title: 'Mobs rows: still needed; Done hides, Show done brings back', run: () => mobsStillNeeded(v) },
    { id: 2, title: 'One-word names: unanswered hail -> maybePlayer; conned above 50 -> not', run: () => oneWordNames(v) },
    { id: 3, title: 'Grouped: each zone heading once, tiers folded', run: () => zonesOnce(v) },
    { id: 4, title: 'Mob page: wiki zone link/category; special from mobSpecials', run: () => mobPageZoneAndSpecials(v) },
    { id: 5, title: 'Spell page: client facts filled', run: () => spellPageFilled(v) },
    { id: 6, title: 'Factions: amounts; capped "better" under opposing_factions', run: () => factionAmounts(v) },
    { id: 7, title: 'Skeletal Finger / Toe not among Items rows', run: () => noSkeletalParts(v) },
    { id: 8, title: 'Chip tooltips name the data date', run: () => chipDataDate(v) },
    { id: 9, title: 'Row icons stop the row click (code read)', run: () => rowIconsStop() },
    { id: 11, title: 'Sold by: {{ItemWhereTable| on a bought item', run: () => soldBy(v) },
    { id: 12, title: 'Group drop line carries [Overall: ~N%]', run: () => groupDropRate(v) },
    { id: 13, title: 'MONEY DROPS for a paying mob, none for another', run: () => moneyDrops(v) },
    { id: 14, title: 'Temple of Cazic-Thule -> [[Cazic Thule (Zone)|Cazic Thule]]', run: () => cazicLink(v) },
    { id: 15, title: 'Level cap', run: () => ({ status: 'SEE', evidence: ['covered by 2 (conned above 50)'] }) },
    { id: 16, title: 'Hide uncertain removes exactly the maybePlayer rows', run: () => hideUncertain(v) },
    { id: 18, title: 'Loot "Note from Eichvul from erudite traveler\'s corpse"', run: () => eichvulLoot(v) },
    { id: 19, title: '* None factions on an own-kill mob with no faction lines', run: () => factionsNone(v) }
  ]
}
