// SearchField — the app's one search box with a clear button: a small TextField with a magnifier at
// the start and, while there is text, an X at the end that empties it.
//
// The alerts toolbar, the best-spells readout and the "New at this level" panel each drew this same
// box. What differs between them is passed in, so each keeps exactly the box it had: its
// placeholder, its test handles (and which element carries them), its aria wording, and its sizes.

import type { JSX } from 'react'
import { IconButton, InputAdornment, TextField, type SxProps, type Theme } from '@mui/material'
import ClearIcon from '@mui/icons-material/Clear'
import SearchIcon from '@mui/icons-material/Search'

/** Pixel sizes for the two icons. Absent, both icons are MUI's `small` size in the default color. */
export interface SearchFieldIconSizes {
  /** the magnifier, drawn in `text.disabled` */
  search: number
  /** the clear X */
  clear: number
}

export interface SearchFieldProps {
  query: string
  onChange: (q: string) => void
  placeholder: string
  /** the box's test handle; `testidOnRoot` says which element carries it */
  testid: string
  /** the clear button's test handle */
  clearTestid: string
  /** put `testid` on the TextField's root rather than on the `<input>` itself */
  testidOnRoot?: boolean
  /** the `<input>`'s aria-label; absent, the input carries none */
  ariaLabel?: string
  /** the clear button's aria-label */
  clearLabel: string
  sx: SxProps<Theme>
  iconSizes?: SearchFieldIconSizes
  /** the leading adornment's sx */
  startSx?: SxProps<Theme>
}

function SearchGlyph({ sizes }: { sizes?: SearchFieldIconSizes }): JSX.Element {
  return sizes ? (
    <SearchIcon sx={{ fontSize: sizes.search, color: 'text.disabled' }} />
  ) : (
    <SearchIcon fontSize="small" />
  )
}

function ClearGlyph({ sizes }: { sizes?: SearchFieldIconSizes }): JSX.Element {
  return sizes ? <ClearIcon sx={{ fontSize: sizes.clear }} /> : <ClearIcon fontSize="small" />
}

/** The box. Controlled: the owner holds the query, because the owner is what reacts to it. */
export function SearchField(p: SearchFieldProps): JSX.Element {
  const htmlInput = p.testidOnRoot ? undefined : { 'data-testid': p.testid, 'aria-label': p.ariaLabel }
  return (
    <TextField
      size="small"
      data-testid={p.testidOnRoot ? p.testid : undefined}
      placeholder={p.placeholder}
      value={p.query}
      onChange={(e) => p.onChange(e.target.value)}
      sx={p.sx}
      slotProps={{
        htmlInput,
        input: {
          startAdornment: (
            <InputAdornment position="start" sx={p.startSx}>
              <SearchGlyph sizes={p.iconSizes} />
            </InputAdornment>
          ),
          endAdornment:
            p.query === '' ? undefined : (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  aria-label={p.clearLabel}
                  data-testid={p.clearTestid}
                  onClick={() => p.onChange('')}
                >
                  <ClearGlyph sizes={p.iconSizes} />
                </IconButton>
              </InputAdornment>
            )
        }
      }}
    />
  )
}
