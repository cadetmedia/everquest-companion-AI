// verifyGapsView.mts — the Gaps tab's data, derived from a headless fold exactly as the tab derives
// it (renderer features/gaps/useGapsData.ts and GapsView.tsx), with the same src/shared functions:
// the engine rows joined with the faction, drop and image domains, the page builders' extras (the
// wiki's zone spellings, catalog mobs, common loot, vendor places), the install's spell facts and the
// item pages' mobs as main answers them. React is the only thing left out.
//
// The renderer modules that read `@shared/*` (useGapsData, mobSearch, heldCounts) are not imported:
// their constants are rebuilt here from the same data files, and `heldCounts.ts` is loaded at run
// time by path (it is plain code; a static import would pull the renderer into the node typecheck).

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { withFactionRows } from '../../src/shared/gapFactions'
import { lootedItemNames, withDropRows, type DropAliases, type DropGroups } from '../../src/shared/gapDrops'
import { withImageRows } from '../../src/shared/gapImages'
import { catalogNameTest, commonLootNames, vendorFinder } from '../../src/shared/gapMobPage'
import { catalogZoneCounts, wikiZoneNamer } from '../../src/shared/gapWikiZone'
import { heldIndex, type HeldIndex } from '../../src/shared/gapHeld'
import type { ClientSpellFacts, GapRow, GapsSnap } from '../../src/shared/gaps'
import { killIndex, type KillMap } from '../../src/shared/kills'
import { itemBaseName } from '../../src/shared/itemStats'
import { ownershipPayload } from '../../src/shared/planner/ownership'
import { isOutputFileName, outputKind, preferredOutputFile } from '../../src/shared/outputs/kinds'
import type { LootEvent, MobEntry } from '../../src/shared/types'
import { stillNeeded, wikiPageText, type MobSightings, type PageExtras } from '../../src/shared/wikiPage'
import { spellFactsFrom } from '../../src/main/gapSpellFacts'
import { itemPageMobs } from '../../src/main/gapItemMobs'
import { parseInventoryDump } from '../../src/main/outputs/inventoryParse'
import mobsJson from '../../src/renderer/src/data/eqlegends/mobs.json'
import dropGroupsJson from '../../src/renderer/src/data/eqlegends/dropGroups.json'
import { REPO_ROOT, type FoldOut } from './verifyGapsFold.mjs'

// ---- useGapsData's module constants, from the same files --------------------------------------

/** mobSearch.ts `MOB_CATALOG`. */
export const MOB_CATALOG: MobEntry[] = (mobsJson as unknown as { mobs?: MobEntry[] }).mobs ?? []
/** useGapsData.ts `GAPS_DATA_DATE`. */
export const GAPS_DATA_DATE = ((mobsJson as { scrapedAt?: string }).scrapedAt ?? '').slice(0, 10)
const DROPS = dropGroupsJson as unknown as { groups: DropGroups; aliases?: DropAliases }
export const IS_MOB = catalogNameTest(MOB_CATALOG)
/** useGapsData.ts `PAGE_EXTRAS`. */
export const PAGE_EXTRAS: PageExtras = {
  zoneName: wikiZoneNamer(catalogZoneCounts(MOB_CATALOG)),
  isMob: IS_MOB,
  commonLoot: commonLootNames(MOB_CATALOG),
  vendorAt: vendorFinder(MOB_CATALOG)
}

/** The tab, as one character's fold makes it. */
export interface TabView {
  fold: FoldOut
  /** The engine's own snapshot (its kill factions and mob points feed the pages). */
  engine: GapsSnap
  /** The engine's rows with the derived domains joined in. */
  snap: GapsSnap
  loot: LootEvent[]
  /** `killIndex` of the kills snapshot, as the pages read it. */
  kills: KillMap
  spellFacts: Record<string, ClientSpellFacts>
  pageText: (row: GapRow) => string
  needed: (row: GapRow) => string[]
}

