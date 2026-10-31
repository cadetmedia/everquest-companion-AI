// The EverQuest Legends Compendium in the AI tools (owner, 2026-10-31): the dependency-free xlsx
// reader the refresh uses, the passages and search the tool runs, and the credit on an answer.

import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateRawSync } from 'node:zlib'
import { readZip, sheetRows, sharedStrings, relTargets, workbookText } from '../scripts/sources/xlsxText'
import { compendiumFromSheets, writeIfChanged, OUT_PATH, COMPENDIUM_URL } from '../scripts/scrape-compendium.mts'
import { compendium, guidesToolResult, passagesOf, queryTerms, searchCompendium, searchPassages } from '../src/main/ai/aiCompendium'
import { AI_TOOLS } from '../src/main/ai/aiToolDefs'
import { toolHintName, type AiPromptResult } from '../src/shared/aiChat'
import type { AiClient } from '../src/main/ai/AIClientFactory'

// aiAnswer reaches AiTools (Electron) through the clients; the fake client below never calls a tool.
mock.module('../src/main/ai/AiTools.ts', { namedExports: { executeToolCall: () => Promise.resolve('{}') } })
const { answerQuestion, COMPENDIUM_CITATION } = await import('../src/main/ai/aiAnswer.ts')

/** A minimal zip: one local header and one central record per file, deflated. */
function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text))
    const nameBuf = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt16LE(nameBuf.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBuf, data)
    centrals.push(central, nameBuf)
    offset += 30 + nameBuf.length + data.length
  }
  const dir = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, dir, end])
}

