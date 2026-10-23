// itemOtherNames.ts — an item record's `otherNames` (the wiki redirects that land on its page) as
// lookup keys of that record: `Halfling Blood` finds `Vial of Halfling Blood` (owner, 2026-10-22:
// "no one told you to restrict it to mobs only"). The mobs' arrangement (mobLookupLocal.ts): a
// redirect name fills only a FREE key, never displacing a record of its own.
//
// FOR LOOKUPS BY NAME ONLY. A walk over every item (a planner index, the zone ports) keeps reading
// the file's own map, so no page is visited twice.
//
// Kept byte-identical on every branch that reads it (WORKFLOW.md, shared code across branches).

import { itemKey } from './itemsDb'

interface Named {
  page: string
  otherNames?: readonly string[]
}

const built = new WeakMap<object, object>()

/**
 * `items` with each record's other names added as keys of that record, filling only free keys.
 * Non-mutating and built once per map; the same map when no record carries other names.
 */
export function itemsByAnyName<T extends Named>(items: Readonly<Record<string, T>>): Readonly<Record<string, T>> {
  const known = built.get(items) as Readonly<Record<string, T>> | undefined
  if (known !== undefined) return known
  let out: Record<string, T> | null = null
  for (const entry of Object.values(items)) {
    for (const name of entry.otherNames ?? []) {
      const key = itemKey(name)
      if (key === '' || key in items || (out !== null && key in out)) continue
      out ??= { ...items }
      out[key] = entry
    }
  }
  const result = out ?? items
  built.set(items, result)
  return result
}
