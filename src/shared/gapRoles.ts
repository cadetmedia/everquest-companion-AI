// shared/gapRoles.ts — an NPC's role from the client's target line (owner, 2026-10-22; engine
// gaps_roles.rs serves it as a Mobs row's `role`): `Merchant`, `Banker`, `<Class> GM`. Copy wiki page
// writes it as the page's `| class =` the way the wiki's own mob pages do, measured on the cached
// pages (2026-10-22): `[[Merchant]]` 1,290, `[[Banker]]` 35, `GM [[Warrior]]` (and every class) 393
// against 3 written `[[Wizard]] GM`. A merchant's page takes the merchant layout.

// Beside it, the other source a row's facts state: where an item was fished.

import { wikiZoneLink } from './gapWikiZone'

/** A row's role, as the engine serves it; read here rather than typed on `GapRow` (its size bar). */
export const roleOf = (row: object): string | undefined => (row as { role?: string }).role

/** The game's class names as the wiki's page titles spell them, where they differ. */
const CLASS_PAGE: Readonly<Record<string, string>> = { Shadowknight: 'Shadow Knight' }

/** `| class =` for a role: `[[Banker]]`, `[[Merchant]]`, `GM [[Shadow Knight]]`; undefined for none. */
export function roleClass(role: string | undefined): string | undefined {
  if (role === undefined) return undefined
  const gm = /^(.+) GM$/.exec(role)
  if (gm !== null) return `GM [[${CLASS_PAGE[gm[1]] ?? gm[1]}]]`
  return `[[${role}]]`
}

/** `{ role }` for a row that has one, else nothing: a fact object's field. */
export function roleField(row: object): { role?: string } {
  const role = roleOf(row)
  return role === undefined ? {} : { role }
}

/** Fished in this many places or more, an item is caught almost anywhere: no zone list (the common-forage rule's spirit). */
export const FISHED_ANYWHERE = 5

/**
 * `Fished up in [[Lake Nerius]].`, as an item page's notes say a source with no field of its own
 * (owner, 2026-10-22: `You caught <item>!` is a source like a forage; engine gaps_fished.rs).
 */
export function fishedNote(zones: readonly string[]): string {
  const places = [...new Set(zones)]
  if (places.length >= FISHED_ANYWHERE) return 'Fished up in many zones.'
  return `Fished up in ${places.map(wikiZoneLink).join(' and ')}.`
}

/** The role in words for the row's details: `Banker (its target line)`. */
export const roleLine = (role: string | undefined): string[] => (role === undefined ? [] : [`Role: ${role} (the client's target line)`])