const SHEET = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" s="3"/></row>
<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>0.6506944444</v></c><c r="C2"><v>42</v></c></row>
<row r="3"><c r="A3" s="2"/></row>
<row r="4"><c r="A4" t="inlineStr"><is><t>Tom &amp; Jerry</t></is></c></row>
</sheetData><hyperlinks><hyperlink r:id="rId1" ref="A2"/><hyperlink location="gid=1" ref="A4"/></hyperlinks></worksheet>`
const SHARED = '<sst><si><t>What is a mote?</t></si><si><r><t>Ep</t></r><r><t xml:space="preserve"> 1</t></r></si></sst>'
const RELS =
  '<Relationships><Relationship Id="rId1" Type="x/hyperlink" Target="https://youtu.be/abc" TargetMode="External"/></Relationships>'

test('a sheet reads as rows of cell text, with external links and times as typed', () => {
  const rows = sheetRows(SHEET, sharedStrings(SHARED), relTargets(RELS))
  assert.deepEqual(rows, [['What is a mote?'], ['Ep 1 (https://youtu.be/abc)', '15:37', '42'], ['Tom & Jerry']])
})

test('a workbook reads tab by tab and skips hidden tabs', () => {
  const book = zip({
    'xl/workbook.xml':
      '<workbook><sheets><sheet state="visible" name="FAQ" sheetId="1" r:id="rId5"/><sheet state="hidden" name="Draft" sheetId="2" r:id="rId6"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<Relationships><Relationship Id="rId5" Target="worksheets/sheet1.xml"/><Relationship Id="rId6" Target="worksheets/sheet2.xml"/></Relationships>',
    'xl/sharedStrings.xml': SHARED,
    'xl/worksheets/sheet1.xml': SHEET,
    'xl/worksheets/_rels/sheet1.xml.rels': RELS,
    'xl/worksheets/sheet2.xml': SHEET
  })
  assert.equal(readZip(book).size, 6)
  const tabs = workbookText(book)
  assert.deepEqual(
    tabs.map((t) => t.name),
    ['FAQ']
  )
  assert.equal(tabs[0]?.rows[1]?.[0], 'Ep 1 (https://youtu.be/abc)')
})

test('the data file is rewritten only when the sheet text changed', () => {
  const root = mkdtempSync(join(tmpdir(), 'compendium-'))
  mkdirSync(join(root, 'src/main/data'), { recursive: true })
  const a = compendiumFromSheets([{ name: ' FAQ ', rows: [['Q?'], ['A', 'B']] }, { name: 'Empty', rows: [] }], '2026-10-31')
  assert.deepEqual(a.tabs, [{ name: 'FAQ', rows: ['Q?', 'A | B'] }])
  assert.equal(a.url, COMPENDIUM_URL)
  assert.equal(writeIfChanged(root, a), true)
  assert.equal(writeIfChanged(root, { ...a, fetchedAt: '2026-11-07' }), false)
  assert.equal((JSON.parse(readFileSync(join(root, OUT_PATH), 'utf8')) as { fetchedAt: string }).fetchedAt, '2026-10-31')
  assert.equal(writeIfChanged(root, { ...a, tabs: [{ name: 'FAQ', rows: ['Q?'] }] }), true)
})

test('a passage starts at a question, so the answer travels with it', () => {
  const long = 'x'.repeat(320) + '.'
  const ps = passagesOf({ name: 'DDD', rows: [long, 'What limits DDD?', 'Five targets.'] })
  assert.deepEqual(
    ps.map((p) => p.text),
    [long, 'What limits DDD?\nFive targets.']
  )
})

test('query terms drop filler words and a plural s', () => {
  assert.deepEqual(queryTerms("Where should I grind motes? Denon's"), ['grind', 'mote', 'denon'])
})

test('search ranks the passage holding every term first and needs half the terms', () => {
  const ps = [
    { tab: 'Grinding Motes', text: 'Levels 30-40 - Lower Guk. Kill frenzied ghouls.' },
    { tab: 'FAQ', text: 'Where does planar gear drop?' },
    { tab: 'Plane of Sky', text: 'Keys and motes.' }
  ]
  const hits = searchPassages(ps, 'lower guk motes')
  assert.equal(hits[0]?.tab, 'Grinding Motes')
  assert.equal(
    hits.some((h) => h.tab === 'FAQ'),
    false
  )
  assert.deepEqual(searchPassages(ps, 'the and of'), [])
})

test('the shipped Compendium is searchable', () => {
  assert.ok(compendium.tabs.length >= 10, 'tabs')
  assert.match(compendium.url, /^https:\/\/docs\.google\.com\//)
  assert.equal(searchCompendium('what limitations does DDD have')[0]?.tab, 'DDD')
  assert.equal(searchCompendium('dungeon crawl solo vs group')[0]?.tab, 'Dungeon Crawls')
})

test('search_guides is a tool with a hint, and its result names the source', () => {
  assert.ok(AI_TOOLS.some((t) => t.function.name === 'search_guides'))
  const out = JSON.parse(guidesToolResult('banestrike conquest')) as {
    source?: string
    hits: { tab: string }[]
  }
  assert.match(out.source ?? '', /Compendium by brutallstatic/)
  assert.equal(out.hits[0]?.tab, 'Banestrike')
  assert.equal(toolHintName('search_guides'), 'the Compendium')
})

function fakeClient(tools: string[], text: string): AiClient {
  return {
    sendPrompt: (_s: string, _t: string, opts?: { onChunk?: (c: { kind: string; tool?: string }) => void }) => {
      for (const tool of tools) opts?.onChunk?.({ kind: 'tool', tool })
      return Promise.resolve({ text, drafts: [] } as AiPromptResult)
    }
  } as unknown as AiClient
}

function ask(client: AiClient): Promise<AiPromptResult> {
  return answerQuestion({
    provider: 'openrouter',
    key: 'k',
    model: 'm',
    client,
    baseSystem: '',
    text: 'where do I grind motes?',
    history: [],
    trusted: [],
    close: [],
    scope: 'auto',
    emit: () => undefined
  })
}

test('an answer that used the Compendium credits it; one that did not carries no citation', async () => {
  const used = await ask(fakeClient(['search_guides'], 'Lower Guk, per the Compendium.'))
  assert.equal(used.source, 'local')
  assert.deepEqual(used.citations, [COMPENDIUM_CITATION])
  const wiki = await ask(fakeClient(['search_items'], 'It drops from a bat.'))
  assert.equal(wiki.source, 'local')
  assert.equal(wiki.citations, undefined)
})
