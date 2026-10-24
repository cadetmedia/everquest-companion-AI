// The Zones domain (owner, 2026-10-23: "you don't create the page, i'll create it, but make sure the APP
// gives me the details ... so I can COPY it"): the log's `EverQuest Legends Tutorial` is the wiki's
// Tutorial Zone, so a redirect page under the log's spelling is offered, never written by the app.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withZoneRedirects } from '../src/shared/gapZoneRedirects'
import { zoneRedirectTarget } from '../src/shared/gapWikiZone'
import { wikiCreateUrl } from '../src/shared/gapUrls'
import { wikiPageText } from '../src/shared/wikiPage'
import { zoneKey } from '../src/shared/zones'
import type { GapsSnap } from '../src/shared/gaps'

const row = (name: string, zones: [string, number][], first = '2026-10-23 17:36:15', last = '2026-10-23 17:40:00'): GapsSnap['rows'][number] => ({
  domain: 'mob',
  name,
  kinds: ['hailed'],
  count: 1,
  first,
  last,
  details: { samples: [], zones: { entries: zones.map(([z, n]) => ({ name: z, n })), distinct: zones.length } }
})

const snap = (rows: GapsSnap['rows']): GapsSnap => ({ rows, totals: {} as GapsSnap['totals'], seen: {} as GapsSnap['seen'] })

test('THE TUTORIAL GETS A REDIRECT ROW TO TUTORIAL ZONE: COPY GIVES THE REDIRECT, THE LINK OPENS THE NEW PAGE', () => {
  const out = withZoneRedirects(snap([row('Doug', [['EverQuest Legends Tutorial', 3]]), row('Dougina', [['EverQuest Legends Tutorial', 2]], '2026-10-23 17:30:00'), row('a rat', [['Lake Nerius 1 (Awakened)', 4]])]), new Set())
  const zones = out.rows.filter((r) => r.domain === 'zone')
  assert.deepEqual(zones.map((r) => [r.name, r.suggest?.page, r.count, r.first]), [['EverQuest Legends Tutorial', 'Tutorial Zone', 5, '2026-10-23 17:30:00']])
  assert.equal(out.totals.zone, 1)
  assert.equal(wikiPageText(zones[0], [], {}), '#REDIRECT [[Tutorial Zone]]\n')
  assert.equal(wikiCreateUrl(zones[0].name), 'https://eqlwiki.com/index.php?title=EverQuest_Legends_Tutorial&action=edit&redlink=1')
  // Run again, the rows are the same: a zone row is never counted into a zone row.
  assert.deepEqual(withZoneRedirects(out, new Set()).rows.filter((r) => r.domain === 'zone').length, 1)
})

test('ONLY A SURE TARGET, AND NEVER A SPELLING THE CATALOG LINKS AS A PAGE', () => {
  assert.equal(zoneRedirectTarget('Lake Nerius 1 (Awakened)'), undefined, 'no alias: no guess')
  assert.equal(zoneRedirectTarget('Temple of Cazic-Thule 4 (Refined)'), 'Cazic Thule (Zone)')
  assert.equal(zoneRedirectTarget('Tutorial Zone'), undefined, 'already the page')
  const rows = [row('a priest', [['Temple of Cazic-Thule', 2]])]
  assert.equal(withZoneRedirects(snap(rows), new Set()).rows.filter((r) => r.domain === 'zone')[0]?.suggest?.page, 'Cazic Thule (Zone)')
  assert.equal(withZoneRedirects(snap(rows), new Set([zoneKey('Temple of Cazic-Thule')])).rows.filter((r) => r.domain === 'zone').length, 0)
})
