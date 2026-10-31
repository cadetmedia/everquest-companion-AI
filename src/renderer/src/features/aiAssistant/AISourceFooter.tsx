// Under each answer: where it came from (shared/aiSources.ts), the pages a web answer used,
// tagged by the app against the player's lists, and the "Search other sources?" choice.
import { type JSX } from 'react'
import { Box, Button, Chip, Stack, Typography } from '@mui/material'
import type { AiAnswerSource, AiCitation, AiCitationTier } from '@shared/aiSources'
import type { ChatMessage } from './chatTypes'

const SOURCE_LINE: Record<AiAnswerSource, string> = {
  local: "From the app's wiki data and your log",
  trusted: 'From your trusted sources',
  web: 'From other sources - may not match EverQuest Legends',
  none: ''
}

const TIER: Record<AiCitationTier, { label: string; color: 'success' | 'warning' | 'error' }> = {
  trusted: { label: 'trusted', color: 'success' },
  close: { label: 'classic EQ', color: 'warning' },
  outside: { label: 'other', color: 'error' }
}

function Citations({ list }: { list: readonly AiCitation[] }): JSX.Element {
  return (
    <Stack spacing={0.5} sx={{ mt: 0.5 }} data-testid="ai-citations">
      {list.map((c) => (
        <Stack key={c.url} direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Chip size="small" variant="outlined" color={TIER[c.tier].color} label={TIER[c.tier].label} sx={{ height: 18, fontSize: 10 }} />
          <Typography
            variant="caption"
            component="a"
            href="#"
            onClick={(e: React.MouseEvent) => {
              e.preventDefault()
              window.eq.openAiCitation(c.url)
            }}
            sx={{ color: 'primary.main', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {c.title}
          </Typography>
        </Stack>
      ))}
    </Stack>
  )
}

export function AISourceFooter({ msg, disabled, onWiden }: { msg: ChatMessage; disabled: boolean; onWiden: (prompt: string) => void }): JSX.Element | null {
  if (msg.role !== 'ai' || msg.pending) return null
  const line = msg.source ? SOURCE_LINE[msg.source] : ''
  const widen = msg.widenPrompt
  if (!line && !msg.citations?.length && !widen) return null
  return (
    <Box sx={{ mt: 1 }} data-testid="ai-source-footer">
      {line ? (
        <Typography variant="caption" color="text.secondary" data-testid={`ai-source-${msg.source ?? 'none'}`}>
          {line}
        </Typography>
      ) : null}
      {msg.citations?.length ? <Citations list={msg.citations} /> : null}
      {widen ? (
        <Button size="small" variant="outlined" sx={{ mt: 1 }} disabled={disabled} onClick={() => onWiden(widen)} data-testid="ai-widen-button">
          Search other sources
        </Button>
      ) : null}
    </Box>
  )
}
