// pictureFiles.ts — writing and deleting a saved mob picture without throwing (review, 2026-10-21: an
// unguarded write rejected the IPC and left the panel's spinner running, e.g. EPERM on a protected
// folder or a file another program holds). ELECTRON-FREE, so the failure path is tested.

import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/** Write the file; a failure comes back as the player's words, never as a throw. */
export function writeSafely(path: string, data: Uint8Array): { ok: true } | { ok: false; message: string } {
  try {
    writeFileSync(path, data)
    return { ok: true }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    const why = code === 'EPERM' || code === 'EACCES' ? 'Windows refused (a protected folder, or the file is open in another program)' : code === 'ENOENT' ? 'that folder is gone' : (code ?? String(e))
    return { ok: false, message: `Could not save ${path}: ${why}.` }
  }
}

/** Delete the file; false when it could not be (already gone counts as done). */
export function deleteSafely(path: string): boolean {
  try {
    if (existsSync(path)) unlinkSync(path)
    return true
  } catch {
    return false
  }
}

/**
 * Whether `path` is a `.png` directly inside one of `dirs`, after resolving both (no `..` way out):
 * the only files the details pane may be shown (Windows: any case). A path anywhere else is refused.
 */
export function pictureIn(path: string, dirs: readonly string[]): boolean {
  if (!/\.png$/i.test(path)) return false
  const dir = dirname(resolve(path)).toLowerCase()
  return dirs.some((d) => resolve(d).toLowerCase() === dir)
}
