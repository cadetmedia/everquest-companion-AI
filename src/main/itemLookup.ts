// itemLookup.ts — "what's this lore/quest item for" knowledge service (Task #53).
//
// Answers, for an item the player looted, whether it's a LORE item and which quests
// it's used in — the "you picked up a coin off the ground, what's it for" question.
// (Ground pickups don't log a line; this keys off the parsed `loot` family. See the
// acquisition-line sweep in the Task #53 notes — the loot family is the ONLY
// item-into-inventory line the log carries.)
//
// DESIGN (per AGENTS.md "Data sources & scrapers" + the Task #34 spell-DB precedent):
//   0. THE COMMITTED ITEM DATABASE IS THE PRIMARY SOURCE (`src/main/data/items.json`,
//      scripts/scrape-items.ts — every item page on the wiki, 11,288 of them, parsed by the
//      very same `parseItemWikitext` the live path below uses). It answers instantly,
//      offline, identically for every user, and it is what makes the wiki fallback a
//      fallback: the network is now touched only for an item whose page was created since
//      the last `npm run scrape:items`. A DB hit short-circuits everything after it — no
//      cache read, no request, and (see `lookupItem`) NO NEGATIVE CACHING, since negative
//      caching only ever describes keys the committed DB does not have.
//   1. LOCAL-FIRST. The scraped Plane of Sky dataset (posky.json) already knows every
//      Sky class-Test quest item + its quests + giver. Check it BEFORE any network so
//      a known Sky rune/claw/etc. answers INSTANTLY and offline. Its associations are
//      merged with any the wiki adds (deduped) — including into a DB hit, because posky
//      carries per-item island/giver detail the item page never states.
//   2. WIKI lookup — now the FALLBACK (MediaWiki at eqlwiki.com, same API the scrapers use):
//      search → resolve the item page → parse its {{Itempage}} wikitext for the
//      LORE/QUEST flags (statsblock) + the |relatedquests bulleted link list +
//      |notes summary. Polite: a single serialized in-flight queue with a small
//      inter-request delay (mirrors scripts/sources/eqlegends.ts sleep(110)).
//   3. PERSISTENT CACHE in userData (versioned JSON). Negative results (no page) and
//      offline misses are cached too (offline with a short TTL so we retry soon;
//      real negatives for ~7 days). A cache hit never touches the network.
//
// The PURE classification (wikitext → ItemKnowledge fields) is `parseItemWikitext`,
// unit-tested in tests/itemLookup.test.mts against verbatim real wikitext.

import { logError } from './errorLog'
// The wiki client and the userData cache are shared with mobLookup.ts as SPELLINGS; each service
// creates its own instance, so the state (cooldown, queue, file, save latch) stays per-service.
import { createWikiClient } from './wikiClient'
import { createKnowledgeCache } from './knowledgeCache'
import { normalizeItemName, parseItemWikitext } from './itemLookupParse'
import { buildQuestItemIndex } from './questItemIndex'
import { buildItemDbIndex, itemKey, knowledgeFromDb, type ItemDbEntry, type ItemDbFile } from './itemsDb'
import { heldClickySpells as clickySpells, heldProcSpells as procSpells } from './itemClickies'
import type { HeldCounts, ItemKnowledge, ItemQuestUse, PoskyData, QuestData } from '../shared/types'
import { questKey } from '../shared/poskyKey'
import { marksOf, type ItemMarks } from '../shared/itemKnowledge'

export { normalizeItemName, parseItemWikitext }
// The COMMITTED wiki item database — the PRIMARY source (see the design note above).
// Imported directly, like posky/quests/spells, so electron-vite INLINES it into the main
// bundle; a path-relative read would miss it in out/main/ in production.
import itemsJson from './data/items.json'
// The scraped Plane of Sky dataset is the local-first source. Imported directly so
// electron-vite INLINES it into the main bundle (same reason spells.json is imported,
// not readFileSync'd — a path-relative read misses it in out/main/ in production).
import poskyJson from '../renderer/src/data/eqlegends/posky.json'
// …and the scraped wiki QUEST CATALOG (scripts/scrape-quests.ts) is the second local
// source. Item pages only name a quest when their |relatedquests field was filled in, so
// classic turn-in items (Dwarven Ale, Guard Bracelet, …) read as quest-less from the item
// side; this catalog is built the other way round — from the quest pages themselves.
import questsJson from '../renderer/src/data/eqlegends/quests.json'

