// shared/gapNotices.ts — the Notices domain's chip (owner, 2026-10-22: "if we've seen a mob, we need
// to go update to remove this text that it doesn't exist in the current era"). The engine files the
// rows (gaps_notices.rs); this words the work: edit the page, the notice off, the log's lines cited.
// Apart from gaps.ts, which sits at its size ceiling.

import { wikiEditUrl, type GapAction, type GapRow } from './gaps'

/** The page's notices as the wiki shows them: `{{DNE}}`, `{{delete}}` with its reason. */
export function noticeWords(row: GapRow): string {
  return (row.notices ?? []).map((n) => (n === 'DNE' ? '{{DNE}} (not Legends)' : `{{${n.replace(/^delete: /, 'delete|')}}}`)).join(' and ')
}

/** A notice row's chip: edit the page, the notice off, the lines that prove the log met it cited. */
export function noticeAction(row: GapRow): GapAction {
  const met = `your log met this ${row.subject ?? 'page'} ${String(row.count)} time${row.count === 1 ? '' : 's'}`
  return { kind: 'checkWiki', label: 'Edit page', why: `The page carries ${noticeWords(row)}, but ${met}: remove the notice and cite the lines.`, href: wikiEditUrl(row.page ?? row.name) }
}

/**
 * A notice row's copy: what the log proves, to cite on the page's talk page or in the edit summary
 * when the notice comes off (owner, 2026-10-22): how often and when it was met, where, and the lines.
 */
export function noticeProof(row: GapRow): string {
  const zones = row.details.zones?.all ?? row.details.zones?.entries.map((z) => z.name) ?? []
  const where = zones.length > 0 ? ` in ${zones.join(', ')}` : ''
  const when = row.first === row.last ? row.first : `${row.first} to ${row.last}`
  const head = `Seen in EverQuest Legends (${row.kinds.join(', ')}), ${String(row.count)} time${row.count === 1 ? '' : 's'}${where}, ${when}:`
  return [head, ...row.details.samples.map((s) => `: ${s}`)].join('\n') + '\n'
}
