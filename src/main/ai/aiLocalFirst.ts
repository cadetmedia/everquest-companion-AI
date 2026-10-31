// Local first, AI second (owner, 2026-10-31): before any model call, the app looks the question up
// in its own data. A strong match (an item, mob or spell named in the question, or a Compendium
// passage plainly about it) is answered at once, free and without a key, with an "Ask AI" offer.
// Anything else returns null and goes to the AI as before. Electron-free: unit tests import it.

import type { AiPromptResult } from '../../shared/aiChat'
import type { AiCitation } from '../../shared/aiSources'
import { wikiPageUrl } from '../../shared/wiki'
import { compendium, queryTerms, searchCompendium } from './aiCompendium'
import {
  entityNames,
  searchItems,
  searchMobs,
  searchSpells,
  type CompactItem,
  type CompactMob,
  type CompactSpell,
  type EntityKind
} from './aiKnowledge'

/** A question about the player, a judgement or a comparison needs the AI, whatever it names. */
const NEEDS_AI =
  /\b(my|me|mine|i'?m|i'?ve|i'?d|we|our|us|current(ly)?|right now|here|this (fight|zone|group|character)|should|better|best|worth|vs\.?|versus|compare|recommend|why|explain|upgrade|plan|build|rotation|help me)\b/i
const MAX_WORDS = 8

const KIND_CUES: [EntityKind, RegExp][] = [
  ['spell', /\b(spell|cast|mana|class(es)?|level do|scroll|buff|duration)\b/i],
  ['mob', /\b(spawn|spawns|where is|where are|level is|con|kill|camp|mob|npc)\b/i],
  ['item', /\b(drop|drops|loot|item|stats?|quest|worth|ac|hp)\b/i]
]

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(a|an|the) /, '')
}

let nameIndex: Map<string, { kind: EntityKind; name: string }[]> | null = null

function index(): Map<string, { kind: EntityKind; name: string }[]> {
  if (nameIndex) return nameIndex
  nameIndex = new Map()
  for (const e of entityNames()) {
    const key = norm(e.name)
    if (key.length < 4) continue
    const list = nameIndex.get(key) ?? []
    if (!list.some((x) => x.kind === e.kind)) list.push(e)
    nameIndex.set(key, list)
  }
  return nameIndex
}

/** The longest known name inside the question, with its plural `s` forgiven. */
function namedIn(question: string): { key: string; hits: { kind: EntityKind; name: string }[] } | null {
  const words = norm(question).split(' ').filter(Boolean)
  const idx = index()
  for (let len = Math.min(MAX_WORDS, words.length); len >= 1; len--) {
    for (let i = 0; i + len <= words.length; i++) {
      const gram = words.slice(i, i + len).join(' ')
      const hits = idx.get(gram) ?? (gram.endsWith('s') ? idx.get(gram.slice(0, -1)) : undefined)
      if (!hits) continue
      // One common word ("cloak", "totem") is not a name unless the question is little else.
      if (len === 1 && words.length > 4) continue
      return { key: gram, hits }
    }
  }
  return null
}

function pickKind(question: string, kinds: readonly EntityKind[]): EntityKind {
  for (const [kind, cue] of KIND_CUES) if (kinds.includes(kind) && cue.test(question)) return kind
  return (['item', 'mob', 'spell'] as const).find((k) => kinds.includes(k)) ?? 'item'
}

function wikiCitation(page: string | undefined, title: string): AiCitation[] {
  const url = wikiPageUrl(page)
  return url ? [{ url, title: `${title} - EverQuest Legends Wiki`, tier: 'trusted' }] : []
}

/** Wiki link markup (`[[Page|label]]`) as its plain label. */
function unlink(text: string): string {
  return text.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
}

/** The wiki stats block, one line each and no blank lines (markdown hard breaks). */
function statLines(block: string): string {
  return unlink(block)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('  \n')
}