// Bumped to 2 when the local quest catalog (quests.json) joined posky as a local source:
// the cache stores the MERGED ItemKnowledge (see `finish()`), and positive entries never
// expire, so every item cached before the catalog existed would otherwise keep serving its
// stale zero-quest answer for the item-page fields. A version mismatch drops the whole file
// (knowledgeCache.ts `load`), so the next lookup re-merges against the new index.
//
// Bumped to 3 when the item page's TRADESKILL fields joined the parse (`|recipes` — the
// recipes that CONSUME this item — and `|playercrafted`). Same reasoning: the cache stores
// the merged record and positives never expire, so every item cached under v2 would keep
// serving a recipe-less answer and a QUEST-ITEM-flagged tradeskill component (Gnome Meat,
// Troll Parts, Spider Legs) would stay unexplained forever.
//
// Bumped to 4 when a `role: 'required'` quest use gained `rewards` — what the quest HANDS OUT
// for that turn-in (questItemIndex.ts). Same reasoning a third time: the cache stores the
// MERGED record and positives never expire, so every item cached under v3 would keep serving
// reward-less turn-in uses and the hover card's outcome line ("→ Bunker Battle Blade") would
// never appear for anything already looted.
const CACHE_VERSION = 4

// ---- normalization ------------------------------------------------------------

/** The ONE canonical item key. Defined in itemsDb.ts so the committed DB, this cache and
 *  the scraper that writes the DB can never key items three different ways. */
const cacheKey = itemKey

// ---- the committed item database (PRIMARY source) ------------------------------
//
// WHERE THE 8.6 MB ACTUALLY LIVES, MEASURED (JOS-371) — read this before trying to make the corpus
// lazy from here, because from here it cannot be made lazy at all.
//
// The numbers, taken on the committed file: `items.json` is 8.75 MB on disk, costs 41.8 ms to
// JSON.parse, and retains a ~20.4 MB object graph for the life of the process. Against a launch
// whose `dataLoaded` mark lands at ~529 ms and whose `replayDone` lands at ~730 ms, with main's heap
// at ~71 MB after the fold, that graph is a real 29% of the heap and the parse is a real 24% of the
// 177 ms between `storeLoaded` and `dataLoaded`.
//
// AND THE IMPORT BELOW IS NOT THE ONLY ONE. FIVE main-process modules ES-import this exact JSON
// module — this file, `ipc/characterSheet.ts`, `ipc/planner.ts`, `mobDropEra.ts` and
// `planner/wornFocusIndex.ts` — and electron-vite inlines it into the main bundle EXACTLY ONCE for
// all of them (three of those files say so in their own headers; the built `out/main/index.js` is
// 15.2 MB, of which this is 8.75). So deleting the import here would move nothing: the bundle would
// still carry the bytes and module evaluation would still parse them, for four other readers.
// Removing the corpus from main's heap is a FIVE-FILE change plus a packaging change (the file
// would have to ship as a resource and be read from disk, which is the exact trap AGENTS.md's
// toolchain note warns about), and it would still buy nothing while `heldClickySpells` below is
// called SYNCHRONOUSLY BEFORE THE SCAN REPLAY (session.ts `installClickies`, JOS-438's law: a
// clicky firing has to be called a click on the pass that folds it) — that call walks the whole
// corpus on every launch, so a lazily-loaded corpus would simply be loaded eagerly by it.
//
// WHAT WAS DONE HERE INSTEAD, because it is what this file actually owns: the three DERIVED indexes
// below are built on first use rather than at module evaluation. They are 2.4 ms + 0.3 ms + 3.7 ms
// and 0.47 + 0.07 + 1.49 MB — modest, but every millisecond of it was being charged to
// `DATA_READY_MS` for a service that nothing asks anything of until the app is live.
//
// WHO ASKS DURING A FOLD: NOBODY, and that is checked rather than assumed. `lookupItem` reaches
// main through exactly two paths — `ipc/knowledge.ts`'s handler (a renderer click) and the
// eventFeed module's `probeLoot`, which is unreachable from a historical event because
// `EventFeedModule.onEvent` returns at `if (!live) return` before it. pipeline.ts injects
// `lookupItem` into the modules and says the same thing at the injection site, and it is DRIVEN
// rather than argued: `tests/eventFeedWindows.test.mts` case (A) replays two committed fixtures at
// `live:false` through the real module with a recording lookup double and asserts the double was
// never called. So a lazy index here is first built by a LIVE loot line or a user's click, never by
// the replay — nothing about the fold becomes async, and nothing it used to see goes missing.

