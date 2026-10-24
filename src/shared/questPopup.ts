// shared/questPopup.ts — a game popup window (the tutorial's Navigation, Merchanting and Your First Quest
// Reward! windows) read into a quest page (owner, 2026-10-23: "doug gives a quest text and a popup ...
// i need it to know about this so i can create the quest page"). The log never prints a popup, so a
// pasted picture is the only source. main/shot/popupLines.ts reads the lines with where they sit, their
// colour and whether they hold an item link; this file makes the window's title, its paragraphs, the
// quest's instructions and its reward of them.
//
// THE PAGE HAS NO CONVENTION TO FOLLOW: none of the 931 cached quest pages quotes a popup. The walkthrough
// writes one as `A window titled '''Navigation''' opens:` and each paragraph as `: ''text''` (a sub-
// heading bold before its text), a blank line between, in the order the windows were pasted, ahead of
// the log's own steps: a tutorial window comes before the talk it sends the player to.
//
// THE WINDOW'S COLOURS: yellow is a sub-heading (`Map:`); orange is the quest's instruction
// (`Find your way to Old Doug ...`, `Buy the Supplies for Old Doug from the merchant.`) or a tip (`These
// boots have an activatable effect ...`), told apart by the instruction opening on a verb; magenta is an
// item link (`Boots of the Long Road`), which with `you have been awarded ...` is the quest's reward.
// The instructions are the Summary's first checklist entries, in paste order.

/** What main read: each line's text, the top of its letters and their height, colour, and item link. */
export interface PopupLineRead {
  lines: string[]
  tops: number[]
  heights: number[]
  tones: ('white' | 'yellow' | 'orange')[]
  /** Lines holding an item link's magenta. */
  items?: boolean[]
  /** The title bar read on its own. */
  titleLines?: string[]
  /** Where the body starts (pixels from the top). */
  titleBottom?: number
}

export interface PopupParagraph {
  /** A yellow sub-heading the paragraph sits under (`Map:`). */
  heading?: string
  text: string
  /** A run of `Word: ...` lines kept one to a line (the Combat window's con colours, `Grey: Extremely easy. ...`). */
  list?: string[]
}

/** What a pasted popup window says. */
export interface QuestPopup {
  title: string
  paragraphs: PopupParagraph[]
  /** The orange instructions, in order. */
  steps: string[]
  /** Items the window says the quest awarded (an item link in an `awarded` sentence). */
  rewards?: string[]
  /** The window says the quest awarded experience. */
  experience?: boolean
  /** The window its closing line sends the player to next (`Click 'OK' to learn about Skills and Abilities.`). */
  next?: string
  /** A small picture of the paste, for its thumbnail (a data URL). */
  thumb?: string
}

/**
 * The game's own closing line under every tutorial popup, never page text: `Click 'OK' to continue.`,
 * `Press OK to continue.` (in backticks), or `Click 'OK' to learn about Skills and Abilities.`, which
 * names the next window.
 */
const CLOSING = /^(?:click|press)\b.{0,6}\bok\b.{0,6}\bto\s+(.+?)\.?$/i
/** The next window a closing line names (OCR reads `learn` as `leam`). */
const NEXT = /\babout\s+(.+)$/i

