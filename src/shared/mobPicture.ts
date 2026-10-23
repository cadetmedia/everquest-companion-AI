// mobPicture.ts — a pasted picture of a mob, for its wiki page's image (owner, 2026-10-21): what a
// save answers, and whether the picture shows the mob's nameplate. Pure; main does the saving and
// the OCR (src/main/ipc/shotPicture.ts).

import type { GapRow } from './gaps'
import { npcImageName } from './wikiPage'

/**
 * A row's picture file: an Images row's, named after the mob's in-game name (gapImages.ts; owner,
 * 2026-10-21: "yes name after real name not misspelling", `npc_a_lizardman_scout.png` for the page
 * A lizard man scout), else `npc_<the row's name>.png`. The nameplate check reads the row's name,
 * which for an Images row is the in-game one too.
 */
export function pictureFile(row: Pick<GapRow, 'domain' | 'name' | 'image'>): string {
  return row.domain === 'image' && row.image !== undefined ? row.image : npcImageName(row.name)
}

/**
 * The picture folder's layout (owner, 2026-10-22: "<dir-they-chose>/npc, <dir-they-chose>/item,
 * <dir-they-chose>/spell ... this way all items pasted get stored"): the chosen folder is the root,
 * each kind of picture in its own folder under it. A Lore tab sits beside its item window.
 */
export type PictureKind = 'npc' | 'item' | 'lore' | 'spell'
export const PICTURE_FOLDER: Readonly<Record<PictureKind, string>> = { npc: 'npc', item: 'item', lore: 'item', spell: 'spell' }

/** A name as the wiki's picture names write it: lower case, every run of other characters one `_`. */
const fileStem = (name: string): string => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'picture'

/**
 * The working copy an item or spell picture is kept under, in its kind's folder: `item_<name>.png`,
 * `item_<name>_lore.png`, `spell_<name>.png`, named as `npc_<name>.png` is. A new paste of the same
 * part replaces it (they are working copies, not wiki uploads).
 */
export function keptPictureFile(kind: Exclude<PictureKind, 'npc'>, name: string): string {
  const stem = fileStem(name)
  return kind === 'spell' ? `spell_${stem}.png` : kind === 'lore' ? `item_${stem}_lore.png` : `item_${stem}.png`
}

/** The picture an item paste's part is kept as: its window or its Lore tab; an icon alone is not kept. */
export const partPicture = (kind: 'window' | 'lore' | 'icon'): 'item' | 'lore' | undefined => (kind === 'window' ? 'item' : kind === 'lore' ? 'lore' : undefined)

/** The root a folder stands for: a kind's own folder (`<root>/npc`) stands for its parent. */
export function pictureRoot(dir: string): string {
  const m = /^(.*?)[\\/]+([^\\/]+)[\\/]*$/.exec(dir)
  if (m === null || m[1] === '' || !Object.values(PICTURE_FOLDER).includes(m[2].toLowerCase())) return dir
  // `C:\npc` stands for the drive's root, `C:\`, never the bare `C:` (the drive's current folder).
  return /^[A-Za-z]:$/.test(m[1]) ? `${m[1]}\\` : m[1]
}

/** What keeping an item or spell picture came to: written, no folder chosen yet, or why not. */
export type PictureKeep = { status: 'saved'; path: string } | { status: 'off' } | { status: 'error'; message: string }

/**
 * The pictures the player's picture folders hold (the auto-save folder, then the last folder saved
 * to), by lower-cased file name -> full path (owner, 2026-10-22: "sometimes i may put an image in
 * the directory, if I do, the tool should see that the image is there and not ask for it").
 */
export interface FolderPictures {
  /** The folders read, first wins on a name in both. */
  dirs: readonly string[]
  files: Readonly<Record<string, string>>
}

export const NO_FOLDER_PICTURES: FolderPictures = { dirs: [], files: {} }