let itemDbIndex: Map<string, ItemDbEntry> | null = null

/** The committed corpus keyed for lookup, built on first use. See the section header. */
function itemDb(): Map<string, ItemDbEntry> {
  itemDbIndex ??= buildItemDbIndex(itemsJson as unknown as ItemDbFile)
  return itemDbIndex
}

/**
 * THE HELD-CLICKY CATALOG (JOS-438), bound to the committed DB here because this module already
 * imports it and pipeline.ts already imports THIS — so the feature adds no module edge to the main
 * bundle. That is not tidiness: giving itemClickies.ts its own items.json import and reaching it
 * from session.ts/pipeline.ts broke JOS-431's inventory watcher, measured, with the function never
 * called. itemClickies.ts carries the bisect. The derivation is pure and lives there; this is the
 * binding and nothing else.
 */
export function heldClickySpells(counts: HeldCounts): ReadonlySet<string> {
  return clickySpells((itemsJson as unknown as ItemDbFile).items, counts)
}

/** The held-proc catalog (upstream issue #69), bound to the committed DB on the same terms. */
export function heldProcSpells(counts: HeldCounts): ReadonlySet<string> {
  return procSpells((itemsJson as unknown as ItemDbFile).items, counts)
}

/**
 * The committed DB's answer for a key, already in `ItemKnowledge` shape (the record IS those
 * fields — see itemsDb.ts), or null when the corpus doesn't have this item. `name` is
 * overridden with what the CALLER asked for: every other path returns the requested display
 * name, and a DB hit must not be the one answer that renames the player's item.
 */
function dbKnowledge(key: string, display: string): Omit<ItemKnowledge, 'cached'> | null {
  const entry = itemDb().get(key)
  return entry ? { ...knowledgeFromDb(entry), name: display } : null
}

/** The list-row marks for many names in one call: the committed DB plus the local quest sources,
 *  exactly what `lookupItem`'s DB path answers, minus the record. No cache read, no request. A
 *  name the DB lacks is absent (the row shows nothing rather than asking the wiki). */
export function itemMarks(names: readonly string[]): Record<string, ItemMarks> {
  const out: Record<string, ItemMarks> = {}
  for (const name of names) {
    const fromDb = dbKnowledge(cacheKey(name), normalizeItemName(name))
    if (fromDb) out[name] = marksOf(mergeLocal(fromDb, localKnowledge(name)))
  }
  return out
}

// ---- local (posky) cross-ref --------------------------------------------------

const posky = poskyJson as unknown as PoskyData

/**
 * Index the Plane of Sky dataset by normalized item name → the quests that require it.
 * This is the offline, already-known answer for every Sky class-Test item (runes,
 * Sphinx Claw, Nebulous Sapphire, efreeti drops, …).
 *
 * BUILT ON FIRST USE (JOS-371), like the two indexes either side of it: it is only ever read by
 * `localKnowledge`, which is only ever read by a live lookup, so building it during main's module
 * evaluation charged `DATA_READY_MS` for an answer nothing had asked for yet.
 */