/** Marks OCR reads off the frame, the title bar's edge and the scrollbar. */
const EDGE_JUNK = /^[|\\/!¦_\-—–=~.,:;'"`*•©®{}]+$/

/** The scrollbar's thin marks read as a lone letter at a line's end (`Long Road i`, `reward! t`). */
const SCROLL_MARK = /^[iltj1|]$/

/** A line's text without the frame marks OCR read at its ends (`| Navigation`, `Legends. t i`, `explore. |`). */
export function cleanPopupLine(raw: string): string {
  const words = raw.trim().split(/\s+/).filter((w) => w !== '')
  while (words.length > 0 && EDGE_JUNK.test(words[0])) words.shift()
  while (words.length > 1 && (EDGE_JUNK.test(words[words.length - 1]) || SCROLL_MARK.test(words[words.length - 1]))) words.pop()
  return words.map(capitalI).join(' ')
}

/**
 * The capital I as OCR misreads it in this font: a lone `|` between words, and `l` before a consonant
 * at a word's start (`ltem`, no English word starts `lt`, `lm` ...): `Why would | need 4 boots?! ltem
 * Merging`.
 */
function capitalI(word: string, i: number, words: readonly string[]): string {
  if (word === '|' && i > 0 && i < words.length - 1) return 'I'
  return word.replace(/^l(?=[bcdfghjkmnpqrstvwxz])/, 'I')
}

/** A line of real words, not marble grain or a button's edge: mostly letters, one word of three or more. */
function isText(line: string): boolean {
  const solid = line.replace(/\s/g, '')
  if (solid.length === 0) return false
  const letters = (solid.match(/[a-z]/gi) ?? []).length
  return letters / solid.length >= 0.6 && /[a-z]{3,}/i.test(line)
}

/** A title bar's text: a few plain words, no sentence (marble grain reads as `i — Ry. TTL eR`). */
const isTitle = (line: string): boolean => {
  const words = line.split(/\s+/)
  return words.length <= 6 && words.every((w) => /^[A-Za-z][A-Za-z'’-]*!?$/.test(w)) && /[A-Za-z]{3,}/.test(line)
}

/** A title word: a word as it is written (`Why`, `boots?!`, `4`, `I`), not frame grain (`TEE`, `——`). */
const TITLE_WORD = /^(?:[A-Za-z][a-z'’]+[?!.,:]*|[A-Z][a-z]*[?!.,:]*|\d+[?!.,:]*|I)$/

/** How much a strip line reads as a title: its share of real words; a title has at least one of three letters. */
function titleScore(line: string): number {
  const words = line.split(/\s+/).filter((w) => w !== '')
  if (words.length === 0 || words.length > 12 || !/[A-Za-z]{3,}/.test(line)) return 0
  return words.filter((w) => TITLE_WORD.test(w)).length / words.length
}

interface Kept {
  text: string
  top: number
  height: number
  tone: 'white' | 'yellow' | 'orange'
  item: boolean
}

/** The lines worth reading, cleaned, in order, and the window a closing line names next. */
function keptLines(r: PopupLineRead): { kept: Kept[]; next?: string } {
  const kept: Kept[] = []
  let next: string | undefined
  let closed = false
  r.lines.forEach((raw, i) => {
    const text = cleanPopupLine(raw)
    // Under the closing line are the OK button and the frame (`oy ATE NAR CT EY`): never page text.
    if (closed || !isText(text)) return
    const closing = CLOSING.exec(text)
    if (closing !== null) {
      next = NEXT.exec(closing[1])?.[1]?.trim()
      closed = true
      return
    }
    kept.push({ text, top: r.tops[i] ?? 0, height: r.heights[i] ?? 0, tone: r.tones[i] ?? 'white', item: r.items?.[i] === true })
  })
  return next === undefined ? { kept } : { kept, next }
}

/** A blank line between paragraphs: a step past 2.25 line heights (the next line is 1.5 below). */
function gapAt(lines: readonly Kept[]): number {
  const h = lines.map((l) => l.height).filter((x) => x > 0).sort((a, b) => a - b)
  return (h[h.length >> 1] ?? 0) * 2.25
}

/** A paragraph as read: its lines with their colours, before it is told apart into text and instructions. */
interface Para {
  heading?: string
  lines: Kept[]
}

/** Lines into paragraphs: a new one after a blank line and at a sub-heading (a colour change is not one). */
function paragraphsOf(body: readonly Kept[]): Para[] {
  const gapPx = gapAt(body)
  const out: Para[] = []
  let cur: Para | null = null
  body.forEach((l, i) => {
    const gap = i > 0 && gapPx > 0 && l.top - body[i - 1].top > gapPx
    if (l.tone === 'yellow') {
      cur = { heading: l.text, lines: [] }
      out.push(cur)
      return
    }
    if (cur === null || (gap && cur.lines.length > 0)) {
      cur = { lines: [] }
      out.push(cur)
    }
    cur.lines.push(l)
  })
  return out
}

/** Verbs an instruction opens on: what the player is sent to do. */
const INSTRUCTION = /^(?:find|buy|go|head|travel|talk|speak|return|give|hand|deliver|bring|kill|slay|collect|gather|loot|hail|say|seek|visit|enter|meet|purchase|take|use|equip|merge|combine|scribe|memorize|craft)\b/i

/** A paragraph's instruction: its orange text up to the first sentence's end, when it opens on a verb. */
function instructionOf(p: Para): string | undefined {
  const orange = p.lines.filter((l) => l.tone === 'orange').map((l) => l.text).join(' ')
  if (!INSTRUCTION.test(orange)) return undefined
  const end = orange.search(/[.!?](\s|$)/)
  return end < 0 ? orange : orange.slice(0, end + 1)
}

/** `For this quest you have been awarded a pair of <Item> and some experience`: the item and the experience. */
function rewardOf(text: string, hasItem: boolean): { item?: string; experience: boolean } {
  const m =
    /\bawarded\s+(?:(?:a\s+pair|a\s+set|some)\s+of\s+|an?\s+|the\s+)?(.+?)(?:\s+and\s+(?:some\s+)?experience|[.!]|$)/i.exec(text) ??
    /\byou\s+received\s+(?:a\s+(?:second\s+|third\s+)?(?:pair|set)\s+of\s+|an?\s+(?:second\s+)?|another\s+)(.+?)\s+in\s+your\s+inventory\b/i.exec(text)
  const experience = /\bawarded\b[^.]*\bexperience\b/i.test(text)
  const item = m?.[1]?.trim()
  return { ...(hasItem && item !== undefined && item !== '' && !/^experience$/i.test(item) ? { item } : {}), experience }
}

/** A list item's head: `Grey:`, `Light Blue:` (OCR may read the colon as a full stop). */
const ITEM_HEAD = /^([A-Z][a-z]+(?: [A-Z][a-z]+)?)[:.]\s/

/** The game's con colours, easiest first: the Combat window lists them in this order. */
const CON_SCALE = ['Grey', 'Green', 'Light Blue', 'Dark Blue', 'White', 'Yellow', 'Red']

/**
 * A con-colour list whose one unreadable head sits between two read ones takes the colour missing there:
 * dim grey reads as `Crev Extremely easy.` while Green, Light Blue ... Red read. Never a guess beyond
 * that: the scale is the game's own and only one colour fits.
 */
function fillConScale(items: string[]): string[] {
  const at = items.map((i) => CON_SCALE.indexOf(ITEM_HEAD.exec(i)?.[1] ?? ''))
  if (at.filter((x) => x >= 0).length < 4) return items
  return items.map((item, i) => {
    if (at[i] >= 0) return item
    const before = i === 0 ? -1 : at[i - 1]
    const after = at[i + 1] ?? CON_SCALE.length
    if (after - before !== 2 || (i > 0 && before < 0)) return item
    return `${CON_SCALE[before + 1]}: ${item.replace(/^\S+\s+/, '')}`
  })
}

/** A paragraph three or more of whose lines open on `Word:`. */
const listLike = (p: Para): boolean => p.lines.filter((l) => ITEM_HEAD.test(l.text)).length >= 3

/**
 * A list goes on into the next paragraph when every line there opens on `Word:` too: a line box that
 * took in its neighbour sits low enough to look like a blank line (the Combat window split after Dark Blue).
 */
function joinLists(paras: Para[]): Para[] {
  const out: Para[] = []
  for (const p of paras) {
    const prev = out[out.length - 1]
    if (prev !== undefined && listLike(prev) && p.heading === undefined && p.lines.length > 0 && p.lines.every((l) => ITEM_HEAD.test(l.text))) prev.lines.push(...p.lines)
    else out.push(p)
  }
  return out
}

/** A paragraph read as a list when three or more of its lines open on `Word:`: each line an item, colons evened. */
function listOf(p: Para): string[] | undefined {
  if (!listLike(p)) return undefined
  return fillConScale(p.lines.map((l) => l.text.replace(ITEM_HEAD, '$1: ')))
}

/** The title: the title bar's own read, else the first title-like line of the full read. */
function titleOf(r: PopupLineRead, kept: readonly Kept[]): { title: string; skip: number } | null {
  const strip = (r.titleLines ?? []).map(cleanPopupLine)
  const best = strip.reduce<{ t: string; score: number }>((a, t) => (titleScore(t) > a.score ? { t, score: titleScore(t) } : a), { t: '', score: 0 })
  if (best.score >= 0.75) return { title: best.t, skip: kept.filter((l) => l.top < (r.titleBottom ?? 0)).length }
  const at = kept.slice(0, 3).findIndex((l) => isTitle(l.text))
  return at < 0 ? null : { title: kept[at].text, skip: at + 1 }
}

/**
 * A popup window's title, paragraphs, instructions and reward; null when the picture holds no titled
 * prose (not a popup: a Quest Journal, an item window, a screenshot of the world).
 */
export function readPopup(r: PopupLineRead): QuestPopup | null {
  const { kept, next } = keptLines(r)
  const head = titleOf(r, kept)
  if (head === null) return null
  const paras = joinLists(paragraphsOf(kept.slice(head.skip)))
  const paragraphs = paras.map((p): PopupParagraph => {
    const list = listOf(p)
    return { ...(p.heading === undefined ? {} : { heading: p.heading }), text: list === undefined ? p.lines.map((l) => l.text).join(' ') : '', ...(list === undefined ? {} : { list }) }
  })
  if (!paragraphs.some((p) => p.text.split(/\s+/).length >= 6 || (p.list?.length ?? 0) > 0)) return null
  const rewards = paras.map((p) => rewardOf(p.lines.map((l) => l.text).join(' '), p.lines.some((l) => l.item)))
  const items = rewards.flatMap((x) => (x.item === undefined ? [] : [x.item]))
  return {
    title: head.title,
    paragraphs,
    steps: paras.map(instructionOf).filter((s): s is string => s !== undefined),
    ...(items.length === 0 ? {} : { rewards: items }),
    ...(rewards.some((x) => x.experience) ? { experience: true } : {}),
    ...(next === undefined ? {} : { next })
  }
}

/** A Quest Journal pasted here: its title bar or its column heads say so. */
export function isJournalPicture(lines: readonly string[]): boolean {
  return lines.some((l) => /quest\s*journal|task\s*title|objective\s*instructions/i.test(l))
}

/** What the box says when a picture is neither a Quest Journal nor a popup it can read. */
export function popupMissText(lines: readonly string[]): string {
  const read = lines.map(cleanPopupLine).filter(isText).slice(0, 2)
  return read.length === 0 ? 'No text found: paste a Quest Journal or a popup window.' : `Not a Quest Journal or a popup window. Read: ${read.map((l) => (l.length > 50 ? `${l.slice(0, 50)}…` : l)).join(' / ')}`
}

/** A title's words that tell it apart: `Spells and Magic` -> spells, magic. */
const titleWords = (t: string): string[] =>
  t
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['and', 'the', 'about'].includes(w))

/** Whether a closing line's `next` names this window, loosely: the shorter's words all in the longer (`Spells and Magic` is `Spells`). */
export function namesWindow(next: string, title: string): boolean {
  const a = titleWords(next)
  const b = titleWords(title)
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.length > 0 && short.every((w) => long.includes(w))
}

/**
 * The popups in the order the game shows them: each window's closing line names the next, so a chain
 * pasted out of order (Skills and Abilities before Combat) is put back; the rest stay in paste order.
 */
export function orderPopups(popups: readonly QuestPopup[] = []): QuestPopup[] {
  const follows = (p: QuestPopup): boolean => popups.some((q) => q !== p && q.next !== undefined && namesWindow(q.next, p.title))
  const out: QuestPopup[] = []
  const take = (start: QuestPopup): void => {
    let cur: QuestPopup | undefined = start
    while (cur !== undefined && !out.includes(cur)) {
      out.push(cur)
      const next: string | undefined = cur.next
      cur = next === undefined ? undefined : popups.find((q) => !out.includes(q) && namesWindow(next, q.title))
    }
  }
  for (const p of popups) if (!follows(p)) take(p)
  for (const p of popups) take(p)
  return out
}

/** One paragraph's page lines: `: '''Heading''' ''text''`, or a list one item a line. */
function paragraphLines(para: PopupParagraph): string[] {
  const head = para.heading === undefined ? '' : `'''${para.heading}''' `
  if (para.list !== undefined) return [...(head === '' ? [] : [`: ${head.trimEnd()}`]), ...para.list.map((i) => `: ''${i}''`)]
  return [`: ${head}${para.text === '' ? '' : `''${para.text}''`}`.trimEnd()]
}

/** A popup's walkthrough blocks, in the game's order: its opening line with the first paragraph, then one block each. */
export function popupWalkBlocks(popups: readonly QuestPopup[] = []): { kind: 'popup'; lines: string[]; keys: string[] }[] {
  return orderPopups(popups).flatMap((p) =>
    p.paragraphs.map((para, i) => {
      const lines = paragraphLines(para)
      const keys = para.list ?? [para.text === '' ? (para.heading ?? '') : para.text]
      return { kind: 'popup' as const, lines: i === 0 ? [`A window titled '''${p.title}''' opens:`, '', ...lines] : lines, keys }
    })
  )
}

/** The popups' instructions as Summary entries, in the game's order. */
export const popupCheckLines = (popups: readonly QuestPopup[] = []): string[] => orderPopups(popups).flatMap((p) => p.steps.map((s) => `* ${s}`))

/** The items the popups say the quest awarded, in paste order, each once. */
export const popupRewards = (popups: readonly QuestPopup[] = []): string[] => [...new Set(popups.flatMap((p) => p.rewards ?? []))]

/** Whether a popup says the quest awarded experience. */
export const popupExperience = (popups: readonly QuestPopup[] = []): boolean => popups.some((p) => p.experience === true)

/** Short lines for the row's details: the title, the instructions and the reward. */
export const popupKeptLines = (p: QuestPopup): string[] => [`Popup: ${p.title}`, ...p.steps, ...(p.rewards ?? []).map((i) => `Reward: ${i}`)]

/** The row's popups with `p` added last, replacing an earlier paste of the same window. */
export const withPopup = (list: readonly QuestPopup[] = [], p: QuestPopup): QuestPopup[] => [...list.filter((x) => x.title !== p.title), p]

/** The row's popups without the window titled `title`. */
export const withoutPopup = (list: readonly QuestPopup[] = [], title: string): QuestPopup[] => list.filter((x) => x.title !== title)

/**
 * The item-to-quest link a quest row's popups give (the reward a window says the quest awarded), in the
 * shape gaps-tab's `withQuestLinks(rows, links)` takes; null when the popups award no item.
 */
export function popupQuestLink(quest: string, popups: readonly QuestPopup[] = []): { quest: string; items: string[] } | null {
  const items = popupRewards(popups)
  return items.length === 0 ? null : { quest, items }
}
