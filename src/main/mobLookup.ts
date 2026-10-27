// mobLookup.ts — "what does this thing drop" knowledge service (Task #63).
//
// Answers, for a mob the player just `/con`ed, what it drops — the "I sized this up, is it
// worth killing" question. Keyed off the parsed `consider` family (main/log/parser.ts).
//
// DESIGN — deliberately the SAME architecture as itemLookup.ts (Task #53), field for field, so
// there is one shape of knowledge service in this tree and not two:
//   1. LOCAL-FIRST, three times over. The drop table is NOT fetched per mob in the normal case.
//      a) The scraped MOB CATALOG (`mobs.json`, scripts/scrape-mobs.ts) — the DEFINITIVE drop
//         source, and the one that answers a `/con` instantly and offline. The wiki's drop list
//         is what the mob can drop; it is static content, so it is scraped once and committed,
//         exactly as posky.json and quests.json are.
//      b) YOUR OWN loot history for that mob (`MobLootIndex`, mobLookupParse.ts). The loot
//         family carries the corpse's mob name in `source`, so the app knows what this mob has
//         actually handed YOU, with counts and a last-seen. This is CORROBORATION, not the drop
//         table: it annotates a listed drop with "and you've had 3", and only contributes names
//         of its own for items the page doesn't list (see the UI ordering rule below).
//      c) The scraped wiki QUEST CATALOG's `relatedNpcs` (quests.json), which ties 1,121
//         distinct NPC names to the quests that mention them — so a quest-relevant mob says so
//         with no network at all.
//   2. WIKI lookup — ONLY ON A COPY CLICK (owner, 2026-10-26: "the app should not be hitting the
//      WIKI ever except (delta refresh before build, user clicks COPY on an item and it does the
//      lookup)"). `lookupMob`, which every automatic caller uses (the con card, hover cards, the
//      mob page, the engine's miss announcements), never reaches the network; `lookupMobOnCopy`
//      is the one door to the wiki and only the Gaps tab's Copy click opens it
//      (gapCopyLookup.ts), for a mob the catalog doesn't have. Same MediaWiki
//      API: search → resolve the mob page → parse `|known_loot` / `|level` / `|zone` /
//      `|related_quests` (parseMobWikitext). Polite: a single serialized in-flight queue with a
//      150ms spacing and the SAME Retry-After cooldown contract — a 429/5xx silences the whole
//      queue until the server's cooldown expires (AGENTS.md "Scraper etiquette" is a LAW).
//   3. PERSISTENT CACHE in userData (versioned JSON), negative + offline TTLs, written by that
//      Copy lookup only and read by both. A catalog hit never touches the cache OR the network.
//
// UI ORDERING (stated here because it is a claim about AUTHORITY, not a layout preference):
// every surface leads with the wiki drop table and annotates it with your counts; items only
// your history has follow as a clearly-labeled secondary list.
//
// WHY ITS OWN QUEUE AND COOLDOWN rather than importing itemLookup's: they are separate
// FILES by ownership and separate CACHES by content (a mob page and an item page share
// nothing), and two serialized queues each spaced 150ms is still two requests in flight at
// most — comfortably polite. The cooldown contract is per-service for the same reason it is
// per-service in itemLookup: the state is "this client was told to be quiet", and honoring it
// twice independently can only make us quieter, never louder.
//
// HONESTY (law 1): every field of a MobKnowledge is present only because a source stated it. A
// mob with no wiki page comes back `notFound` with whatever the two local sources knew — never
// a synthesized drop list, never a guessed level.
//
// The PURE half (wikitext → facts, the own-loot index, the name key) is mobLookupParse.ts,
// unit-tested against verbatim real wikitext in tests/considerWindows.test.mts.

import { logError } from './errorLog'
// The wiki client and the userData cache are shared with itemLookup.ts as SPELLINGS; this service
// creates its own instance of each, so the state (cooldown, queue, file, save latch) stays its own.
import { createWikiClient } from './wikiClient'
import { createKnowledgeCache } from './knowledgeCache'
import { MobLootIndex, mobKey, parseMobWikitext } from './mobLookupParse'
import { annotateDropEras } from './mobDropEra'
import { knowledgeFromCatalog, localMobEntry, mergeLocalKnowledge } from './mobLookupLocal'
import { type MobIdentity, poisonedAliasKeys, resolveMobIdentity } from './mobAliases'
import type { MobKnowledge } from '../shared/types'
import { hasMobTemplate } from '../shared/wikiTemplates'

export { MobLootIndex, mobKey, parseMobWikitext }

/** Cache schema version. Bump whenever the SHAPE of a stored MobKnowledge changes — positives
 *  never expire, so a stale shape would otherwise be served forever. */
const CACHE_VERSION = 1

// ---- LOCAL 1: the shared own-loot index ---------------------------------------
//
// ONE instance for the whole process: the ConsiderModule folds every loot event into it (it is
// character-scoped + epoch-scoped and reset alongside the other module state), and `lookupMob`
// reads it, so the IPC hover card and the module's own enrichment can never disagree.
export const ownLoot = new MobLootIndex()