let poskyIndex: Map<string, ItemQuestUse[]> | null = null
function poskyByItem(): Map<string, ItemQuestUse[]> {
  if (poskyIndex) return poskyIndex
  const built = new Map<string, ItemQuestUse[]>()
  for (const q of posky.quests) {
    for (const it of q.items) {
      const key = cacheKey(it.name)
      const uses = built.get(key) ?? []
      // De-dupe by quest identity (className + name) — the same item appears under many quests.
      const quest = `${q.className} · ${q.name}`
      if (!uses.some((u) => u.quest === quest)) {
        // `items` are the quest's turn-ins by the dataset's own definition, so the role is the
        // source's word; the reward rides along (one hop, like the quest catalog's) and the key
        // is what lets the item page deep-link to the quest on the Plane of Sky tab.
        uses.push({
          quest,
          page: q.source,
          source: 'posky',
          giver: q.giver,
          role: 'required',
          rewards: q.reward ? [q.reward] : undefined,
          poskyKey: questKey(q)
        })
      }
      built.set(key, uses)
    }
  }
  poskyIndex = built
  return built
}

// ---- local (wiki quest catalog) cross-ref --------------------------------------

const questData = questsJson as unknown as QuestData

/**
 * Index the scraped quest catalog by normalized item name → the quests that use it, from
 * BOTH sides of a quest: its turn-in/collectible items (role 'required') and the items it
 * hands out (role 'reward'). This is the answer for every classic turn-in item whose own
 * wiki page never listed a quest.
 *
 * The builder itself is `questItemIndex.ts` — pure, so the golden test can exercise the
 * SHIPPED index (this module can't be imported outside Electron). It also attaches each
 * turn-in use's REWARD names, which is what lets the hover card answer "and what do I get".
 */
let questsIndex: ReturnType<typeof buildQuestItemIndex> | null = null
function questsByItem(): ReturnType<typeof buildQuestItemIndex> {
  questsIndex ??= buildQuestItemIndex(questData)
  return questsIndex
}

