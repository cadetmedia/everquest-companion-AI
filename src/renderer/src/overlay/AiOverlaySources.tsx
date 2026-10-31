// The overlay's half of the source order (shared/aiSources.ts): where the last answer came from,
// the pages it used, and the "Search other sources?" choice. MUI-free, like the rest of the overlay.
import { type CSSProperties, type JSX } from 'react'
import type { AiStoredMessage } from '@shared/aiChat'
import type { AiAnswerSource, AiCitationTier } from '@shared/aiSources'

const LINE: Record<AiAnswerSource, string> = {
  local: "From the app's wiki data and your log",
  trusted: 'From your trusted sources',
  web: 'From other sources - may not match EverQuest Legends',
  none: ''
}
const TIER: Record<AiCitationTier, { label: string; color: string }> = {
  trusted: { label: 'trusted', color: '#7fd47f' },
  close: { label: 'classic EQ', color: '#e8d24a' },
  outside: { label: 'other', color: '#ff7a9a' }
}
const SMALL: CSSProperties = { fontSize: 10, color: 'rgba(255,255,255,0.55)' }

export function AiOverlaySources({ row, busy, onWiden, noDrag }: { row: AiStoredMessage | undefined; busy: boolean; onWiden: (prompt: string) => void; noDrag: CSSProperties }): JSX.Element | null {
  if (!row) return null
  const line = row.source ? LINE[row.source] : ''
  const widen = row.widenPrompt
  if (!line && !row.citations?.length && !widen) return null
  return (
    <div data-testid="ai-overlay-sources" style={{ ...noDrag, padding: '4px 2px 0' }}>
      {line ? <div style={SMALL}>{line}</div> : null}
      {row.citations?.map((c) => (
        <div key={c.url} style={{ ...SMALL, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <span style={{ color: TIER[c.tier].color }}>[{TIER[c.tier].label}]</span>{' '}
          <a
            href="#"
            style={{ color: '#9fd3ff' }}
            onClick={(e) => {
              e.preventDefault()
              window.eqOverlay.openAiCitation(c.url)
            }}
          >
            {c.title}
          </a>
        </div>
      ))}
      {widen ? (
        <button
          type="button"
          data-testid="ai-overlay-widen"
          disabled={busy}
          onClick={() => onWiden(widen)}
          style={{ marginTop: 4, background: 'rgba(217,178,95,0.18)', color: '#d9b25f', border: '1px solid rgba(217,178,95,0.4)', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: busy ? 'default' : 'pointer' }}
        >
          Search other sources
        </button>
      ) : null}
    </div>
  )
}
