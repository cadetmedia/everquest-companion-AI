// itemWindowNumbers — the numbers an item window prints, as the reader (shared/itemWindow.ts) takes them.
// A stat or a weapon number is always a number, so a misread one never reaches the page unchecked
// (owner, 2026-10-24: `Stamina: 7` read `PT`, `Base Dmg: 5` read `%`, `Mana: 15` read `a5`). Only a
// confident look-alike becomes a digit; anything else is left as read, with a note to fix it.

const SIGNED = /^[+-]?\d+(?:\.\d+)?%?$/

/** `15` -> `+15`, `-20` stays; anything not a number is kept as read. */
export function signed(v: string): string {
  return SIGNED.test(v) && !/^[+-]/.test(v) ? `+${v}` : v
}

/** What a digit looks like in OCR's misreads of the window's font. */
const DIGIT_LOOK: Readonly<Record<string, string>> = { O: '0', o: '0', D: '0', Q: '0', l: '1', I: '1', i: '1', '|': '1', '!': '1', T: '7', S: '5', s: '5', B: '8', Z: '2', z: '2', G: '6', b: '6' }

/** The text with every look-alike as its digit; undefined when any other character is in it. */
function lookDigits(text: string, extra: Readonly<Record<string, string>> = {}): string | undefined {
  let out = ''
  for (const ch of text) {
    const d = /\d/.test(ch) ? ch : (extra[ch] ?? DIGIT_LOOK[ch])
    if (d === undefined) return undefined
    out += d
  }
  return out === '' ? undefined : out
}

const notNumber = (key: string, t: string): { value: string; note: string } => ({ value: t, note: `${key} read "${t}", not a number: fix it against the window before saving.` })
const takenAs = (key: string, t: string, value: string): { value: string; note: string } => ({ value, note: `${key} read "${t}", taken as ${value}: check it against the window.` })

/** A stat's value, signed: as read when it is a number; its look-alikes as digits with a note; else as read with a note. */
export function statValue(key: string, v: string): { value: string; note?: string } {
  const t = v.trim()
  if (SIGNED.test(t)) return { value: signed(t) }
  // Marks before the number are smudges (owner, 2026-10-24: `DEX: ~~ 13`); only + and - mean anything there.
  const bare = t.replace(/^[~'`"_.,:;*^\s]+/, '')
  if (bare !== t && SIGNED.test(bare)) return takenAs(key, t, signed(bare))
  const m = /^([+-]?)(.*?)(%?)$/.exec(t)
  const digits = lookDigits(m?.[2] ?? t)
  return digits === undefined ? notNumber(key, t) : takenAs(key, t, signed(`${m?.[1] ?? ''}${digits}${m?.[3] ?? ''}`))
}

/** The weapon numbers the window prints as a bare whole number (not Bane DMG's `Undead +25`, not Ratio). */
const WEAPON_NUMBERS = new Set(['DMG', 'BACKSTAB', 'Atk Delay', 'Range', 'Dmg Bon'])

/** A weapon number as read when it is one; else its look-alikes (`%` too) as digits with a note; else as read with a note. Other weapon lines as read. */
export function weaponValue(key: string, v: string): { value: string; note?: string } {
  const t = v.trim()
  if (!WEAPON_NUMBERS.has(key) || /^\d+$/.test(t)) return { value: t }
  const digits = lookDigits(t.replace(/\s+/g, ''), { '%': '5' })
  return digits === undefined ? notNumber(key, t) : takenAs(key, t, digits)
}

/** OCR loses Weight's point (`2.0` -> `20`, `0.4` -> `04`); the game always prints one decimal. */
export function weightValue(v: string): string {
  const t = v.replace(',', '.').replace(/[^0-9.]/g, '')
  if (/^\d+\.\d$/.test(t)) return t
  return /^\d{2,}$/.test(t) ? `${String(Number(t.slice(0, -1)))}.${t.slice(-1)}` : t
}
