// mobPicture.ts — a pasted picture of a mob, for its wiki page's image (owner, 2026-10-21): what a
// save answers, and whether the picture shows the mob's nameplate. Pure; main does the saving and
// the OCR (src/main/ipc/shotPicture.ts).

/**
 * The file name a picture is written under: no folder parts, no characters Windows refuses, and always
 * `.png` (main writes PNG bytes, and a renderer that asked for `x.bat` must not get one).
 */
export function pictureFileName(asked: string): string {
  // Code unit by code unit: control characters (below 32) and the ones Windows refuses become `_`.
  const units = Array.from({ length: asked.length }, (_, i) => asked.charCodeAt(i))
  const base = String.fromCharCode(...units.map((c) => (c < 32 || '\\/:*?"<>|'.includes(String.fromCharCode(c)) ? 95 : c)))
    .replace(/\.[^.]*$/, '')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 120)
  return `${base === '' ? 'picture' : base}.png`
}

/** What saving a pasted mob picture came to. */
export type PictureSave =
  /** `checkId` asks main for the nameplate check on the picture it already decoded. */
  | { status: 'saved'; path: string; checkId: number }
  /** The auto-save folder already holds this file name: replace it only when the player says. */
  | { status: 'exists'; path: string }
  | { status: 'cancelled' }
  /** Blank or near one colour: not a picture of anything. */
  | { status: 'blank' }
  | { status: 'error'; message: string }

const squash = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, '')

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}

/** The name as a nameplate prints it, letters only: a `(Zone)` qualifier dropped; with and without its article. */
function targets(name: string): string[] {
  const bare = name.replace(/\s*\([^)]*\)\s*$/, '').trim()
  const noArticle = bare.replace(/^(a|an|the)\s+/i, '')
  return [...new Set([squash(bare), squash(noArticle)])].filter((t) => t.length >= 3)
}

/**
 * Whether the OCR'd text of a picture holds the mob's name, loosely (owner, 2026-10-21): letters
 * only, case and spaces ignored, the `(Zone)` qualifier dropped, a slip or two allowed in a long name.
 */
export function nameInLines(name: string, lines: readonly string[]): boolean {
  const text = squash(lines.join(' '))
  return targets(name).some((t) => {
    if (text.includes(t)) return true
    const slips = Math.floor(t.length / 6)
    if (slips === 0) return false
    // Windows a slip shorter or longer too: a misread letter dropped (`Thagge1um`) or doubled.
    for (let len = t.length - slips; len <= t.length + slips; len++) {
      for (let i = 0; i + len <= text.length; i++) if (editDistance(text.slice(i, i + len), t) <= slips) return true
    }
    return false
  })
}
