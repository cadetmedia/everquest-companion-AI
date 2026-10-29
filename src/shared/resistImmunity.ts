// AN IMMUNITY IS NOT A RESIST (owner, 2026-10-28: "immune to something is not a resist to that magic
// type, it's a separate thing to be immune to something like snare").
//
// When the target is immune to the whole spell the game says so to the caster, then prints the
// ordinary `<mob> resisted your <Spell>!` for the same cast, in the same second. The owner's log:
//
//   [Sat Oct 24 02:16:44 2026] Your target is immune to root spells.
//   [Sat Oct 24 02:16:44 2026] C`rate resisted your Instill II!
//   [Fri Sep 25 23:07:42 2026] This NPC cannot be charmed.
//   [Fri Sep 25 23:07:42 2026] A kobold noble resisted your Beguile!
//
// Counted as a resist, that line says "this mob resists the spell's axis", which is false: the roll
// never happened. So the fold files it as `immune` on the same row and the estimate never reads it.
// The engine's fold (`engine/crates/fold/src/modules/resist/mod.rs is_immunity_sentence`) is the
// live one and carries the same list; this copy serves the baseline miner, which still runs the
// TypeScript fold.

/** How far apart the sentence and the resist it explains may sit: the log's own one second. */
export const IMMUNE_PAIR_MS = 1000

const PULL_FAMILY_TAILS = [' is immune to Fade spells.', ' is immune to pull spells.', ' is immune to gravitate spells.']

/**
 * The client's immunity sentences (`eqstr_us.txt` 239-244, 267, 612, 7019, 7029, 9243, 9245). The
 * two "portion of this effect" sentences are NOT immunities to the spell: the e2e fixture shows the
 * stun-portion line followed by the spell LANDING, so arming on it would turn the next unrelated
 * resist into an immunity.
 */
export function isImmunitySentence(text: string): boolean {
  if (text.endsWith(' portion of this effect.')) return false
  if (text.startsWith('Your target is immune to ') || text.startsWith('Your target cannot be mesmerized')) return true
  if (text === 'This NPC cannot be charmed.') return true
  return PULL_FAMILY_TAILS.some((tail) => text.endsWith(tail))
}

/** The message part of a raw log line: everything after the `[timestamp] ` prefix. */
export function messageTextOf(raw: string): string {
  const at = raw.indexOf('] ')
  return at < 0 ? raw : raw.slice(at + 2)
}
