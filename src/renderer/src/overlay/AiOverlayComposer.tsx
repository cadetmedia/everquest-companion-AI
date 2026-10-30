import { type CSSProperties, type JSX } from 'react'
import { aiChatComposerPlaceholder, slashGhost } from '@shared/aiSlash'

const GOLD = '#d9b25f'
const BTN: CSSProperties = {
  flexShrink: 0,
  background: 'rgba(217,178,95,0.18)',
  color: GOLD,
  border: '1px solid rgba(217,178,95,0.4)',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 11
}
const WRAP: CSSProperties = {
  display: 'flex',
  gap: 4,
  alignItems: 'flex-end',
  padding: '4px 6px',
  borderTop: '1px solid rgba(255,255,255,0.08)',
  flexShrink: 0
}
const FIELD: CSSProperties = {
  position: 'relative',
  flexGrow: 1,
  minWidth: 0,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 4
}
const GHOST: CSSProperties = {
  position: 'absolute',
  inset: 0,
  padding: '4px 6px',
  font: 'inherit',
  fontSize: 11,
  lineHeight: 1.3,
  whiteSpace: 'pre-wrap',
  overflow: 'hidden',
  pointerEvents: 'none',
  color: 'rgba(255,255,255,0.35)'
}
const AREA: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  minWidth: 0,
  resize: 'none',
  background: 'transparent',
  color: '#f2f2f2',
  border: 'none',
  borderRadius: 4,
  padding: '4px 6px',
  font: 'inherit',
  fontSize: 11,
  lineHeight: 1.3,
  position: 'relative'
}

function placeholderFor(image: string | null, busy: boolean, empty: string): string {
  return image ? 'Screenshot attached - ask about it, or just press Enter' : aiChatComposerPlaceholder(busy, empty)
}

/** The camera (cadetmedia fork): off while busy, or when the provider takes no pictures. */
function CaptureButton({ off, vision, onCapture }: { off: boolean; vision: boolean; onCapture: () => void }): JSX.Element {
  return (
    <button
      type="button"
      data-testid="ai-overlay-capture"
      disabled={off}
      onClick={onCapture}
      aria-label={vision ? 'Capture the screen (Ctrl+Shift+A) and ask about it' : 'Screenshots need Gemini, Claude or OpenAI (Preferences)'}
      style={{ ...BTN, opacity: off ? 0.4 : 1, cursor: off ? 'default' : 'pointer' }}
    >
      📷
    </button>
  )
}

export function AiOverlayComposer({
  value,
  setValue,
  busy,
  onSend,
  noDrag,
  empty,
  image,
  clearImage,
  vision,
  onCapture
}: {
  value: string
  setValue: (v: string) => void
  busy: boolean
  onSend: () => void
  noDrag: React.CSSProperties
  empty: string
  /** cadetmedia fork: a capture riding with the next question, and the camera button. */
  image: string | null
  clearImage: () => void
  vision: boolean
  onCapture: () => void
}): JSX.Element {
  const ghost = slashGhost(value)
  const rest = ghost ? ghost.slice(value.length) : ''
  const canSend = !busy && (value.trim() !== '' || image !== null)
  return (
    <div style={{ ...noDrag, ...WRAP }}>
      <CaptureButton off={busy || !vision} vision={vision} onCapture={onCapture} />
      <div style={FIELD}>
        {rest ? (
          <div data-testid="ai-overlay-slash-ghost" style={GHOST}>
            <span style={{ color: 'transparent' }}>{value}</span>
            <span>{rest}</span>
          </div>
        ) : null}
        <textarea
          data-testid="ai-overlay-input"
          value={value}
          disabled={busy}
          rows={2}
          placeholder={placeholderFor(image, busy, empty)}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && ghost) {
              e.preventDefault()
              setValue(ghost)
              return
            }
            if (e.key !== 'Enter' || e.shiftKey) return
            e.preventDefault()
            onSend()
          }}
          style={AREA}
        />
      </div>
      {image ? (
        <button type="button" data-testid="ai-overlay-clear-image" onClick={clearImage} aria-label="Remove the screenshot" style={BTN}>
          ✕📷
        </button>
      ) : null}
      <button
        type="button"
        data-testid="ai-overlay-send"
        disabled={!canSend}
        onClick={onSend}
        style={{ ...BTN, cursor: canSend ? 'pointer' : 'default', opacity: canSend ? 1 : 0.4 }}
      >
        Send
      </button>
    </div>
  )
}
