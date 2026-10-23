// deltaRedirects.ts — the delta's step for wiki redirects beyond mobs (owner, 2026-10-22: "no one
// told you to restrict it to mobs only"). The cached list is folded with this delta's pages first,
// then every redirect that lands on an item or spell page becomes that record's otherNames, and every
// one on an item page a drop alias (sources/mobRedirects.ts). Apart from scrape-delta.mts, which sits
// at its size and complexity ceilings.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { itemKey, type ItemDbFile } from '../../src/main/itemsDb'
import { keepRedirectCache, type PageTexts } from './deltaPages'
import { applyItemOtherNames, applySpellOtherNames, readRedirectCache, withItemRedirectAliases, type NamedSpell, type Redirect } from './mobRedirects'

/** The drop aliases file (the Gaps tab's): a looted name the wiki redirects is the item it lands on. */
const DROP_GROUPS_FILE = 'src/renderer/src/data/eqlegends/dropGroups.json'

function writeAtomic(path: string, text: string): void {
  writeFileSync(`${path}.tmp`, text, 'utf8')
  renameSync(`${path}.tmp`, path)
}

/**
 * The cached list after the pages this delta read, applied to the folded items and spells before they
 * are written, to spells.json when the delta folded no spell page, and to the drop aliases.
 */
export function redirectsOntoData(paths: { redirectCache: string; root: string; spells: string }, pages: PageTexts, items: ItemDbFile['items'], spells: NamedSpell[] | undefined): void {
  keepRedirectCache(paths.redirectCache, pages)
  const redirects = readRedirectCache(paths.redirectCache)?.redirects ?? []
  applyItemOtherNames(items, redirects, itemKey)
  if (spells !== undefined) applySpellOtherNames(spells, redirects)
  else redirectsOntoSpellFile(paths.spells, redirects)
  redirectsOntoDropAliases(resolve(paths.root, DROP_GROUPS_FILE), items, redirects)
}

/** spells.json's otherNames, written only when a name changed, as the spells pass writes it. */
function redirectsOntoSpellFile(path: string, redirects: readonly Redirect[]): void {
  if (!existsSync(path)) return
  const file = JSON.parse(readFileSync(path, 'utf8')) as { spells: NamedSpell[] }
  const names = (): string => JSON.stringify(file.spells.map((s) => s.otherNames ?? []))
  const before = names()
  applySpellOtherNames(file.spells, redirects)
  if (names() !== before) writeAtomic(path, JSON.stringify(file, null, 2))
}

/** dropGroups.json's aliases (absent on a branch without the Gaps tab), written only when one changed, as scrape-drop-groups writes it. */
function redirectsOntoDropAliases(path: string, items: ItemDbFile['items'], redirects: readonly Redirect[]): void {
  if (!existsSync(path)) return
  const file = JSON.parse(readFileSync(path, 'utf8')) as { aliases?: Record<string, string> }
  const before = JSON.stringify(file.aliases ?? {})
  file.aliases = withItemRedirectAliases(file.aliases ?? {}, items, redirects, itemKey)
  if (JSON.stringify(file.aliases) !== before) writeAtomic(path, JSON.stringify(file, null, 1) + '\n')
}
