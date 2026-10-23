// folderPicturesStore — the pictures already in the player's picture folders (the auto-save folder,
// then the last folder saved to), listed by main (src/main/ipc/shotPicture.ts). A picture put there by
// hand counts as saved (owner, 2026-10-22: "sometimes i may put an image in the directory, if I do,
// the tool should see that the image is there and not ask for it still in the app").
//
// Read when the first reader mounts, again whenever the window regains focus (the player dropped a
// file in Explorer and came back), and on `refreshFolderPictures()` after a save, a delete or a
// folder change. An overlay, which seldom takes focus, also reads every `everyMs`. Nothing is read
// while no reader is mounted.

import { useSyncExternalStore } from 'react'
import { NO_FOLDER_PICTURES, type FolderPictures } from '@shared/mobPicture'

/** One window's view of the folders, read through `fetch` (the main window's bridge or an overlay's). */
export function folderPicturesStore(fetch: () => Promise<FolderPictures>, everyMs?: number): { use: () => FolderPictures; refresh: () => void } {
  let now: FolderPictures = NO_FOLDER_PICTURES
  let ticket = 0
  let timer: ReturnType<typeof setInterval> | undefined
  const listeners = new Set<() => void>()
  const refresh = (): void => {
    const mine = ++ticket
    fetch()
      .then((got) => {
        // An older answer never replaces a newer one.
        if (mine !== ticket) return
        now = got
        for (const l of listeners) l()
      })
      .catch(() => undefined)
  }
  const onFocus = (): void => refresh()
  const subscribe = (onChange: () => void): (() => void) => {
    listeners.add(onChange)
    if (listeners.size === 1) {
      window.addEventListener('focus', onFocus)
      if (everyMs !== undefined) timer = setInterval(refresh, everyMs)
      refresh()
    }
    return () => {
      listeners.delete(onChange)
      if (listeners.size > 0) return
      window.removeEventListener('focus', onFocus)
      if (timer !== undefined) clearInterval(timer)
      timer = undefined
    }
  }
  const snapshot = (): FolderPictures => now
  return { use: () => useSyncExternalStore(subscribe, snapshot, snapshot), refresh }
}

const mainWindow = folderPicturesStore(() => window.eq.shotFolderPictures())

/** The pictures in the folders, current for this window. */
export const useFolderPictures = (): FolderPictures => mainWindow.use()
/** Read the folders again now (after a save, a delete, or a folder change). */
export const refreshFolderPictures = (): void => mainWindow.refresh()
