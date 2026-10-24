// GapRowEdit — a Gaps row corrected by hand (owner, 2026-10-23: "Perhaps we should be able to EDIT
// values in the gaps tab?"): the Edit button beside the row's work buttons, its form, and the
// "edited" chip. What an edit does to the row and to Copy is shared/gapEdits.ts.

import { type JSX, type ReactNode, useState } from 'react'
import { Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, TextField } from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import { EDIT_FIELDS, editable, type GapEdit } from '@shared/gapEdits'
import type { GapRow } from '@shared/gaps'
import { Tooltip } from '../../lib/Tooltip'
import { saveGapEdit } from './gapEditsStore'

interface ActionProps {
  compact: boolean
  label: string
  tip: string
  icon: ReactNode
  onClick?: () => void
  testId: string
}

function EditForm({ row, onClose }: { row: GapRow; onClose: () => void }): JSX.Element {
  const [draft, setDraft] = useState<GapEdit>(row.edit ?? {})
  const fields = EDIT_FIELDS[row.domain] ?? []
  const setField = (key: string, value: string): void => setDraft((d) => ({ ...d, fields: { ...d.fields, [key]: value } }))
  const save = (edit: GapEdit | null): void => {
    saveGapEdit(row, edit)
    onClose()
  }
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth data-testid="gaps-edit-dialog" onClick={(e) => e.stopPropagation()}>
      <DialogTitle>Edit {row.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          <TextField size="small" label="Name" placeholder={row.name} value={draft.name ?? ''} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} data-testid="gaps-edit-name" />
          {fields.map((f) => (
            <TextField key={f.key} size="small" label={f.label} placeholder="as the log has it" value={draft.fields?.[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)} />
          ))}
          {(row.domain === 'mob' || row.domain === 'merchant') && (
            <FormControlLabel
              control={<Checkbox size="small" checked={draft.kind === 'mob'} onChange={(e) => setDraft((d) => ({ ...d, ...(e.target.checked ? { kind: 'mob' as const } : { kind: undefined }) }))} />}
              label="This is an NPC, not a player"
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {row.edit !== undefined && (
          <Button color="warning" onClick={() => save(null)} data-testid="gaps-edit-reset">
            Reset
          </Button>
        )}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => save(draft)} data-testid="gaps-edit-save">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** The row's Edit button and its form; nothing on a domain that takes no edits. */
export function EditRowButton({ row, compact, Action }: { row: GapRow; compact: boolean; Action: (p: ActionProps) => JSX.Element }): JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (!editable(row)) return null
  return (
    <>
      <Action compact={compact} label="Edit" tip="Correct this row's name or page values by hand." icon={<EditIcon fontSize="small" />} onClick={() => setOpen(true)} testId="gaps-edit" />
      {open && <EditForm row={row} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Beside a row's name: it carries the player's own corrections. */
export function EditedChip({ row }: { row: GapRow }): JSX.Element | null {
  if (row.edit === undefined) return null
  return (
    <Tooltip title={`You edited this row; the log has it as ${row.name}.`}>
      <Chip label="edited" size="small" variant="outlined" color="info" sx={{ ml: 1, height: 20 }} data-testid="gaps-edited" />
    </Tooltip>
  )
}
