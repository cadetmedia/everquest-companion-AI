// useOwnCharacters — the player's own characters: every eqlog_<Name>_<server>.txt in the Logs folder,
// the title bar's character list. Their names are never a Gaps row, in one character's view or under
// All characters (owner, 2026-10-22: a /con with nothing targeted filed the player as a mob, "this is me").

import { useEffect, useState } from 'react'

const NONE: readonly string[] = []
/** The last answer, so a remount of the tab starts with it. */
let known: readonly string[] = NONE

/** The own characters' names; empty until main answers. */
export function useOwnCharacterNames(): readonly string[] {
  const [names, setNames] = useState(known)
  useEffect(() => {
    let live = true
    window.eq
      .listCharacters()
      .then((refs) => {
        const next = refs.map((c) => c.name)
        known = next
        if (live) setNames((cur) => (cur.join('|') === next.join('|') ? cur : next))
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])
  return names
}