// ---- LOCAL 1 + 2: the COMMITTED datasets ---------------------------------------
//
// The mob catalog (definitive drop table) and the quest catalog's relatedNpcs cross-ref both
// live in mobLookupLocal.ts — electron-free, so tests can drive the SHIPPED indexes directly.
// Re-exported here so this module stays the one door callers knock on.
export { localMobEntry, localMobQuests, MOB_CATALOG_SIZE } from './mobLookupLocal'

// ---- wiki client (search → wikitext) ------------------------------------------

/** This service's OWN client — its own Retry-After cooldown and its own serialized, politely
 *  spaced queue (wikiClient.ts; the header above says why it is not itemLookup's). Read only
 *  inside `lookupMobOnCopy` (tests/wikiTraffic.test.mts pins that). */
const wiki = createWikiClient('mob copy')

/**
 * Resolve a mob name to candidate wiki page titles. Distinguishes a NETWORK failure ('offline')
 * from a genuine ZERO-hit search ('none' — a real negative worth caching for the full TTL).
 *
 * Returns the EXACT case-insensitive title match first when there is one, else the top hit —
 * but see `lookupMob`: unlike an item, a non-exact top hit is only ACCEPTED once the fetched
 * page's own `|name` field agrees with the mob we asked about. Mob names are short, generic and
 * heavily overlapping ("A noxious spider" ⇒ 0 hits; "Statham" ⇒ 0 hits; a fuzzy hit could
 * easily be a different creature), and attaching one mob's drop list to another would be
 * exactly the kind of invention law 1 forbids.
 */
type ResolveResult =
  | { status: 'ok'; title: string; exact: boolean }
  | { status: 'none' }
  | { status: 'offline' }
async function resolvePage(id: MobIdentity): Promise<ResolveResult> {
  const hits = await wiki.searchTitles(id.canonical)
  if (hits === null) return { status: 'offline' }
  if (hits.length === 0) return { status: 'none' }
  // "Exact" means ANY spelling the roster states for this creature (JOS-142) — for the 7.9k
  // catalog mobs and the 30 name-identical roster targets that key list is one key, so this is
  // the same test it has always been.
  const exact = hits.find((h) => identityMatches(id, h.title))
  if (exact) return { status: 'ok', title: exact.title, exact: true }
  return { status: 'ok', title: hits[0].title, exact: false }
}

/** True when `name` is one of the spellings this identity answers to. */
function identityMatches(id: MobIdentity, name: string): boolean {
  return id.keys.includes(mobKey(name))
}

// ---- persistent cache (userData, versioned) -----------------------------------

/** `mob-knowledge-cache.json` — the WIKI half only (knowledgeCache.ts); local sources are
 *  re-merged on every read so they stay current. A mob's drop table is static wiki content, so
 *  positives don't expire. */
const knowledge = createKnowledgeCache<MobKnowledge>({
  name: 'mob-knowledge',
  version: CACHE_VERSION,
  tag: 'main:mobLookup'
})

// ---- merge + public API -------------------------------------------------------

/**
 * The LOCAL merge, bound to this process's shared own-loot index. The logic itself lives in
 * mobLookupLocal.ts so the node test runner can drive it (see `mergeLocalKnowledge`).
 *
 * AND THE ERA ANNOTATION (JOS-377), which is here because this is the CONFLUENCE: every exit
 * from the lookups — the catalog hit, the cache hit, the local miss, the freshly-parsed wiki page
 * and the thrown-error degrade — returns through this one function, so both knowledge paths the ticket names are
 * annotated by one call site instead of two that can drift. It runs on EVERY read and is never
 * persisted, exactly like the local merge below it: mob-cache positives never expire, so an era
 * baked into a cached record would be frozen at whatever the corpus said that day.
 */
function mergeLocal(base: MobKnowledge, id: MobIdentity): MobKnowledge {
  return annotateDropEras(mergeLocalKnowledge(base, id, ownLoot))
}

/**
 * REPAIR THE POISONED NEGATIVES (JOS-142). Which entries qualify — and why the rule is exactly
 * "non-canonical keys, negatives only" — is `poisonedAliasKeys` in mobAliases.ts, which is pure
 * so it can be tested; this is the deletion.
 *
 * Runs once per resolution of an aliased identity, ahead of the catalog read, so a page the old
 * build cached as `notFound` under the log spelling stops being a wrong answer rather than
 * merely stopping being consulted. No CACHE_VERSION bump: the cache SHAPE is unchanged, and a
 * version bump would throw away every user's whole mob cache to repair at most two entries.
 */
function repairAliasCache(id: MobIdentity): void {
  const cache = knowledge.load()
  const poisoned = poisonedAliasKeys(id, cache)
  if (poisoned.length === 0) return
  for (const key of poisoned) cache.delete(key)
  knowledge.scheduleSave()
}

