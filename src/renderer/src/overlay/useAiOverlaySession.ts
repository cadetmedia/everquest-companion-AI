import { useEffect, useRef, useState } from 'react'
import type { AiStoredMessage, AiUsageSnap } from '@shared/aiChat'
import type { AiChatPhase } from '@shared/aiSlash'
import type { AiFollowScope, AiScope } from '@shared/aiSources'
import {
  foldAiPhase,
  foldToolHint,
  lastAiAnswer,
  lastAiRow,
  loadChat,
  nextDraft,
  runSend,
  useSharedThread
} from './aiOverlayThread'

/**
 * cadetmedia fork: the capture hotkey is held exactly while this overlay is open (main checks the
 * setting), and a capture from it, or from the camera button, rides with the next question.
 */
function useAiCapture(): { image: string | null; setImage: (v: string | null) => void; vision: boolean; capture: () => void } {
  const [image, setImage] = useState<string | null>(null)
  const [vision, setVision] = useState(false)
  useEffect(() => {
    void window.eqOverlay.getAiConfig().then((c) => setVision(c.vision)).catch(() => undefined)
    window.eqOverlay.armAiHotkey(true)
    const off = window.eqOverlay.onAiCaptured(setImage)
    return () => {
      off()
      window.eqOverlay.armAiHotkey(false)
    }
  }, [])
  const capture = (): void => {
    void window.eqOverlay.captureForAi().then((r) => {
      if (r.image) setImage(r.image)
    })
  }
  return { image, setImage, vision, capture }
}

export function useAiOverlaySession(): {
  shown: string | undefined
  toolHint: string | null
  input: string
  setInput: (v: string) => void
  busy: boolean
  usage: AiUsageSnap
  phase: AiChatPhase
  send: () => void
  image: string | null
  setImage: (v: string | null) => void
  vision: boolean
  capture: () => void
  /** The newest answer row when nothing is streaming, for its sources and the widen offer. */
  last: AiStoredMessage | undefined
  widen: (prompt: string, scope: AiFollowScope) => void
} {
  const [messages, commit] = useSharedThread()
  const [input, setInput] = useState('')
  const [draft, setDraft] = useState<string | null>(null)
  const [toolHint, setToolHint] = useState<string | null>(null)
  const [usage, setUsage] = useState<AiUsageSnap>({ spendUsd: null, modelLabel: '' })
  const [phase, setPhase] = useState<AiChatPhase>('idle')
  const { image, setImage, vision, capture } = useAiCapture()
  const busy = draft !== null
  const inFlight = useRef(false)
  const draftRef = useRef<string | null>(null)
  const streamBase = useRef<AiStoredMessage[] | null>(null)
  const commitRef = useRef(commit)
  commitRef.current = commit

  useEffect(() => {
    const onTip = window.eqOverlay.onAiProactive
    if (!onTip) return
    return onTip((text) => {
      const cur = loadChat()
      const last = cur[cur.length - 1]
      if (last?.role === 'ai' && last.text === text) return
      commitRef.current([...cur, { role: 'ai', text }])
    })
  }, [])

  useEffect(() => {
    const get = window.eqOverlay.getAiUsage
    if (!get) return
    void get().then(setUsage).catch(() => undefined)
  }, [busy])

  useEffect(() => {
    const on = window.eqOverlay.onAiUsage
    if (!on) return
    return on(setUsage)
  }, [])

  useEffect(() => {
    return window.eqOverlay.onAiChunk((chunk) => {
      if (chunk.kind === 'token' || chunk.kind === 'error' || chunk.kind === 'done') {
        draftRef.current = nextDraft(draftRef.current ?? '', chunk)
        setDraft(draftRef.current)
        if (inFlight.current && streamBase.current && draftRef.current) {
          commitRef.current([...streamBase.current, { role: 'ai', text: draftRef.current }])
        }
      }
      const nextPhase = foldAiPhase(chunk)
      if (nextPhase) setPhase(nextPhase)
      setToolHint((prev) => foldToolHint(prev, chunk))
    })
  }, [])

  const ask = (prompt: string, pic: string | undefined, scope: AiScope): void => {
    setDraft('')
    draftRef.current = ''
    setToolHint(null)
    setPhase('sent')
    queueMicrotask(() => {
      setPhase((p) => (p === 'sent' ? 'awaiting' : p))
    })
    inFlight.current = true
    void runSend(prompt, messages, {
      commit,
      streamBase,
      setDraft: (v) => {
        if (v === null) inFlight.current = false
        draftRef.current = v
        setDraft(v)
        if (v === null) setPhase((p) => (p === 'error' ? p : 'idle'))
      },
      onFail: () => setPhase('error')
    }, { image: pic, scope })
  }

  const send = (): void => {
    const prompt = input.trim() || (image ? 'What is this?' : '')
    if (!prompt || inFlight.current) return
    const pic = image ?? undefined
    setImage(null)
    setInput('')
    ask(prompt, pic, 'auto')
  }
  const widen = (prompt: string, scope: AiFollowScope): void => {
    if (!inFlight.current) ask(prompt, undefined, scope)
  }

  const shown = draft !== null && draft !== '' ? draft : lastAiAnswer(messages)
  const last = draft === null ? lastAiRow(messages) : undefined
  return { shown, toolHint, input, setInput, busy, usage, phase, send, image, setImage, vision, capture, last, widen }
}
