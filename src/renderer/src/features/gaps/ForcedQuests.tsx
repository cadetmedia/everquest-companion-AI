// ForcedQuests — naming a quest by hand (owner, 2026-10-23: "i need to be able to force a quest
// association"). The EverQuest Legends Tutorial's Doug gives errands with no task line, so no Quests row
// can come of the log alone. "Add quest" picks NPC visits no task line claimed (the engine's `talks`) and
// names the quest; a row's "Add talk" adds visits to it; "Remove" undoes either. A named row wears
// "added by you", so it is never taken for a logged task.

import { createContext, useContext, useState, type JSX, type ReactNode } from 'react'
import { Autocomplete, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItemButton, ListItemIcon, ListItemText, TextField, Tooltip, Typography } from '@mui/material'
import AddCommentIcon from '@mui/icons-material/AddCommentOutlined'
import LinkOffIcon from '@mui/icons-material/LinkOff'
import type { GapRow } from '@shared/gaps'
import { addedVisits, isForcedRow, pickedVisits, visitGist, type TalkVisit } from '@shared/gapForcedQuests'
import type { RowFactContext } from '@shared/gapQuestPage'
import { QuestCopyScope } from './QuestCopyDialog'
import type { ForcedQuests } from './useForcedQuests'

export interface ForcedScope extends ForcedQuests {
  /** The visits no task line or named quest holds yet. */
  talks: readonly TalkVisit[]
  /** The catalog's quest titles, offered as names so an existing page can be picked. */
  titles: readonly string[]
}

const ForcedContext = createContext<ForcedScope | null>(null)

/** What every quest row under it reads: the Copy merge's page context, and the named quests. */
export function QuestScopes({ extras, forced, children }: { extras: RowFactContext; forced: ForcedScope; children: ReactNode }): JSX.Element {
  return (
    <QuestCopyScope extras={extras}>
      <ForcedContext.Provider value={forced}>{children}</ForcedContext.Provider>
    </QuestCopyScope>
  )
}

/** The visits to pick from: NPC, zone and time, then the NPC's first line. */
function VisitList({ talks, picked, onToggle }: { talks: readonly TalkVisit[]; picked: ReadonlySet<string>; onToggle: (id: string) => void }): JSX.Element {
  if (talks.length === 0) return <Typography variant="body2" color="text.secondary">No NPC talk left to add. Hail an NPC first.</Typography>
  return (
    <List dense sx={{ maxHeight: '45vh', overflow: 'auto' }} data-testid="forced-visits">
      {[...talks].reverse().map((v) => (
        <ListItemButton key={v.id} onClick={() => onToggle(v.id)} data-testid="forced-visit">
          <ListItemIcon sx={{ minWidth: 36 }}>
            <Checkbox edge="start" size="small" checked={picked.has(v.id)} tabIndex={-1} disableRipple />
          </ListItemIcon>
          <ListItemText primary={`${v.npc} · ${v.zone ?? 'unknown zone'} · ${v.at}`} secondary={visitGist(v)} />
        </ListItemButton>
      ))}
    </List>
  )
}

/** Pick visits and name the quest; with `fixedName`, add visits to that quest. */
function AddQuestDialog({ scope, fixedName, onClose }: { scope: ForcedScope; fixedName?: string; onClose: () => void }): JSX.Element {
  const [name, setName] = useState(fixedName ?? '')
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string): void => setPicked((cur) => (cur.has(id) ? new Set([...cur].filter((x) => x !== id)) : new Set([...cur, id])))
  const ready = name.trim() !== '' && picked.size > 0
  const save = (): void => {
    scope.add(name.trim(), pickedVisits(scope.talks, picked))
    onClose()
  }
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth data-testid="forced-dialog" onClick={(e) => e.stopPropagation()}>
      <DialogTitle>{fixedName === undefined ? 'Add a quest from NPC talk' : `Add talk to ${fixedName}`}</DialogTitle>
      <DialogContent>
        {fixedName === undefined && (
          <Autocomplete
            freeSolo
            options={scope.titles}
            inputValue={name}
            onInputChange={(_e, v) => setName(v)}
            renderInput={(p) => <TextField {...p} label="Quest name" size="small" sx={{ mt: 1, mb: 1 }} slotProps={{ htmlInput: { ...p.inputProps, 'data-testid': 'forced-name' } }} />}
          />
        )}
        <VisitList talks={scope.talks} picked={picked} onToggle={toggle} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!ready} onClick={save} data-testid="forced-save">
          {fixedName === undefined ? 'Add quest' : 'Add talk'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** "Add quest", beside the Quests list's controls. */
export function AddQuestButton(): JSX.Element | null {
  const scope = useContext(ForcedContext)
  const [open, setOpen] = useState(false)
  if (scope === null) return null
  return (
    <>
      <Tooltip title="Make a quest from NPC talk the log shows no task for.">
        <Button size="small" variant="outlined" onClick={() => setOpen(true)} data-testid="forced-add">
          Add quest
        </Button>
      </Tooltip>
      {open && <AddQuestDialog scope={scope} onClose={() => setOpen(false)} />}
    </>
  )
}

/** GapRowButtons' own button, handed in so the row's controls look and behave as one set. */
type Action = (p: { compact: boolean; label: string; tip: string; icon: ReactNode; onClick?: () => void; testId: string }) => JSX.Element

/** A Quests row's "Add talk", and "Remove" when the player tied talk to it. */
export function ForcedRowButtons({ row, compact, Action }: { row: GapRow; compact: boolean; Action: Action }): JSX.Element | null {
  const scope = useContext(ForcedContext)
  const [open, setOpen] = useState(false)
  if (scope === null || row.domain !== 'quest') return null
  const forced = isForcedRow(row)
  const removeTip = forced ? 'Remove this quest you added; its talk returns to the list.' : 'Remove the talk you added to this quest.'
  return (
    <>
      <Action compact={compact} label="Add talk" tip="Add NPC talk from your log to this quest." icon={<AddCommentIcon fontSize="small" />} onClick={() => setOpen(true)} testId="forced-add-talk" />
      {(forced || addedVisits(row) > 0) && <Action compact={compact} label="Remove" tip={removeTip} icon={<LinkOffIcon fontSize="small" />} onClick={() => scope.remove(row.name)} testId="forced-remove" />}
      {open && <AddQuestDialog scope={scope} fixedName={row.name} onClose={() => setOpen(false)} />}
    </>
  )
}

/** "added by you" on a quest the player named. */
export function ForcedChip({ row }: { row: GapRow }): JSX.Element | null {
  if (!isForcedRow(row)) return null
  return (
    <Tooltip title="You named this quest; the log printed no task for it.">
      <Chip label="added by you" size="small" variant="outlined" sx={{ ml: 1, height: 20 }} data-testid="gaps-forced" />
    </Tooltip>
  )
}
