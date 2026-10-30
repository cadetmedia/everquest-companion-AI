import { type JSX, type KeyboardEvent, type Ref, useState } from 'react'
import { Box, Chip, CircularProgress, Fade, IconButton, Paper, Stack, TextField, Typography } from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import type { AiFollowUp, AiLiveStatus, AiUsageSnap } from '@shared/aiChat'
import { aiChatComposerPlaceholder, type AiChatPhase } from '@shared/aiSlash'
import type { MobTarget } from '../mobs/mobTarget'
import { AIDraftCard } from './AIDraftCard'
import { AIDumpCoach } from './AIDumpCoach'
import { AISpendBar } from './AISpendBar'
import { askAgainChips } from './dumpStatus'
import { AIMarkdown } from './AIMarkdown'
import type { ChatMessage } from './chatTypes'
import { followUpsFor } from './followUps'
import { starterChipsFor } from './starterChips'

export type { ChatMessage }

function ChipRow(props: { chips: AiFollowUp[]; disabled: boolean; onSend: (prompt: string) => void; testId: string }): JSX.Element {
  return (
    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ gap: 0.75 }}>
      {props.chips.map((c) => (
        <Chip
          key={c.id}
          size="small"
          variant="outlined"
          label={c.label}
          disabled={props.disabled}
          onClick={() => props.onSend(c.prompt)}
          data-testid={props.testId}
        />
      ))}
    </Stack>
  )
}

function lastExchange(messages: ChatMessage[]): { prompt: string; mentions: ChatMessage['mentions'] } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'ai' || m.pending) continue
    for (let j = i - 1; j >= 0; j--) {
      if (messages[j].role === 'user') return { prompt: messages[j].text, mentions: m.mentions }
    }
    return { prompt: '', mentions: m.mentions }
  }
  return null
}

function lastUserPrompt(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'user' && m.text.trim()) return m.text
  }
  return ''
}

function PendingHint({ hint }: { hint: string | undefined }): JSX.Element {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <CircularProgress size={18} />
      {hint ? (
        <Typography variant="caption" color="text.secondary" data-testid="ai-tool-hint">
          {hint}
        </Typography>
      ) : null}
    </Box>
  )
}

function Bubble(props: {
  msg: ChatMessage
  onOpenLoot: (name: string) => void
  onOpenMob: (t: MobTarget) => void
  onOpenAlerts: () => void
  onDraftResolved: (id: string) => void
}): JSX.Element {
  const { msg } = props
  const waiting = msg.role === 'ai' && msg.pending === true && msg.text.length === 0
  return (
    <Box sx={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
      <Paper sx={{ p: 1.5, bgcolor: msg.role === 'user' ? 'action.hover' : 'background.paper' }}>
        {waiting ? (
          <PendingHint hint={msg.toolHint} />
        ) : msg.role === 'ai' ? (
          <AIMarkdown text={msg.text} mentions={msg.mentions} onOpenLoot={props.onOpenLoot} onOpenMob={props.onOpenMob} />
        ) : (
          <Typography variant="body2">{msg.text}</Typography>
        )}
        {!waiting && msg.toolHint && (
          <Typography variant="caption" color="text.secondary" data-testid="ai-tool-hint">
            {msg.toolHint}
          </Typography>
        )}
        {msg.drafts?.map((d) => (
          <AIDraftCard
            key={d.id}
            def={d}
            onOpenAlerts={props.onOpenAlerts}
            onResolved={props.onDraftResolved}
          />
        ))}
      </Paper>
    </Box>
  )
}

/** A picture rides with the next question; a picture alone asks what it shows. */
function questionFor(text: string, image: string | null): string {
  const t = text.trim()
  if (t) return t
  return image ? 'What is this?' : ''
}

/** The ask box: text, the camera (cadetmedia fork) and the screenshot riding with the question. */
function Composer({ loading, vision, onSend }: { loading: boolean; vision: boolean; onSend: (text: string, image?: string) => void }): JSX.Element {
  const [input, setInput] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [captureNote, setCaptureNote] = useState('')
  const canSend = !loading && questionFor(input, image) !== ''
  const sendInput = (): void => {
    if (!canSend) return
    onSend(questionFor(input, image), image ?? undefined)
    setInput('')
    setImage(null)
  }
  const capture = (): void => {
    setCaptureNote('')
    void window.eq.captureForAi().then((r) => {
      if (r.image) setImage(r.image)
      else if (r.error) setCaptureNote(r.error)
    })
  }
  return (
    <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
      {(image ?? captureNote) ? (
        <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center' }}>
          {image ? <Chip size="small" label="Screenshot attached" onDelete={() => setImage(null)} data-testid="ai-image-chip" /> : null}
          {captureNote ? <Typography variant="caption" color="error">{captureNote}</Typography> : null}
        </Stack>
      ) : null}
      <Stack direction="row" spacing={1}>
        <IconButton
          onClick={capture}
          disabled={loading || !vision}
          aria-label={vision ? 'Capture the screen and ask about it (drag a box)' : 'Screenshots need Gemini, Claude or OpenAI (Preferences)'}
          data-testid="ai-capture-button"
        >
          <PhotoCameraIcon />
        </IconButton>
        <TextField
          fullWidth
          size="small"
          placeholder={image ? 'Screenshot attached - ask about it, or just press Enter' : aiChatComposerPlaceholder(loading, 'Ask about an item, spell, mob, or your loadout')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key !== 'Enter' || e.shiftKey) return
            e.preventDefault()
            sendInput()
          }}
          disabled={loading}
        />
        <IconButton onClick={sendInput} disabled={!canSend} color="primary">
          <SendIcon />
        </IconButton>
      </Stack>
    </Box>
  )
}

