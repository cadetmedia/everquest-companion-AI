// TWO WIKI PAGES UNDER ONE NAME, AND THE ONE EQ LEGENDS RUNS WINS.
//
// eqlwiki documents some spells twice under the SAME title: a classic-EverQuest page and a page
// written for this server, and the scrape keeps both because `spells.json` is pristine by design.
// The spellbook then draws the spell twice, with two sets of numbers, and only one of them is what
// the client casts (owner report, 2026-09-12: "showing 2 of the same spell").
//
// WHICH PAGE IS THE SERVER'S IS STATED ON THE PAGE. The Legends wiki marks a class line
// `(Autogranted)` when this server hands the spell out at the level rather than selling a scroll,
// and only the page written for this server carries that note. Measured over the committed
// corpus against the owner's `spells_us.txt` (2026-09-12): six names carry a page with the note
// beside a page without it, and for every one of the four the client has a row for (Burst of
// Flame, Greater Healing, Healing, Anthem De Arms) the client's mana and cast time are the
// autogranted page's, not the other's. The other two (O'Keils Radiation, Shock of Frost) differ
// from their twin in level or damage the same way. This pass drops the page without the note.
//
// WHY THIS IS NOT A REMOVAL. `spellRemovals.ts` takes every row of a name, because absence is a
// claim about the NAME; this is a claim about which of two rows under one name is the game's, and
// a removal cannot express it. It is also not a correction: nothing on the surviving row is edited.
// It is a rule rather than a list because the evidence is the page's own note, not a per-spell
// look, and the report names every name it touched so the boot log and the audit can read the
// list the rule produced.
//
// A name whose rows ALL carry the note, or none of them, is untouched: rank and era siblings that
// legitimately differ in their messages (`rowsFor` in spellCorrections.ts) stay as they are.
//
// AND THE MESSAGES DECIDE WHETHER TWO ROWS ARE ONE SPELL AT ALL - the guard levelUnlocks.ts learned
// on 2026-09-10 (`couldBeSameSpell`: a friend's druid lost Healing Water, which the wiki files as a
// second `Greater Healing`, Druid 34, whose message reads "Healing water flows over you"). The
// first cut of this pass dropped that row again, one day after test.11 shipped its fix, because
// "same name, one page noted" looked like the same rule. It is not: of the six contested names,
// three pairs print identical sentences (Anthem De Arms, Burst of Flame, O'Keils Radiation) and are
// one spell on two pages; three do not (Greater Healing, Healing, Shock of Frost) and are two
// spells sharing a title. A classic row is dropped ONLY when a noted row of its name prints the
// same three messages. The other three pairs stay as two rows, and Shock of Frost's answer is a
// rename (its Legends page is Blast of Cold, by the owner's log), not a preference.
import type { SpellEntry } from '../../shared/buffTypes'

export interface PagePreferenceReport {
  /** Rows dropped, counted per ROW. */
  dropped: number
  /** The names that had a classic page beside a Legends page, in corpus order. */
  names: string[]
}

const AUTOGRANT_NOTE = '(Autogranted)'

function isLegendsPage(s: SpellEntry): boolean {
  return (s.classes ?? '').includes(AUTOGRANT_NOTE)
}

/** "The same name" ignores apostrophe style, apostrophe placement and case: the wiki carries
 *  `O'Keils Radiation` beside `O\`Keil's Radiation` (owner, 2026-10-10: fold these, no hand entry). */
const nameKey = (s: SpellEntry): string => s.name.replace(/[`'’]/g, '').toLowerCase()

/** The three sentences a page prints, as one comparable string. */
function sentences(s: SpellEntry): string {
  return JSON.stringify([s.msgCastOnYou ?? null, s.msgCastOnOther ?? null, s.msgWearsOff ?? null])
}

let lastReport: PagePreferenceReport | null = null

/** What the last `applyLegendsPagePreference` did (the boot line and the audit suite). */
export function spellPagePreferenceReport(): PagePreferenceReport | null {
  return lastReport
}

/**
 * Keep, for every name that has one, only the rows whose class line carries the Legends
 * `(Autogranted)` note. Runs after the corrections (spellDb.ts says why) and before the placeholder
 * pass and every derived table, so the catalog, the level unlocks and the spellbook all see one row
 * where the wiki had two.
 */
export function applyLegendsPagePreference(spells: readonly SpellEntry[]): {
  spells: SpellEntry[]
  report: PagePreferenceReport
} {
  // folded name -> the sentence sets its noted pages print
  const legends = new Map<string, Set<string>>()
  for (const s of spells) {
    if (!isLegendsPage(s)) continue
    const set = legends.get(nameKey(s)) ?? new Set<string>()
    set.add(sentences(s))
    legends.set(nameKey(s), set)
  }
  const dropped = (s: SpellEntry): boolean =>
    !isLegendsPage(s) && (legends.get(nameKey(s))?.has(sentences(s)) ?? false)
  const out = spells.filter((s) => !dropped(s))
  const names: string[] = []
  for (const s of spells) if (dropped(s) && !names.includes(s.name)) names.push(s.name)
  lastReport = { dropped: spells.length - out.length, names }
  return { spells: out, report: lastReport }
}
