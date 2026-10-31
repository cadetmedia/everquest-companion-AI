// xlsxText.ts — the text of an .xlsx workbook, tab by tab, with no dependency: an .xlsx is a zip of
// XML, and Node's zlib inflates its entries. Used by scrape-compendium.mts; dev time, never the app.
//
// It reads only what a guide sheet needs: cell text (shared, inline and formula strings), numbers,
// and each cell's external hyperlink. Styles, drawings and in-sheet links (a `location` with no
// relationship target) are skipped.

import { inflateRawSync } from 'node:zlib'

export interface SheetText {
  name: string
  /** Each non-empty row's cells, in column order, with a link appended as `(url)`. */
  rows: string[][]
}

/** Every file in a zip, by name. Reads the central directory, so data descriptors do not matter. */
export function readZip(buf: Buffer): Map<string, Buffer> {
  let eocd = buf.length - 22
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--
  if (eocd < 0) throw new Error('not a zip file (no end-of-central-directory record)')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const out = new Map<string, Buffer>()
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip central directory is corrupt')
    const method = buf.readUInt16LE(p + 10)
    const size = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const raw = buf.subarray(start, start + size)
    if (method === 0) out.set(name, raw)
    else if (method === 8) out.set(name, inflateRawSync(raw))
    else throw new Error(`zip entry ${name} uses unsupported method ${String(method)}`)
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export function xmlText(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e.startsWith('#x') || e.startsWith('#X')) return String.fromCodePoint(parseInt(e.slice(2), 16))
    if (e.startsWith('#')) return String.fromCodePoint(parseInt(e.slice(1), 10))
    return ENTITIES[e] ?? m
  })
}

/** Every `<t>` run inside a fragment, joined: rich text is split into runs. */
function runsText(xml: string): string {
  let out = ''
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += xmlText(m[1] ?? '')
  return out
}

export function sharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => runsText(m[1] ?? ''))
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)
  return m ? xmlText(m[1] ?? '') : undefined
}

/** Relationship id to external target, from a sheet's `_rels` file. */
export function relTargets(xml: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of xml.matchAll(/<Relationship\s[^>]*>/g)) {
    const id = attr(m[0], 'Id')
    const target = attr(m[0], 'Target')
    if (id && target && attr(m[0], 'TargetMode') === 'External') out.set(id, target)
  }
  return out
}

/** A number as the sheet's author typed it: a time of day (a fraction of a day) as h:mm. */
function numberText(v: string): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return v
  if (n > 0 && n < 1) {
    const mins = Math.round(n * 24 * 60)
    return `${String(Math.floor(mins / 60))}:${String(mins % 60).padStart(2, '0')}`
  }
  return String(n)
}

function cellValue(tag: string, body: string, shared: readonly string[]): string {
  const type = attr(tag, 't')
  if (type === 'inlineStr') return runsText(body)
  const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
  if (v === undefined) return ''
  if (type === 's') return shared[Number(v)] ?? ''
  if (type === 'str' || type === 'e') return xmlText(v)
  if (type === 'b') return v === '1' ? 'TRUE' : 'FALSE'
  return numberText(v)
}

/** Cell ref to link target, for the hyperlinks that leave the workbook. */
function sheetLinks(xml: string, rels: ReadonlyMap<string, string>): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of xml.matchAll(/<hyperlink\s[^>]*>/g)) {
    const ref = attr(m[0], 'ref')
    const target = rels.get(attr(m[0], 'r:id') ?? '')
    if (ref && target) out.set(ref.split(':')[0] ?? ref, target)
  }
  return out
}

/** A cell's text with its link appended, unless the text already shows it. */
function cellWithLink(raw: string, link: string | undefined): string {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!link) return text
  if (!text) return link
  return text.includes(link) ? text : `${text} (${link})`
}

export function sheetRows(xml: string, shared: readonly string[], rels: ReadonlyMap<string, string>): string[][] {
  const links = sheetLinks(xml, rels)
  const rows: string[][] = []
  for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = []
    for (const c of (row[1] ?? '').matchAll(/<c(\s[^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = c[1] ?? ''
      const text = cellWithLink(cellValue(tag, c[2] ?? '', shared), links.get(attr(tag, 'r') ?? ''))
      if (text) cells.push(text)
    }
    if (cells.length > 0) rows.push(cells)
  }
  return rows
}

/** Resolve a workbook relationship target to its zip path (`worksheets/sheet1.xml` → `xl/...`). */
function zipPath(target: string): string {
  return target.startsWith('/') ? target.slice(1) : `xl/${target}`
}

export function workbookText(buf: Buffer): SheetText[] {
  const files = readZip(buf)
  const read = (name: string): string => files.get(name)?.toString('utf8') ?? ''
  const shared = sharedStrings(read('xl/sharedStrings.xml'))
  const bookRels = new Map<string, string>()
  for (const m of read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\s[^>]*>/g)) {
    const id = attr(m[0], 'Id')
    const target = attr(m[0], 'Target')
    if (id && target) bookRels.set(id, target)
  }
  const out: SheetText[] = []
  for (const m of read('xl/workbook.xml').matchAll(/<sheet\s[^>]*>/g)) {
    if (attr(m[0], 'state') === 'hidden') continue
    const target = bookRels.get(attr(m[0], 'r:id') ?? '')
    if (!target) continue
    const path = zipPath(target)
    const relsPath = path.replace(/([^/]+)$/, '_rels/$1.rels')
    const rows = sheetRows(read(path), shared, relTargets(read(relsPath)))
    out.push({ name: attr(m[0], 'name') ?? path, rows })
  }
  return out
}