/**
 * THE ALIAS BOUNDARY IS HERE AND NOWHERE ELSE (JOS-142). Every surface that shows mob knowledge
 * — the boss card, the mob page, the Overview current-mob card, the overlay hover card, the
 * consider ring's enrichment — arrives through `lookupMob`/`knownMob`/`lookupMobOnCopy`, and each
 * resolves the identity here on the way in, which fixes both halves of the divergence at once: the
 * ROSTER spelling now finds loot filed under the LOG spelling, and the LOG spelling now finds the
 * catalog page filed under the ROSTER spelling. `display` is untouched throughout and is what the
 * record reports as its `name`, so the page still reads back exactly what the log said
 * (world-model law 2).
 */
function identityOf(name: string): { display: string; id: MobIdentity; ask: string; key: string } {
  const display = name.trim()
  const id = resolveMobIdentity(display)
  if (id.aliased) repairAliasCache(id)
  // What the CATALOG, the CACHE and the WIKI are asked. Identical to `display` for every mob the
  // roster does not spell two ways, which is all of them but two.
  return { display, id, ask: id.canonical, key: mobKey(id.canonical) }
}

/**
 * What the app already holds for a mob, with no request: the committed catalog (the definitive
 * drop table), else an answer a Copy lookup cached (a positive, a fresh offline miss, or a real
 * negative of any age, since nothing automatic will ask the wiki again). Null when neither has it.
 */
export function knownMob(name: string): MobKnowledge | null {
  const { display, id, ask, key } = identityOf(name)
  const entry = localMobEntry(ask)
  if (entry) return mergeLocal(knowledgeFromCatalog(display, entry), id)
  const cached = knowledge.load().get(key)
  if (cached && (knowledge.hit(cached) || cached.data.notFound === true)) return mergeLocal({ ...cached.data, cached: true }, id)
  return null
}

/**
 * Look up a mob's drop knowledge for every AUTOMATIC caller: `knownMob`, else a record of what the
 * local sources (your loot, the quest catalog) know. NEVER touches the network (owner,
 * 2026-10-26); the mob's wiki page is read only by `lookupMobOnCopy`. A miss carries neither
 * `offline` nor `notFound`: the wiki was not asked.
 */
export function lookupMob(name: string): Promise<MobKnowledge> {
  const display = name.trim()
  return Promise.resolve(knownMob(display) ?? mergeLocal({ name: display, cached: false }, resolveMobIdentity(display)))
}

/**
 * THE ONE DOOR TO THE WIKI for a mob: the Gaps tab's Copy click (gapCopyLookup.ts) and nothing
 * else. Local-first, then cache, then a serialized, politely-spaced wiki lookup, whose answer is
 * cached for every later `lookupMob`. NEVER throws — failures degrade to a cached-negative /
 * offline record that still carries whatever the local sources knew.
 */
export async function lookupMobOnCopy(name: string): Promise<MobKnowledge> {
  const { display, id, ask, key } = identityOf(name)

  // LOCAL 1 FIRST: the committed catalog is the definitive drop table and needs no network, no
  // cache and no queue.
  const entry = localMobEntry(ask)
  if (entry) return mergeLocal(knowledgeFromCatalog(display, entry), id)

  const cache = knowledge.load()
  const cached = cache.get(key)
  if (cached && knowledge.hit(cached)) return mergeLocal({ ...cached.data, cached: true }, id)

  /** Build + persist the WIKI half, then merge the (never-cached) local half on top. */
  const finish = (extra: Partial<MobKnowledge>): MobKnowledge => {
    const data: MobKnowledge = { name: display, cached: false, ...extra }
    cache.set(key, { at: Date.now(), data })
    knowledge.scheduleSave()
    return mergeLocal(data, id)
  }

  const run = wiki.enqueue(async (): Promise<MobKnowledge> => {
    const res = await resolvePage(id)
    if (res.status === 'offline') return finish({ offline: true })
    if (res.status === 'none') return finish({ notFound: true })
    const wt = await wiki.fetchWikitext(res.title)
    if (wt === null) return finish({ offline: true })
    if (wt === '') return finish({ notFound: true })
    const facts = parseMobWikitext(wt)
    // IDENTITY GATE for a non-exact search hit: accept it only when the page says it IS this
    // mob. Search happily returns a cousin for a name it doesn't have, and hanging that
    // cousin's drop table off this mob would be inventing loot (law 1). "Is this mob" now spans
    // the roster's stated spellings, which for an unaliased name is the one key it always was.
    if (!res.exact && !identityMatches(id, facts.pageName ?? res.title)) return finish({ notFound: true })
    // A page of free text (no mob template) is a page all the same: the Gaps tab says fix it, never create another.
    return finish({ page: res.title, ...facts, ...(hasMobTemplate(wt) ? {} : { notMobPage: true }) })
  })

  try {
    return await run
  } catch (err) {
    logError('main:mobLookup', { message: `lookup failed for ${display}`, err })
    // A thrown error is transient — degrade to offline WITHOUT persisting a negative, so the
    // next call retries the network (same rule itemLookup follows).
    return mergeLocal({ name: display, cached: false, offline: true }, id)
  }
}
