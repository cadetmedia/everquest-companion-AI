import { ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  AiChatTurn,
  AiConfigPayload,
  AiConfigView,
  AiLiveStatus,
  AiPromptResult,
  AiStreamChunk,
  AiUsageSnap
} from '../shared/aiChat'
import type { AlertDef } from '../shared/alertTypes'
import type { AiProvider } from '../shared/aiProviders'
import type { AiScope } from '../shared/aiSources'

export const aiBridge = {
  /** `scope: 'web'` is the player's yes to "Search other sources?" (shared/aiSources.ts). */
  sendAiPrompt: (prompt: string, history: AiChatTurn[], image?: string, scope?: AiScope): Promise<AiPromptResult> =>
    ipcRenderer.invoke(IPC.aiSendPrompt, prompt, history, image, scope),
  /** Open a citation the assistant returned; main opens only URLs it handed out. */
  openAiCitation: (url: string): void => ipcRenderer.send(IPC.aiOpenCitation, url),
  /** Drag a box over the screen; the picture as a data URL, or null when cancelled. */
  captureForAi: (): Promise<{ image: string | null; error?: string }> => ipcRenderer.invoke(IPC.aiCapture),
  /** A provider's live models for its saved key, and the one to use. */
  listAiModels: (provider: AiProvider): Promise<{ models: string[]; picked: string; error?: string }> =>
    ipcRenderer.invoke(IPC.aiModelsList, provider),
  getAiStatus: (): Promise<AiLiveStatus> => ipcRenderer.invoke(IPC.aiStatusGet),
  getAiUsage: (): Promise<AiUsageSnap> => ipcRenderer.invoke(IPC.aiUsageGet),
  onAiUsage: (cb: (u: AiUsageSnap) => void): (() => void) => {
    const listener = (_e: unknown, u: AiUsageSnap): void => cb(u)
    ipcRenderer.on(IPC.aiUsage, listener)
    return () => ipcRenderer.removeListener(IPC.aiUsage, listener)
  },
  onAiProactive: (cb: (text: string) => void): (() => void) => {
    const listener = (_e: unknown, p: { text?: string }): void => {
      if (typeof p?.text === 'string' && p.text.length > 0) cb(p.text)
    }
    ipcRenderer.on(IPC.aiProactive, listener)
    return () => ipcRenderer.removeListener(IPC.aiProactive, listener)
  },
  onAiChunk: (cb: (c: AiStreamChunk) => void): (() => void) => {
    const listener = (_e: unknown, c: AiStreamChunk): void => cb(c)
    ipcRenderer.on(IPC.aiChunk, listener)
    return () => ipcRenderer.removeListener(IPC.aiChunk, listener)
  },
  /** The settings as a window may see them: which providers have a key, never a key. */
  getAiConfig: (): Promise<AiConfigView> => ipcRenderer.invoke(IPC.aiConfigGet),
  setAiConfig: (payload: AiConfigPayload): Promise<void> => ipcRenderer.invoke(IPC.aiConfigSet, payload),
  getAiContext: (): Promise<string[]> => ipcRenderer.invoke(IPC.aiContextGet),
  saveAiDraftAlert: (def: AlertDef): Promise<{ ok: boolean; id: string }> =>
    ipcRenderer.invoke(IPC.aiSaveDraftAlert, def)
}