/** main's `gaps:itemMobs` answer, keyed as lib/gapItemMobs.ts keys it. */
function itemMobsFor(loot: readonly LootEvent[]): Map<string, readonly string[] | null> {
  const answer = itemPageMobs(lootedItemNames(loot))
  return new Map(Object.entries(answer).map(([name, mobs]) => [itemBaseName(name).toLowerCase(), mobs]))
}

/** main's `gaps:spellFacts` answer (ipc/gapVerdicts.ts `clientSpellFacts`) for the spell rows. */
function spellFactsFor(eqRoot: string, rows: readonly GapRow[]): Record<string, ClientSpellFacts> {
  const us = join(eqRoot, 'spells_us.txt')
  const str = join(eqRoot, 'spells_us_str.txt')
  if (!existsSync(us)) return {}
  const names = rows.filter((r) => r.domain === 'spell').map((r) => r.name)
  return spellFactsFrom(readFileSync(us, 'latin1'), existsSync(str) ? readFileSync(str, 'latin1') : '', names)
}

/** useGapsData's derivation and GapsView's page callbacks, over one fold. */
export function tabView(fold: FoldOut, eqRoot: string): TabView {
  const engine = fold.gaps
  const loot = fold.loot
  const killMobs = fold.kills.mobs
  const wiki = { catalog: MOB_CATALOG, groups: DROPS.groups, itemMobs: itemMobsFor(loot), aliases: DROPS.aliases ?? {} }
  const derived = withDropRows(withFactionRows(engine, MOB_CATALOG), loot, wiki)
  const snap = withImageRows(derived, { kills: killMobs, loot, cons: fold.consider }, MOB_CATALOG)
  const kills = killIndex(killMobs)
  const spellFacts = spellFactsFor(eqRoot, snap.rows)
  const sightings: MobSightings & PageExtras = {
    killFactions: engine.killFactions,
    mobLocs: engine.mobLocs,
    mobSpecials: engine.mobSpecials,
    mobCoin: engine.mobCoin,
    ...PAGE_EXTRAS,
    spellFacts
  }
  return {
    fold,
    engine,
    snap,
    loot,
    kills,
    spellFacts,
    pageText: (row) => wikiPageText(row, loot, kills, sightings),
    needed: (row) => stillNeeded(row, loot, kills, sightings)
  }
}

// ---- held now (useHeld.ts over useGearOwnership) --------------------------------------------------

type HeldFold = (loot: readonly LootEvent[], after: number) => Record<string, number>

/** The inventory export main's `gearOwnership` would read: the EQ folder's, this character's first. */
export function inventoryExport(eqRoot: string, name: string, server: string): { path: string; loadedAt: string } | null {
  if (!existsSync(eqRoot)) return null
  const def = outputKind('inventory')
  const files = readdirSync(eqRoot)
    .filter((f) => isOutputFileName(def, f))
    .map((f) => ({ f, mtime: statSync(join(eqRoot, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  const pick = preferredOutputFile(
    files.map((x) => x.f),
    def,
    name,
    server
  )
  if (pick === null) return null
  const path = join(eqRoot, pick)
  return { path, loadedAt: new Date(statSync(path).mtimeMs).toISOString() }
}

/** useHeld's index: the export, plus this character's loot since it, less destroys since. */
export async function heldNow(eqRoot: string, fold: FoldOut): Promise<{ index: HeldIndex; exportPath: string } | null> {
  const found = inventoryExport(eqRoot, fold.meta.character, fold.meta.server)
  if (found === null) return null
  const payload = ownershipPayload({ ...found, dump: parseInventoryDump(readFileSync(found.path, 'utf8')) })
  const url = pathToFileURL(join(REPO_ROOT, 'src', 'renderer', 'src', 'features', 'posky', 'heldCounts.ts')).href
  const held = (await import(url)) as { computeHeldCountsAfter: HeldFold; computeDestroyedAfter: HeldFold }
  const at = Date.parse(found.loadedAt)
  return { index: heldIndex(payload, held.computeHeldCountsAfter(fold.loot, at), held.computeDestroyedAfter(fold.loot, at)), exportPath: found.path }
}