/** A folder listing as `FolderPictures`: `.png` files only, any case; the first folder's file wins a name. */
export function folderPictures(listings: readonly { dir: string; files: readonly { name: string; path: string }[] }[]): FolderPictures {
  const files: Record<string, string> = {}
  for (const l of listings) {
    for (const f of l.files) {
      const key = f.name.toLowerCase()
      if (key.endsWith('.png') && files[key] === undefined) files[key] = f.path
    }
  }
  return { dirs: listings.map((l) => l.dir), files }
}

/**
 * Where the player holds a row's picture: saved from the tab (`saved`, by file name), else a file of
 * that name in a picture folder, in any case (Windows names are not case-sensitive). Undefined: none.
 */
export function heldPicture(file: string, saved: Readonly<Record<string, unknown>>, folder: FolderPictures): string | undefined {
  const inFolder = folder.files[file.toLowerCase()]
  if (inFolder !== undefined) return inFolder
  const s = saved[file]
  if (s === undefined) return undefined
  const path = s !== null && typeof s === 'object' && 'path' in s && typeof s.path === 'string' ? s.path : undefined
  // A save into a folder the listing read, and no longer there: the player deleted or moved it.
  return path !== undefined && listed(folder, path) ? undefined : (path ?? file)
}

/** Whether `path` sits directly in one of the folders the listing read (Windows: any case, either slash). */
function listed(folder: FolderPictures, path: string): boolean {
  const norm = (p: string): string => p.replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase()
  const dir = norm(path).replace(/\/[^/]*$/, '')
  return folder.dirs.some((d) => norm(d) === dir)
}

/**
 * The file name a picture is written under: no folder parts, no characters Windows refuses, and always
 * `.png` (main writes PNG bytes, and a renderer that asked for `x.bat` must not get one).
 */
export function pictureFileName(asked: string): string {
  // Code unit by code unit: control characters (below 32) and the ones Windows refuses become `_`.
  const units = Array.from({ length: asked.length }, (_, i) => asked.charCodeAt(i))
  const base = String.fromCharCode(...units.map((c) => (c < 32 || '\\/:*?"<>|'.includes(String.fromCharCode(c)) ? 95 : c)))
    .replace(/\.[^.]*$/, '')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 120)
  return `${base === '' ? 'picture' : base}.png`
}

/** What saving a pasted mob picture came to. */
export type PictureSave =
  /** `checkId` asks main for the nameplate check on the picture it already decoded. */
  | { status: 'saved'; path: string; checkId: number }
  /** The auto-save folder already holds this file name: replace it only when the player says. */
  | { status: 'exists'; path: string }
  | { status: 'cancelled' }
  /** Blank or near one colour: not a picture of anything. */
  | { status: 'blank' }
  | { status: 'error'; message: string }

const squash = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, '')

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}

/** The name as a nameplate prints it, letters only: a `(Zone)` qualifier dropped; with and without its article. */
function targets(name: string): string[] {
  const bare = name.replace(/\s*\([^)]*\)\s*$/, '').trim()
  const noArticle = bare.replace(/^(a|an|the)\s+/i, '')
  return [...new Set([squash(bare), squash(noArticle)])].filter((t) => t.length >= 3)
}

/**
 * Whether the OCR'd text of a picture holds the mob's name, loosely (owner, 2026-10-21): letters
 * only, case and spaces ignored, the `(Zone)` qualifier dropped, a slip or two allowed in a long name.
 */
export function nameInLines(name: string, lines: readonly string[]): boolean {
  const text = squash(lines.join(' '))
  return targets(name).some((t) => {
    if (text.includes(t)) return true
    const slips = Math.floor(t.length / 6)
    if (slips === 0) return false
    // Windows a slip shorter or longer too: a misread letter dropped (`Thagge1um`) or doubled.
    for (let len = t.length - slips; len <= t.length + slips; len++) {
      for (let i = 0; i + len <= text.length; i++) if (editDistance(text.slice(i, i + len), t) <= slips) return true
    }
    return false
  })
}