export function ChatColumn(props: {
  messages: ChatMessage[]
  loading: boolean
  status: AiLiveStatus
  dumpNotices: string[]
  onSend: (text: string, image?: string) => void
  bottomRef: Ref<HTMLDivElement>
  onOpenLoot: (name: string) => void
  onOpenMob: (t: MobTarget) => void
  onOpenAlerts: () => void
  onDropDraft: (msgIndex: number, draftId: string) => void
  usage: AiUsageSnap
  needsKey: boolean
  /** The chosen provider takes pictures (OpenRouter's models vary, so its camera is off). */
  vision: boolean
  phase: AiChatPhase
}): JSX.Element {
  const { messages, loading, status, dumpNotices, onSend, bottomRef, usage, needsKey, vision, phase } = props
  const exchange = lastExchange(messages)
  const followUps = exchange ? followUpsFor(exchange.prompt, exchange.mentions, status) : []
  const askAgain = askAgainChips(dumpNotices, lastUserPrompt(messages))
  const starters = messages.length === 0 ? starterChipsFor(status) : []

  return (
    <Paper
      variant="outlined"
      sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}
    >
      <Box sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {needsKey && (
          <Typography variant="body2" color="text.secondary" data-testid="ai-needs-key">
            Open Preferences &gt; AI Assistant: pick a provider (Gemini has a free tier) and paste its key.
          </Typography>
        )}
        {starters.length > 0 && (
          <ChipRow chips={starters} disabled={loading} onSend={onSend} testId="ai-starter-chip" />
        )}
        {messages.map((msg, i) => (
          <Fade in={true} key={i}>
            <div>
              <Bubble
                msg={msg}
                onOpenLoot={props.onOpenLoot}
                onOpenMob={props.onOpenMob}
                onOpenAlerts={props.onOpenAlerts}
                onDraftResolved={(id) => props.onDropDraft(i, id)}
              />
            </div>
          </Fade>
        ))}
        {!loading && askAgain.length > 0 && (
          <ChipRow chips={askAgain} disabled={loading} onSend={onSend} testId="ai-ask-again" />
        )}
        {!loading && followUps.length > 0 && (
          <ChipRow chips={followUps} disabled={loading} onSend={onSend} testId="ai-follow-up" />
        )}
        <div ref={bottomRef} />
      </Box>
      <AIDumpCoach status={status} />
      <Composer loading={loading} vision={vision} onSend={onSend} />
      <AISpendBar usage={usage} phase={phase} />
    </Paper>
  )
}
