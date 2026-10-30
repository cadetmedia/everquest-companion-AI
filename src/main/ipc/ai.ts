import { randomUUID } from 'node:crypto'
import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import {
  AI_HISTORY_CAP,
  type AiChatTurn,
  type AiConfigPayload,
  type AiPromptResult,
  type AiStreamChunk,
  type AiUsageSnap
} from '../../shared/aiChat'
import { AI_PROACTIVE_PARKED, aiHelpText } from '../../shared/aiSlash'
import { aiModelBarLabel } from '../../shared/aiModels'
import { AI_PROVIDER_INFO, isAiProvider, pickModel, type AiProvider } from '../../shared/aiProviders'
import type { AlertDef, AlertTrigger } from '../../shared/alertTypes'
import { IPC } from '../../shared/ipc'
import { EQL_LORE } from '../data/eqlLore'
import { getAiClient, listAiModels } from '../ai/AIClientFactory'
import { aiConfigView, aiKey, aiModel, aiProvider, saveAiConfig } from '../ai/aiConfigStore'
import { refreshAiHotkey, registerAiCaptureIpc } from '../ai/aiCapture'
import { buildAiRecap, getLiveStatus } from '../ai/aiPlayerState'
import { startAiProactive } from '../ai/aiProactiveHost'
import { saveAlert, settingsStore } from '../store'
import { getMainWindow, getOverlayWindow } from '../windows'

function parseHistory(raw: unknown): AiChatTurn[] {
  if (!Array.isArray(raw)) return []
  const out: AiChatTurn[] = []
  for (const row of raw.slice(-AI_HISTORY_CAP)) {
    if (!row || typeof row !== 'object') continue
    const rec = row as { role?: unknown; text?: unknown }
    if (rec.role !== 'user' && rec.role !== 'assistant') continue
    if (typeof rec.text !== 'string' || rec.text.length === 0) continue
    out.push({ role: rec.role, text: rec.text })
  }
  return out
}

function isTrigger(v: unknown): v is AlertTrigger {
  if (!v || typeof v !== 'object') return false
  const t = v as { type?: unknown }
  return t.type === 'event' || t.type === 'raw' || t.type === 'app' || t.type === 'any' || t.type === 'all'
}

function parseDraft(raw: unknown): AlertDef | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Partial<AlertDef>
  if (typeof rec.id !== 'string' || typeof rec.name !== 'string') return null
  if (!isTrigger(rec.trigger)) return null
  if (!rec.sound || typeof rec.sound.packId !== 'string' || typeof rec.sound.soundId !== 'string') {
    return null
  }
  return rec as AlertDef
}

function systemPrompt(style: string | undefined, recap: string[]): string {
  const recapBlock = recap.length > 0 ? recap.join('\n') : '(no recent combat or zone lines in the last 5 minutes)'
  const styleBlock = style?.trim() ? `\nUser's personal instructions:\n${style.trim()}\n` : ''
  return `${EQL_LORE}
${styleBlock}
Recent recap (parsed events, newest last):
${recapBlock}

Use tools for facts: get_output (honour empty and stale), get_fight, get_zone, get_buffs, get_recent_loot, get_loadout, get_aa, search_*. Do not invent bags, fights, or buffs.`
}

/** The chat bar's model name: OpenRouter's picker label, else the provider's model id. */
function modelLabelFor(p: AiProvider): string {
  return p === 'openrouter' ? aiModelBarLabel(aiModel(p)) : aiModel(p)
}

/** A provider's live models for its saved key, and the model to use from them (pickModel). */
async function handleModelsList(_e: unknown, raw: unknown): Promise<{ models: string[]; picked: string; error?: string }> {
  const p = isAiProvider(raw) ? raw : aiProvider()
  try {
    const models = await listAiModels(p, aiKey(p))
    return { models, picked: pickModel(p, aiModel(p), models) }
  } catch (e) {
    return { models: [], picked: aiModel(p), error: e instanceof Error ? e.message : String(e) }
  }
}

