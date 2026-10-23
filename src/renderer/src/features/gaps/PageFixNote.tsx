// PageFixNote — a line in a row's details saying the wiki page itself needs a fix (its imagefilename
// names another file, it states another faction amount, it lists a group's members one by one, the
// data has no page for the mob). A chip with a light red ground, not one more line of caption text
// (owner, 2026-10-22: "this warning is just noise it's hard to notice ... CHIP it and light red
// background it or something ... I almost didn't catch the filename issue").

import type { JSX, ReactNode } from 'react'
import { Box } from '@mui/material'
import { alpha } from '@mui/material/styles'
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined'

export default function PageFixNote({ children, testId }: { children: ReactNode; testId: string }): JSX.Element {
  return (
    <Box
      data-testid={testId}
      sx={(t) => ({
        // A block of its own content's width: one per line in the details, whatever lays them out.
        display: 'flex',
        width: 'fit-content',
        alignItems: 'center',
        maxWidth: '100%',
        my: 0.5,
        gap: 0.75,
        px: 1.25,
        py: 0.5,
        borderRadius: 4,
        border: 1,
        borderColor: alpha(t.palette.error.main, 0.6),
        bgcolor: alpha(t.palette.error.main, 0.15),
        color: t.palette.error.light,
        typography: 'body2',
        fontWeight: 600
      })}
    >
      <ReportProblemOutlinedIcon sx={{ fontSize: 18, flexShrink: 0 }} />
      <span>{children}</span>
    </Box>
  )
}
