// A name known only through a wiki redirect is a row to check (owner, 2026-10-22: Halfling Blood was
// sent to Vial of Halfling Blood, a different item): uncertain, an update, a Check redirect chip on
// the redirect page itself, nothing to collect.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gapActions, uncertainGap, type GapRow } from '../src/shared/gaps'
import { gapJob } from '../src/shared/gapJob'
import { stillNeeded } from '../src/shared/wikiPage'

const row = (extra: Partial<GapRow> = {}): GapRow => ({ domain: 'item', name: 'Halfling Blood', kinds: ['looted'], count: 19, first: '', last: '', details: {}, ...extra }) as GapRow

test('A REDIRECT ROW IS UNCERTAIN, AN UPDATE, A CHECK OF THE REDIRECT PAGE, WITH NOTHING TO COLLECT', () => {
  const r = row({ viaRedirect: 'Vial of Halfling Blood' })
  assert.equal(uncertainGap(r), true)
  assert.equal(gapJob(r), 'update')
  const [action] = gapActions(r, 'unchecked')
  assert.equal(action.label, 'Check redirect')
  assert.equal(action.href, 'https://eqlwiki.com/index.php?title=Halfling_Blood&redirect=no')
  assert.ok(action.why.includes('The wiki sends Halfling Blood to Vial of Halfling Blood. Check it is the same item in game'), action.why)
  assert.deepEqual(stillNeeded(r, [], {}), [])
  // An ordinary row is none of these.
  assert.equal(uncertainGap(row()), false)
  assert.equal(gapJob(row()), 'new')
})
