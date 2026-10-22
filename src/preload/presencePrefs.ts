import { ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { CursorRingPrefs, OverlayAutoHidePrefs } from '../shared/presencePrefs'

// Cursor ring + overlay auto-hide (presence-driven settings). Moved out of preload/index.ts
// unchanged, to keep that file under its 400-line ceiling.
export const presencePrefsBridge = {
  // Both are main-owned store blobs, so Preferences has no other door. The setters take a
  // PARTIAL patch (each panel owns one field and must not clobber its siblings by
  // round-tripping a stale copy) and resolve to what was ACTUALLY stored — every field is
  // re-clamped at the handler, so a slider that asks for more than the cap visibly lands on it.
  /** The cursor-ring prefs: enabled + size + stroke width. */
  getCursorRing: (): Promise<CursorRingPrefs> => ipcRenderer.invoke(IPC.cursorRingGet),
  /** Merge-patch the cursor-ring prefs; the ring appears/resizes live. */
  setCursorRing: (patch: Partial<CursorRingPrefs>): Promise<CursorRingPrefs> =>
    ipcRenderer.invoke(IPC.cursorRingSet, patch),
  /** The overlay auto-hide prefs: hide when EQ isn't running / isn't focused. */
  getOverlayAutoHide: (): Promise<OverlayAutoHidePrefs> =>
    ipcRenderer.invoke(IPC.overlayAutoHideGet),
  /** Merge-patch the overlay auto-hide prefs; applies to the live overlays immediately. */
  setOverlayAutoHide: (patch: Partial<OverlayAutoHidePrefs>): Promise<OverlayAutoHidePrefs> =>
    ipcRenderer.invoke(IPC.overlayAutoHideSet, patch),
}
