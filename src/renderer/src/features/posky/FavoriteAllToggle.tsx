import type { JSX } from 'react'
import { Checkbox, FormControlLabel } from '@mui/material'
import StarIcon from '@mui/icons-material/Star'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import StarHalfIcon from '@mui/icons-material/StarHalf'
import type { QuestFlagSet } from '../favorites/useQuestFlags'

// "Favorite all shown" (sky-quest-overlay): the quest list's header checkbox. It stars every quest
// the tab shows after its filters, or, when all of them are starred already, unstars them all; a
// mixed list shows a half star. Starred quests are what the Sky quest overlay lists. No hover text
// (JOS-143 keeps hoverables off the controls above these rows), so the label says what it does.

export default function FavoriteAllToggle({
  quests,
  favorites,
  testId
}: {
  quests: readonly { key: string }[]
  favorites: QuestFlagSet
  testId: string
}): JSX.Element {
  let starred = 0
  for (const q of quests) if (favorites.has(q.key)) starred++
  const all = quests.length > 0 && starred === quests.length
  return (
    <FormControlLabel
      sx={{ mr: 0, flexShrink: 0 }}
      control={
        <Checkbox
          data-testid={testId}
          size="small"
          checked={all}
          indeterminate={starred > 0 && !all}
          disabled={quests.length === 0}
          icon={<StarBorderIcon fontSize="small" />}
          checkedIcon={<StarIcon fontSize="small" />}
          indeterminateIcon={<StarHalfIcon fontSize="small" />}
          onChange={() => {
            favorites.setMany(
              quests.map((q) => q.key),
              !all
            )
          }}
          sx={{ p: 0.5, '&.Mui-checked, &.MuiCheckbox-indeterminate': { color: 'warning.main' } }}
        />
      }
      label={`Favorite all shown (${String(quests.length)})`}
    />
  )
}
