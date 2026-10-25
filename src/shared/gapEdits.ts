// shared/gapEdits.ts — a Gaps row corrected by hand (owner, 2026-10-23: "Perhaps we should be able to
// EDIT values in the gaps tab?"). An edit rides on the row, keyed as the Done marks are (`doneKey`),
// so the log's own name still finds it: the row shows the edited name, and Copy writes the edited
// values into the page text, the draft and the live merge alike. Reset drops it; the log is untouched.

import { doneKey, type GapDomain, type GapRow } from './gaps'
import { npcImageName } from './mobPageTitle'

export interface GapEdit {
  /** The name the page should carry (a template's `name` / `itemname`, a quest's title). */
  name?: string
  /** Page field → value, as typed (`level`, `zone`, a quest's `Starts In`). */
  fields?: Record<string, string>
  /** `mob`: the player says the name is an NPC, not a player (clears "may be a player"). */
  kind?: 'mob'
  /** The player says the name is its own, not a misspelling of the near name (owner, 2026-10-24: Pyrosilk Lined Shoes is not Cryosilk Lined Shoes): no "Probably", no redirect. */
  distinct?: true
}

/** Every edit of one character, by `doneKey`. */
export type GapEditMap = Readonly<Record<string, GapEdit>>

export interface EditField {
  key: string
  label: string
}

const NPC_FIELDS: EditField[] = [
  { key: 'level', label: 'Level' },
  { key: 'race', label: 'Race' },
  { key: 'class', label: 'Class' },
  { key: 'zone', label: 'Zone' },
  { key: 'location', label: 'Location' }
]

/** The fields an edit can set, per domain: what Copy writes for that page kind. */
export const EDIT_FIELDS: Readonly<Partial<Record<GapDomain, readonly EditField[]>>> = {
  mob: NPC_FIELDS,
  merchant: NPC_FIELDS,
  item: [],
  // A spell: its name only, so a misread window can be put right (owner, 2026-10-24: "why can't i edit it?").
  spell: [],
  quest: [
    { key: 'Starts In', label: 'Starts In' },
    { key: 'Quest Giver', label: 'Quest Giver' },
    { key: 'Minimum Level', label: 'Minimum Level' }
  ]
}

/** Whether a row's domain takes edits at all (a name is always editable there). */
export const editable = (row: GapRow): boolean => EDIT_FIELDS[row.domain] !== undefined

const clean = (v: string | undefined): string => (v ?? '').trim()

/** An edit with its blank values dropped; null when nothing is left. */
export function tidyEdit(e: GapEdit): GapEdit | null {
  const fields: Record<string, string> = Object.fromEntries(
    Object.entries(e.fields ?? {})
      .map(([k, v]): [string, string] => [k, clean(v)])
      .filter(([, v]) => v !== '')
  )
  const out: GapEdit = {
    ...(clean(e.name) === '' ? {} : { name: clean(e.name) }),
    ...(Object.keys(fields).length === 0 ? {} : { fields }),
    ...(e.kind === undefined ? {} : { kind: e.kind }),
    ...(e.distinct === true ? { distinct: true as const } : {})
  }
  return Object.keys(out).length === 0 ? null : out
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * A stored edit as the rows may read it: a name and field values only when they are text, the two
 * marks only in their one shape; undefined when nothing usable is left. The store itself is never
 * rewritten (localStorage can hold anything a hand or an older build put there), so Copy, the held
 * lookup and the map links never meet a value that is no string (owner, 2026-10-25: "make sure that if
 * a user changes the values it doesn't break anything").
 */
export function readEdit(raw: unknown): GapEdit | undefined {
  if (!isRecord(raw)) return undefined
  const fields = isRecord(raw.fields) ? Object.entries(raw.fields).filter((e): e is [string, string] => typeof e[1] === 'string') : []
  const out: GapEdit = {
    ...(typeof raw.name === 'string' && raw.name.trim() !== '' ? { name: raw.name } : {}),
    ...(fields.length === 0 ? {} : { fields: Object.fromEntries(fields) }),
    ...(raw.kind === 'mob' ? { kind: 'mob' as const } : {}),
    ...(raw.distinct === true ? { distinct: true as const } : {})
  }
  return Object.keys(out).length === 0 ? undefined : out
}

/** The rows with their edits riding on them; "This is a mob" clears "may be a player". */
export function withGapEdits(rows: readonly GapRow[], edits: GapEditMap): GapRow[] {
  if (Object.keys(edits).length === 0) return rows as GapRow[]
  return rows.map((row) => {
    const edit = readEdit(edits[doneKey(row)])
    if (edit === undefined) return row
    const out: GapRow = { ...row, edit, ...(edit.kind === 'mob' ? { maybePlayer: false } : {}) }
    if (edit.distinct === true) delete out.suggest
    return out
  })
}

/** The name a row shows and its links use: the edited one, else the log's. */
export const shownName = (row: GapRow): string => row.edit?.name ?? row.name

/** The row as its links and its quest read see it: under its edited name. */
export const shownRow = (row: GapRow): GapRow => (row.edit?.name === undefined ? row : { ...row, name: row.edit.name })

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `| key   = value` lines of a template page, the padding kept. */
function setTemplateField(text: string, key: string, value: string): string {
  return text.replace(new RegExp(`^(\\|\\s*${escape(key)}\\s*=[ \\t]*).*$`, 'm'), (_m, head: string) => `${head}${value}`)
}

/** A quest's top-table row: the value line under `! ''' Label: '''` (`Starts In` is `Start Zone` too). */
function setTopRow(text: string, label: string, value: string): string {
  const labels = label === 'Starts In' ? 'Starts In|Start Zone' : escape(label)
  return text.replace(new RegExp(`(!\\s*'''\\s*(?:${labels}):\\s*'''\\s*\\n\\|)[^\\n]*`), (_m, head: string) => `${head} ${value}`)
}

/** The edited name into a template page: `name` (and an image named after the old name) or `itemname`. */
function setName(text: string, row: GapRow, name: string): string {
  if (row.domain === 'item') return setTemplateField(text, 'itemname', name)
  if (row.domain === 'spell') return setTemplateField(text, 'spellname', name)
  if (row.domain !== 'mob' && row.domain !== 'merchant') return text
  const renamed = setTemplateField(text, 'name', name)
  return renamed.replace(new RegExp(`^(\\|\\s*imagefilename\\s*=[ \\t]*)${escape(npcImageName(row.name))}$`, 'm'), (_m, head: string) => `${head}${npcImageName(name)}`)
}

/** Copy's page text with the row's edits written in; unchanged for a row without one. */
export function applyEditText(text: string, row: GapRow): string {
  const edit = row.edit
  if (edit === undefined) return text
  let out = edit.name === undefined ? text : setName(text, row, edit.name)
  for (const [key, value] of Object.entries(edit.fields ?? {})) {
    out = row.domain === 'quest' ? setTopRow(out, key, value) : setTemplateField(out, key, value)
  }
  return out
}
