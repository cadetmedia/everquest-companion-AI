import { ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { LogArchiveReply, LogArchiveStatus } from '../shared/logArchive/panel'
import type { RefoldTrialReport } from '../shared/logArchive/refoldCompare'

/** Summarize and archive log (docs/plans/log-archive). Every action refuses while the switch is off. */
export const logArchiveBridge = {
  logArchiveStatus: (): Promise<LogArchiveStatus> => ipcRenderer.invoke(IPC.logArchiveStatus),
  /** Only the player flips this, from the card. */
  setLogArchiveEnabled: (enabled: boolean): Promise<LogArchiveReply> =>
    ipcRenderer.invoke(IPC.logArchiveSetEnabled, enabled),
  logArchiveBackup: (): Promise<LogArchiveReply> => ipcRenderer.invoke(IPC.logArchiveBackup),
  logArchiveKeep: (id: string): Promise<LogArchiveReply> => ipcRenderer.invoke(IPC.logArchiveKeep, id),
  logArchiveRotate: (): Promise<LogArchiveReply> => ipcRenderer.invoke(IPC.logArchiveRotate),
  logArchiveRestore: (id: string): Promise<LogArchiveReply> => ipcRenderer.invoke(IPC.logArchiveRestore, id),
  logArchiveRefresh: (id: string): Promise<LogArchiveReply> => ipcRenderer.invoke(IPC.logArchiveRefresh, id),
  /** Developer-only (step 5.4): refused in a packaged build, and no player surface calls it. */
  logArchiveRefoldTrial: (id: string, withTables: boolean): Promise<RefoldTrialReport> =>
    ipcRenderer.invoke(IPC.logArchiveRefoldTrial, id, withTables)
}
