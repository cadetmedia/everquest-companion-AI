import { ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { CharacterGaps } from '../shared/gapsAllCharacters'

/** The Gaps tab's All characters: every other character's saved Gaps inputs (main/gapsCharacters.ts). */
export const gapsCharactersBridge = {
  gapsAllCharacters: (sinceStamp: string | null): Promise<CharacterGaps[]> => ipcRenderer.invoke(IPC.gapsAllCharacters, sinceStamp)
}
