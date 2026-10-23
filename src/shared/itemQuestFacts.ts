// itemQuestFacts.ts — what an item's page can say of its quest, from the engine's `questFacts`
// (gaps_quests.rs; owner, 2026-10-22: "the code should also pick up information about who the item
// is supposed to be turned into"). Who handed it over, where and what was said to get it; who it is
// turned in to; the quests its give and turn-in moved. Written the way the owner wrote Encoded
// Missive's page:
//
//   Given by [[Ty`Klerr]] in [[Neriak - Foreign Quarter]] at /loc (-395.03, -228.06, 3.19) during the
//   [[Alchemical Solution]] quest: say [Dorian], [ready], [report]. Turn in to [[Dorian G`Wyn]].
//
// and `|relatedquests` lists the quests. Only the parts the log saw are written.

/** The engine's facts for one item row (gaps_quests.rs `ItemQuestFacts`). */
export interface ItemQuestFacts {
  givenBy?: { npc: string; zone?: string; keywords?: string[] }
  turnedInTo?: { npc: string; n: number }[]
  quests?: string[]
}

/**
 * A row's facts: the engine serves them on an item row as `questFacts`. Read here rather than typed
 * on `GapRow`, which sits at its size bar (shared/gaps.ts).
 */
export const questFactsOf = (row: object): ItemQuestFacts | undefined => (row as { questFacts?: ItemQuestFacts }).questFacts

/** What the note needs beside the facts: page titles, the wiki's zone names, where an NPC stands. */
export interface QuestNoteContext {
  mobPage?: (name: string) => string | undefined
  zoneName?: (raw: string) => string
  /** The first /loc spot the log placed the NPC at (y, x, z), from the hail-and-/loc pairing. */
  locOf?: (npc: string) => readonly number[] | undefined
}

const link = (name: string, c: QuestNoteContext): string => `[[${c.mobPage?.(name) ?? name}]]`

/** `Given by [[NPC]] in [[Zone]] at /loc (...) during the [[Quest]] quest: say [a], [b].` */
function givenSentence(g: NonNullable<ItemQuestFacts['givenBy']>, quest: string | undefined, c: QuestNoteContext): string {
  const zone = g.zone === undefined || g.zone === '' ? '' : ` in [[${c.zoneName?.(g.zone) ?? g.zone}]]`
  const spot = c.locOf?.(g.npc) ?? []
  const loc = spot.length === 0 ? '' : ` at /loc (${spot.join(', ')})`
  const during = quest === undefined ? '' : ` during the [[${quest}]] quest`
  const words = g.keywords ?? []
  const said = words.length === 0 ? '' : `: say ${words.map((k) => `[${k}]`).join(', ')}`
  return `Given by ${link(g.npc, c)}${zone}${loc}${during}${said}.`
}

/** `Turn in to [[NPC]].`, naming the quest when no give sentence does. */
function turnInSentence(to: readonly { npc: string }[], quest: string | undefined, c: QuestNoteContext): string {
  const forQuest = quest === undefined ? '' : ` for the [[${quest}]] quest`
  return `Turn in to ${to.map((t) => link(t.npc, c)).join(' or ')}${forQuest}.`
}

/** The `|notes` sentences, or undefined when the log saw no quest step for the item. */
export function questNote(f: ItemQuestFacts | undefined, c: QuestNoteContext = {}): string | undefined {
  if (f === undefined) return undefined
  const quest = f.quests?.[0]
  const to = f.turnedInTo ?? []
  const parts = [
    ...(f.givenBy === undefined ? [] : [givenSentence(f.givenBy, quest, c)]),
    ...(to.length === 0 ? [] : [turnInSentence(to, f.givenBy === undefined ? quest : undefined, c)])
  ]
  if (parts.length === 0 && quest !== undefined) parts.push(`Part of the [[${quest}]] quest.`)
  return parts.length === 0 ? undefined : parts.join(' ')
}

/** The `|relatedquests` list, or undefined when the log tied the item to no quest. */
export function relatedQuests(f: ItemQuestFacts | undefined): string | undefined {
  const quests = f?.quests ?? []
  return quests.length === 0 ? undefined : `\n${quests.map((q) => `* [[${q}]]`).join('\n')}`
}

/** An item page's quest sentences and quest list, the fields the page writer takes; empty when none. */
export function questPageParts(f: ItemQuestFacts | undefined, c: QuestNoteContext): { questNote?: string; relatedQuests?: string } {
  const note = questNote(f, c)
  const related = relatedQuests(f)
  return { ...(note === undefined ? {} : { questNote: note }), ...(related === undefined ? {} : { relatedQuests: related }) }
}

/** The facts as short lines for the row's details. */
export function questFactLines(f: ItemQuestFacts | undefined): string[] {
  if (f === undefined) return []
  const g = f.givenBy
  return [
    ...(g === undefined ? [] : [`Given by ${g.npc}${g.zone === undefined ? '' : ` in ${g.zone}`}${(g.keywords ?? []).length === 0 ? '' : ` (you said: ${(g.keywords ?? []).join(', ')})`}`]),
    ...(f.turnedInTo ?? []).map((t) => `Turned in to ${t.npc}${t.n > 1 ? ` x${String(t.n)}` : ''}`),
    ...(f.quests ?? []).map((q) => `Quest: ${q}`)
  ]
}

/** The first spot the log placed each mob at, by its name lowercased, from the engine's `mobLocs`. */
export function locFinder(mobLocs: readonly { mob: string; points: number[][] }[] | undefined): (npc: string) => readonly number[] | undefined {
  const at = new Map((mobLocs ?? []).map((m) => [m.mob.toLowerCase(), m.points[0]]))
  return (npc) => at.get(npc.toLowerCase())
}
