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
