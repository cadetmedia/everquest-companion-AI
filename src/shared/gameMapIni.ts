// gameMapIni.ts — is the in-game map open? Read off the game's own UI file for the character
// (owner ask, 2026-10-13: the Map pins overlay can hide while the game map is closed).
//
// MEASURED on the owner's install, 2026-10-13: EQ re-saves `UI_<character>_<server>_LO1.ini` in
// the game folder within about a second of every M press, flipping `Show=` in the `[MapViewWnd]`
// section (ten toggles watched, every one written; zoom and pan are never saved). Pure, so the
// tests hold the parse and the file pick without touching a disk.

/** The map window's `Show=` in the file's text: true open, false closed, null when it is not there. */
export function parseMapShown(text: string): boolean | null {
  let inMap = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('[')) {
      inMap = line.toLowerCase() === '[mapviewwnd]'
      continue
    }
    if (!inMap) continue
    const m = /^show\s*=\s*(\d+)/i.exec(line)
    if (m) return m[1] !== '0'
  }
  return null
}

/**
 * The character's UI file among the game folder's names: `UI_<name>_<server>` then anything (the
 * layout suffix, `_LO1` on the owner's install) and `.ini`, case folded. Several match ⇒ the one
 * `newest` ranks first (the caller passes mtimes). Null when there is none.
 */
export function pickUiIni(files: readonly { name: string; mtime: number }[], name: string, server: string): string | null {
  const prefix = `ui_${name}_${server}`.toLowerCase()
  let best: { name: string; mtime: number } | null = null
  for (const f of files) {
    const lower = f.name.toLowerCase()
    if (!lower.startsWith(prefix) || !lower.endsWith('.ini')) continue
    if (best === null || f.mtime > best.mtime) best = f
  }
  return best?.name ?? null
}
