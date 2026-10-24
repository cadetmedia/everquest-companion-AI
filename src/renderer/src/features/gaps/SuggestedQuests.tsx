// SuggestedQuests — the chains the engine rebuilt from the log for quests with no task line (owner,
// 2026-10-23: "would be nice if the thing could tie the steps together automatically"), each shown as a
// flow of steps with the reason each follows, a name to keep or change, and Accept, which makes it a
// Quests row like any other (its Copy writes the page). The visit picker stays for what no chain caught.

import { useState, type JSX } from 'react'
import { Box, Button, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { threadDisplaySteps, threadKey, threadStepLabel, threadStepWhy, visibleThreads, type QuestThread } from '@shared/gapQuestThreads'
import type { QuestNameClash } from '@shared/gapForcedQuests'
import { useForcedScope } from './ForcedQuests'

/** What the name box says of a clash: your quest or the log's blocks Accept, a wiki page only warns. */
function clashText(c: QuestNameClash): string {
  if (c.kind === 'yours') return `You already have a quest named "${c.title}". Pick another name.`
  if (c.kind === 'logged') return `Your log already has the quest "${c.title}". Pick another name.`
  return `The wiki has a page "${c.title}". Accept only if these steps belong on it.`
}

interface CardProps {
  thread: QuestThread
  nameClash: (name: string) => QuestNameClash | undefined
  onAccept: (name: string) => void
}

function ThreadCard({ thread, nameClash, onAccept }: CardProps): JSX.Element {
  const [name, setName] = useState(thread.name)
  // Checked on every keystroke, so a clash shows after the rename and before Accept (owner, 2026-10-23).
  const clash = nameClash(name)
  const blocked = clash !== undefined && clash.kind !== 'wiki'
  // What the quest needs, as its page says it: talk, then "Collect … ← asked, dropped by …", then the hand-in.
  const steps = threadDisplaySteps(thread)
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, mb: 1 }} data-testid="thread-card">
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <TextField size="small" label="Quest name" value={name} onChange={(e) => setName(e.target.value)} error={blocked} sx={{ minWidth: 280 }} slotProps={{ htmlInput: { 'data-testid': 'thread-name' } }} />
        <Typography variant="caption" color="text.secondary">
          {thread.zone ?? ''} · {steps.length} steps
        </Typography>
        <Tooltip title="Make this chain a quest you can copy to the wiki.">
          <span>
            <Button size="small" variant="contained" disabled={name.trim() === '' || blocked} onClick={() => onAccept(name.trim())} data-testid="thread-accept">
              Accept
            </Button>
          </span>
        </Tooltip>
      </Stack>
      {clash !== undefined && (
        <Typography variant="caption" component="div" color={blocked ? 'error' : 'warning.main'} sx={{ mb: 0.5 }} data-testid="thread-name-clash">
          {clashText(clash)}
        </Typography>
      )}
      <Box component="ol" sx={{ m: 0, pl: 3 }}>
        {steps.map((s) => (
          <li key={s.id} data-testid="thread-step">
            <Typography variant="body2" component="span">
              {threadStepLabel(s)}
            </Typography>
            {threadStepWhy(s) !== '' && (
              <Typography variant="caption" color="text.secondary" component="span" sx={{ ml: 1 }}>
                ← {threadStepWhy(s)}
              </Typography>
            )}
          </li>
        ))}
      </Box>
    </Box>
  )
}

/** How many chains the filters hide, said so they are not taken for gone. */
const hiddenNote = (n: number): string => (n === 0 ? '' : ` (${String(n)} more hidden by Zone I'm in or the search)`)

/**
 * "Suggested quests" above the Quests list, under the list's own "Zone I'm in" and search; nothing
 * when the log rebuilt no chain.
 */
export function SuggestedQuests({ query, zone }: { query: string; zone: string | null }): JSX.Element | null {
  const scope = useForcedScope()
  if (scope === null || scope.threads.length === 0) return null
  const shown = visibleThreads(scope.threads, query, zone)
  const hidden = scope.threads.length - shown.length
  if (shown.length === 0)
    return (
      <Typography variant="body2" color="text.secondary" data-testid="suggested-quests-hidden">
        {hidden} suggested {hidden === 1 ? 'quest' : 'quests'} hidden by Zone I'm in or the search.
      </Typography>
    )
  return (
    <Box sx={{ mb: 1.5 }} data-testid="suggested-quests">
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        Suggested quests, tied together from your log{hiddenNote(hidden)}
      </Typography>
      {shown.map((t) => (
        <ThreadCard key={threadKey(t)} thread={t} nameClash={scope.nameClash} onAccept={(name) => scope.accept(name, t)} />
      ))}
    </Box>
  )
}
