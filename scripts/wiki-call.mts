// wiki-call.mts — the one way a person or an agent reads the wiki by hand, instead of curl (owner,
// 2026-10-23: every eqlwiki call is counted, whatever it was for). It sends through wikiApi.ts (the
// fork's User-Agent, 1 request per second, maxlag) and writes one ledger line with its reason.
//
//   npx tsx scripts/wiki-call.mts --reason "<why>" action=parse page="Unfortunate News" prop=wikitext
//
// Prints the JSON answer. `--api=<url>` asks another MediaWiki (the P99 wiki); the default is eqlwiki.

import { EQL_API, wikiGet } from './sources/wikiApi'
import { setWikiRun } from './sources/wikiLedger'

const args = process.argv.slice(2)
const reasonAt = args.findIndex((a) => a === '--reason' || a.startsWith('--reason='))
const reason = reasonAt < 0 ? '' : args[reasonAt].includes('=') ? args[reasonAt].slice('--reason='.length) : (args[reasonAt + 1] ?? '')
const api = args.find((a) => a.startsWith('--api='))?.slice('--api='.length) ?? EQL_API
const params: Record<string, string> = {}
args.forEach((a, i) => {
  if (a.startsWith('--') || (reasonAt >= 0 && i === reasonAt + 1 && !args[reasonAt].includes('='))) return
  const eq = a.indexOf('=')
  if (eq > 0) params[a.slice(0, eq)] = a.slice(eq + 1)
})

if (reason.trim() === '' || params.action === undefined) {
  console.error('Usage: npx tsx scripts/wiki-call.mts --reason "<why>" action=<action> [key=value ...] [--api=<url>]')
  console.error('The reason goes into docs/community/wiki-usage/ledger.jsonl with the call.')
  process.exit(2)
}

setWikiRun('ad-hoc', reason.trim())
const answer = await wikiGet<unknown>(params, api)
console.log(JSON.stringify(answer, null, 2))
