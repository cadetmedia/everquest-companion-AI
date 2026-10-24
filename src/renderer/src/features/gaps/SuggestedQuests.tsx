// SuggestedQuests — the chains the engine rebuilt from the log for quests with no task line (owner,
// 2026-10-23: "would be nice if the thing could tie the steps together automatically"), each shown as a
// flow of steps with the reason each follows, a name to keep or change, and Accept, which makes it a
// Quests row like any other (its Copy writes the page). The visit picker stays for what no chain caught.

import { useState, type JSX } from 'react'
import { Box, Button, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { threadKey, threadStepLabel, threadStepWhy, type QuestThread } from '@shared/gapQuestThreads'
import { questTitleKey } from '@shared/gapQuests'
import { useForcedScope } from './ForcedQuests'
import { moveQuestJournal } from './itemShotsStore'

function ThreadCard({ thread, onAccept }: { thread: QuestThread; onAccept: (name: string) => void }): JSX.Element {
  const [name, setName] = useState(thread.name)
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, mb: 1 }} data-testid="thread-card">
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <TextField size="small" label="Quest name" value={name} onChange={(e) => setName(e.target.value)} sx={{ minWidth: 280 }} slotProps={{ htmlInput: { 'data-testid': 'thread-name' } }} />
        <Typography variant="caption" color="text.secondary">
          {thread.zone ?? ''} · {thread.steps.length} steps
        </Typography>
        <Tooltip title="Make this chain a quest you can copy to the wiki.">
          <span>
            <Button size="small" variant="contained" disabled={name.trim() === ''} onClick={() => onAccept(name.trim())} data-testid="thread-accept">
              Accept
            </Button>
          </span>
        </Tooltip>
      </Stack>
      <Box component="ol" sx={{ m: 0, pl: 3 }}>
        {thread.steps.map((s) => (
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

/** "Suggested quests" above the Quests list: nothing when the log rebuilt no chain. */
export function SuggestedQuests(): JSX.Element | null {
  const scope = useForcedScope()
  if (scope === null || scope.threads.length === 0) return null
  return (
    <Box sx={{ mb: 1.5 }} data-testid="suggested-quests">
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        Suggested quests, tied together from your log
      </Typography>
      {scope.threads.map((t) => (
        <ThreadCard key={threadKey(t)} thread={t} onAccept={(name) => {
            scope.accept(name, t)
            // Popups pasted onto the chain before it was a quest follow it (GlobalPaste.tsx keeps them under thread:<id>).
            moveQuestJournal(`thread:${t.id}`, questTitleKey(name))
          }} />
      ))}
    </Box>
  )
}