export function itemAnswer(it: CompactItem): { text: string; citations: AiCitation[] } {
  const lines = [`**${it.name}**${it.eraTag ? ` (${it.eraTag})` : ''}${it.lore ? ' - Lore' : ''}${it.quest ? ' - Quest item' : ''}`]
  if (it.statsBlock) lines.push('', statLines(it.statsBlock))
  if (it.summary && !it.statsBlock) lines.push('', it.summary)
  if (it.dropsFrom.length) lines.push('', `**Drops from:** ${it.dropsFrom.map((d) => (d.zone ? `${d.mob} (${d.zone})` : d.mob)).join(', ')}`)
  if (it.questUses.length) lines.push('', `**Used in:** ${it.questUses.join(', ')}`)
  if (!it.dropsFrom.length && !it.questUses.length) lines.push('', "The app's data lists no drop source for it.")
  return { text: lines.join('\n'), citations: wikiCitation(it.page ?? it.name, it.name) }
}

export function mobAnswer(m: CompactMob): { text: string; citations: AiCitation[] } {
  const lines = [`**${m.name}**${m.level ? ` - level ${m.level}` : ''}`]
  if (m.zones?.length) lines.push('', `**Found in:** ${m.zones.join(', ')}`)
  lines.push('', m.drops.length ? `**Known drops:** ${m.drops.join(', ')}` : "The app's data lists no drops for it.")
  return { text: lines.join('\n'), citations: wikiCitation(m.page, m.name) }
}

export function spellAnswer(s: CompactSpell): { text: string; citations: AiCitation[] } {
  const facts = [s.spellType, s.targetType, s.durationText && `duration ${s.durationText}`, s.mana != null && `${String(s.mana)} mana`].filter(Boolean)
  const lines = [`**${s.name}**${facts.length ? ` - ${facts.join(', ')}` : ''}`]
  if (s.classLevels.length) lines.push('', `**Classes:** ${s.classLevels.map((c) => `${c.cls} ${String(c.level)}`).join(', ')}`)
  if (s.effects?.length) lines.push('', ...s.effects.map((e) => `- ${e}`))
  return { text: lines.join('\n'), citations: wikiCitation(s.name, s.name) }
}

function entityAnswer(kind: EntityKind, name: string): { text: string; citations: AiCitation[] } | null {
  if (kind === 'item') {
    const it = searchItems(name)[0]
    return it ? itemAnswer(it) : null
  }
  if (kind === 'mob') {
    const m = searchMobs(name)[0]
    return m ? mobAnswer(m) : null
  }
  const s = searchSpells(name).find((x) => x.name.toLowerCase() === name.toLowerCase())
  return s ? spellAnswer(s) : null
}

/** A Compendium passage that holds every word of the question and whose heading is about it. */
function compendiumAnswer(question: string): { text: string; citations: AiCitation[] } | null {
  const terms = queryTerms(question)
  if (terms.length < 2) return null
  const hit = searchCompendium(question)[0]
  if (!hit) return null
  const lower = hit.text.toLowerCase().replace(/['’]/g, '')
  if (!terms.every((t) => lower.includes(t))) return null
  const heading = new Set(queryTerms(hit.text.split('\n')[0] ?? ''))
  if (terms.filter((t) => heading.has(t)).length * 2 < terms.length) return null
  const body = hit.text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n\n')
  return {
    text: `**From the EverQuest Legends Compendium - ${hit.tab}:**\n\n${body}`,
    citations: [{ url: compendium.url, title: `${compendium.title} (${compendium.author})`, tier: 'trusted' }]
  }
}

/** The app's own answer to `question`, or null when it should go to the AI. */
export function localFirstAnswer(question: string): AiPromptResult | null {
  const q = question.trim()
  if (!q || q.startsWith('/') || NEEDS_AI.test(q)) return null
  const named = namedIn(q)
  let found: { text: string; citations: AiCitation[] } | null
  if (named) {
    const kind = pickKind(q, named.hits.map((h) => h.kind))
    found = entityAnswer(kind, named.hits.find((h) => h.kind === kind)?.name ?? named.key)
  } else {
    found = compendiumAnswer(q)
  }
  if (!found) return null
  return { text: found.text, drafts: [], source: 'instant', citations: found.citations, offerAi: true }
}
