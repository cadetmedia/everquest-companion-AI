// Under each answer: where it came from (shared/aiSources.ts), the pages a web answer used,
// tagged by the app against the player's lists, and the "Search other sources?" choice.
import { type JSX } from 'react'
import { Alert, Box, Button, Chip, Stack, Typography } from '@mui/material'
import { AI_SETUP_WARNING } from '@shared/aiChat'
import type { AiAnswerSource, AiCitation, AiCitationTier, AiFollowScope } from '@shared/aiSources'
import type { ChatMessage } from './chatTypes'

const SOURCE_LINE: Record<AiAnswerSource, string> = {
  instant: "Found in the app's own data - no AI used",
  local: "From the app's wiki data, the Compendium and your log",
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

/** The one follow-up an answer offers: "Ask AI" after an instant answer, or "Search other sources". */
function followUp(msg: ChatMessage): { prompt: string; scope: AiFollowScope; label: string } | null {
  if (msg.askAiPrompt) return { prompt: msg.askAiPrompt, scope: 'ai', label: 'Ask AI' }
  if (msg.widenPrompt) return { prompt: msg.widenPrompt, scope: 'web', label: 'Search other sources' }
  return null
}

/** Anything under the answer besides the source line: pages, a follow-up, the set-up warning. */
function hasExtras(msg: ChatMessage): boolean {
  return Boolean(msg.citations?.length) || followUp(msg) !== null || msg.needsAiSetup === true
}

function SetupWarning(): JSX.Element {
  return (
    <Alert severity="warning" variant="outlined" sx={{ mt: 1, py: 0 }} data-testid="ai-setup-warning">
      {AI_SETUP_WARNING}
    </Alert>
  )
}

function FollowUpButton({
  next,
  disabled,
  onWiden
}: {
  next: { prompt: string; scope: AiFollowScope; label: string }
  disabled: boolean
  onWiden: (prompt: string, scope: AiFollowScope) => void
}): JSX.Element {
  return (
    <Button
      size="small"
      variant="outlined"
      sx={{ mt: 1 }}
      disabled={disabled}
      onClick={() => onWiden(next.prompt, next.scope)}
      data-testid={next.scope === 'ai' ? 'ai-ask-ai-button' : 'ai-widen-button'}
    >
      {next.label}
    </Button>
  )
}

export function AISourceFooter({
  msg,
  disabled,
  onWiden
}: {
  msg: ChatMessage
  disabled: boolean
  onWiden: (prompt: string, scope: AiFollowScope) => void
}): JSX.Element | null {
  if (msg.role !== 'ai' || msg.pending) return null
  const line = msg.source ? SOURCE_LINE[msg.source] : ''
  const next = followUp(msg)
  if (!line && !hasExtras(msg)) return null
  return (
    <Box sx={{ mt: 1 }} data-testid="ai-source-footer">
      {line ? (
        <Typography variant="caption" color="text.secondary" data-testid={`ai-source-${msg.source ?? 'none'}`}>
          {line}
        </Typography>
      ) : null}
      {msg.citations?.length ? <Citations list={msg.citations} /> : null}
      {msg.needsAiSetup ? <SetupWarning /> : null}
      {next ? <FollowUpButton next={next} disabled={disabled} onWiden={onWiden} /> : null}
    </Box>
  )
}