export function registerAiIpc(): void {
  ipcMain.handle(IPC.aiConfigGet, () => aiConfigView())

  ipcMain.handle(IPC.aiConfigSet, (_e, payload: AiConfigPayload) => {
    if (!payload || typeof payload !== 'object') throw new Error('Invalid AI settings.')
    saveAiConfig({ ...payload, apiKey: typeof payload.apiKey === 'string' ? payload.apiKey : '' })
    refreshAiHotkey()
    pushUsage({ spendUsd: null, modelLabel: modelLabelFor(aiProvider()) })
    void handleUsageGet().then(pushUsage)
  })

  ipcMain.handle(IPC.aiModelsList, handleModelsList)
  registerAiCaptureIpc()

  ipcMain.handle(IPC.aiContextGet, () => buildAiRecap())

  ipcMain.handle(IPC.aiStatusGet, () => getLiveStatus())

  ipcMain.handle(IPC.aiUsageGet, handleUsageGet)

  ipcMain.handle(IPC.aiSaveDraftAlert, (_e, raw: unknown) => {
    const def = parseDraft(raw)
    if (!def) throw new Error('Invalid alert draft.')
    saveAlert(def)
    return { ok: true, id: def.id }
  })

  ipcMain.handle(IPC.aiSendPrompt, handleSendPrompt)
  startAiProactive()
}

function sendUsage(wc: WebContents | undefined, snap: AiUsageSnap): void {
  if (!wc || wc.isDestroyed()) return
  wc.send(IPC.aiUsage, snap)
}

function pushUsage(snap: AiUsageSnap): void {
  sendUsage(getMainWindow()?.webContents, snap)
  const overlay = getOverlayWindow('ai')
  sendUsage(overlay && !overlay.isDestroyed() ? overlay.webContents : undefined, snap)
}

async function handleUsageGet(): Promise<AiUsageSnap> {
  const p = aiProvider()
  const modelLabel = modelLabelFor(p)
  const apiKey = aiKey(p)
  if (!apiKey) return { spendUsd: null, modelLabel }
  const spendUsd = await getAiClient(p, apiKey).getUsageUsd()
  return { spendUsd, modelLabel }
}

function sendChunk(wc: WebContents | undefined, seen: Set<number>, payload: AiStreamChunk): void {
  if (!wc || wc.isDestroyed() || seen.has(wc.id)) return
  seen.add(wc.id)
  wc.send(IPC.aiChunk, payload)
}

function emitAiChunk(
  sender: IpcMainInvokeEvent['sender'],
  requestId: string,
  chunk: Omit<AiStreamChunk, 'requestId'>
): void {
  const payload: AiStreamChunk = { requestId, ...chunk }
  const seen = new Set<number>()
  sendChunk(sender, seen, payload)
  sendChunk(getMainWindow()?.webContents, seen, payload)
  const overlay = getOverlayWindow('ai')
  sendChunk(overlay && !overlay.isDestroyed() ? overlay.webContents : undefined, seen, payload)
}

/** A capture the renderer attaches: a PNG/JPEG data URL, capped so a bad payload cannot balloon. */
function parseImage(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.length > 12_000_000) return undefined
  return /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(raw) ? raw : undefined
}

async function handleSendPrompt(
  event: IpcMainInvokeEvent,
  prompt: unknown,
  historyRaw: unknown,
  imageRaw?: unknown
): Promise<AiPromptResult> {
  const text = typeof prompt === 'string' ? prompt : ''
  const cmd = text.trim().toLowerCase()
  if (cmd === '/help') return { text: aiHelpText(), drafts: [] }
  if (cmd === '/proactive' || cmd === '/proactive on' || cmd === '/proactive off') {
    return { text: AI_PROACTIVE_PARKED, drafts: [] }
  }
  const config = settingsStore.get('aiConfig')
  const provider = aiProvider(config)
  const apiKey = aiKey(provider, config)
  if (!config?.consent || !apiKey) {
    throw new Error(`AI Assistant is not set up: add a ${AI_PROVIDER_INFO[provider].label} key in Preferences > AI Assistant and tick the consent box.`)
  }
  const client = getAiClient(provider, apiKey)
  const model = aiModel(provider, config)
  if (text.trim() === '/model') {
    return { text: `Current model: **${modelLabelFor(provider)}** (\`${model}\`) on ${AI_PROVIDER_INFO[provider].label}.`, drafts: [] }
  }
  if (text.trim() === '/usage') {
    const usd = await client.getUsageUsd()
    return { text: usd == null ? `${AI_PROVIDER_INFO[provider].label} does not report spend here; check its own console.` : `**API usage on this key:** $${usd.toFixed(4)}`, drafts: [] }
  }
  const requestId = randomUUID()
  const result = await client.sendPrompt(systemPrompt(config.personalStyle, await buildAiRecap()), text, {
    model,
    image: parseImage(imageRaw),
    history: parseHistory(historyRaw),
    onChunk: (chunk) => emitAiChunk(event.sender, requestId, chunk)
  })
  void handleUsageGet().then(pushUsage)
  return result
}
