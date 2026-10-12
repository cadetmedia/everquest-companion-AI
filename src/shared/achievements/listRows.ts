// achievements/listRows.ts — the Achievements list as ONE ROW LIST: each section's heading, then
// its achievements, in the section's order. The list is windowed (features/achievements/
// listWindow.ts), and a window wants one flat list with a height for every row; a heading is a
// row of its own height rather than a box around its achievements.

import type { BookAchievement, BookGroup } from '../outputs/achievementBook'
import type { BookSection } from './bookRows'

export type ListRow =
  | { kind: 'heading'; group: BookGroup }
  | { kind: 'achievement'; group: BookGroup; achievement: BookAchievement }

export function listRows(sections: readonly BookSection[]): ListRow[] {
  const rows: ListRow[] = []
  for (const { group, achievements } of sections) {
    rows.push({ kind: 'heading', group })
    for (const achievement of achievements) rows.push({ kind: 'achievement', group, achievement })
  }
  return rows
}

/** A row's key: the group for a heading, the achievement under its group otherwise. The file prints
 *  a name once per group, and the key is what a row's open state and measured height are kept under. */
export function rowKey(row: ListRow): string {
  return row.kind === 'heading'
    ? `#${row.group.category}`
    : `${row.group.category}/${row.achievement.name}`
}