/** Quest identity for de-duping across sources: drop a "Class · " prefix + fold case. */
function questIdentity(s: string): string {
  return s
    .replace(/^[^·]*·\s*/, '')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Local-first answer: the Plane of Sky dataset FIRST (it carries per-item island/giver
 * detail), then the wiki quest catalog, deduped by quest identity. Null when neither
 * local source knows this item.
 */
export function localKnowledge(name: string): ItemQuestUse[] | null {
  const key = cacheKey(name)
  const posky = poskyByItem().get(key)
  const quests = questsByItem().get(key)
  if (!posky && !quests) return null
  const uses: ItemQuestUse[] = [...(posky ?? [])]
  for (const u of quests ?? []) {
    const nu = questIdentity(u.quest)
    if (!uses.some((x) => questIdentity(x.quest) === nu)) uses.push(u)
  }
  return uses
}

// ---- wiki client (search → wikitext) ------------------------------------------

/** This service's OWN client — its own Retry-After cooldown and its own serialized, politely
 *  spaced queue (wikiClient.ts; mobLookup.ts's header says why each service keeps its own). */
const wiki = createWikiClient()

/**
 * Resolve an item name to its wiki page title via search. Distinguishes a NETWORK failure
 * ('offline' — retry soon) from a genuine ZERO-hit search ('none' — a real negative, cache
 * for the full TTL). Prefers an exact case-insensitive title match, else the top hit.
 */
type ResolveResult = { status: 'ok'; title: string } | { status: 'none' } | { status: 'offline' }
async function resolvePage(name: string): Promise<ResolveResult> {
  const hits = await wiki.searchTitles(name)
  if (hits === null) return { status: 'offline' }
  if (hits.length === 0) return { status: 'none' }
  const lower = name.toLowerCase()
  const exact = hits.find((h) => h.title.toLowerCase() === lower)
  return { status: 'ok', title: (exact ?? hits[0]).title }
}

// ---- persistent cache (userData, versioned) -----------------------------------

/** `item-knowledge-cache.json` — the WIKI fallback's cache (knowledgeCache.ts). Positive results
 *  never expire (item lore/quest data is static), hence the CACHE_VERSION bump history above. */
const knowledge = createKnowledgeCache<ItemKnowledge>({
  name: 'item-knowledge',
  version: CACHE_VERSION,
  tag: 'main:itemLookup'
})

// ---- merge + public API -------------------------------------------------------

/** Merge the LOCAL associations (posky + quest catalog) into a knowledge record; local
 *  wins on identity, so the wiki's `|relatedquests` links only ADD quests we didn't know. */
function mergeLocal(base: Omit<ItemKnowledge, 'cached'>, local: ItemQuestUse[] | null): Omit<ItemKnowledge, 'cached'> {
  if (!local || local.length === 0) return base
  const uses = [...local]
  // Avoid listing the same quest twice. posky labels a quest "Class · Quest Name" where the
  // name often ALREADY carries the class ("Paladin · Paladin Test of Love"), while the wiki
  // link label is the bare "Paladin Test of Love". So compare with the class prefix stripped
  // (drop everything up to a "·") and de-dupe when one normalized name contains the other.
  const norm = questIdentity
  for (const u of base.questUses) {
    const nu = norm(u.quest)
    if (!uses.some((x) => { const nx = norm(x.quest); return nx === nu || nx.includes(nu) || nu.includes(nx) })) uses.push(u)
  }
  return { ...base, quest: true, questUses: uses }
}

/**
 * Look up an item's knowledge. Resolution order: the COMMITTED item DB (items.json) →
 * the userData cache → a serialized, politely-spaced wiki lookup as the FALLBACK. The local
 * quest sources (posky + the quest catalog) are merged into whichever of those answers,
 * because they say something about the item's USES that no item page states.
 *
 * Never throws — failures degrade to a cached-negative / offline record (which still carries
 * any posky-local answer).
 */
export async function lookupItem(name: string): Promise<ItemKnowledge> {
  const key = cacheKey(name)
  const display = normalizeItemName(name)
  const local = localKnowledge(name)

  // PRIMARY: the committed database. Answered here, an item costs no cache read, no request
  // and no negative-cache entry — negative caching now describes ONLY keys the DB lacks.
  // `cached: true` because this is knowledge we already had, not a fresh network lookup.
  const fromDb = dbKnowledge(key, display)
  if (fromDb) return { ...mergeLocal(fromDb, local), cached: true }

  const cache = knowledge.load()
  const cached = cache.get(key)
  if (cached && knowledge.hit(cached)) {
    // Re-merge local in case the dataset changed since the cache was written.
    return { ...mergeLocal(cached.data, local), cached: true }
  }

  // Build a knowledge record + persist it to the cache. `extra` carries the
  // notFound/offline flag (or the parsed fields on success). Local posky is always merged.
  const finish = (extra: Partial<Omit<ItemKnowledge, 'cached' | 'name'>>): ItemKnowledge => {
    const base = mergeLocal(
      { name: display, lore: false, quest: (local?.length ?? 0) > 0, questUses: [], ...extra },
      local
    )
    const data: ItemKnowledge = { ...base, cached: false }
    cache.set(key, { at: Date.now(), data })
    knowledge.scheduleSave()
    return data
  }

  // Serialize wiki requests through this service's queue with polite spacing.
  const run = wiki.enqueue(async (): Promise<ItemKnowledge> => {
    const res = await resolvePage(display)
    if (res.status === 'offline') return finish({ offline: true }) // network failed — retry soon
    if (res.status === 'none') return finish({ notFound: true }) // zero search hits — real negative
    const wt = await wiki.fetchWikitext(res.title)
    if (wt === null) return finish({ offline: true }) // network failed on the page fetch
    if (wt === '') return finish({ notFound: true }) // page missing
    return finish({ page: res.title, ...parseItemWikitext(display, wt) })
  })

  try {
    return await run
  } catch (err) {
    logError('main:itemLookup', { message: `lookup failed for ${display}`, err })
    // Degrade to an offline record (still carries local posky) — but don't persist it as a
    // negative; a thrown error is transient, so the next call should retry the network.
    return { ...mergeLocal({ name: display, lore: false, quest: (local?.length ?? 0) > 0, questUses: [], offline: true }, local), cached: false }
  }
}

/**
 * Fire-and-forget prefetch: warm the cache for a freshly-looted item in the background
 * so the answer is ready by the time the user clicks. No-op if already cached. Throttled
 * naturally by this service's serialized queue.
 */
export function prefetchItem(name: string): void {
  const key = cacheKey(name)
  if (itemDb().has(key)) return // the committed DB already answers this — nothing to warm
  const cached = knowledge.load().get(key)
  if (cached && knowledge.hit(cached)) return
  void lookupItem(name).catch(() => {
    /* prefetch errors are silent — the interactive lookup will retry + surface state */
  })
}
