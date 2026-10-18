// Wiki redirects kept as a mob's other names (owner, 2026-10-18: "Hoptor Thaggelum" redirects to
// "The Ghoul Lord" and was unknown on Gaps). Fixtures only, no network.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyOtherNames, redirectTarget, redirectsOf, type NamedMob } from '../scripts/sources/mobRedirects'
import { allRedirects } from '../scripts/scrape-mob-redirects'

test('a redirect page names its target; any other page names none', () => {
  assert.equal(redirectTarget('#REDIRECT [[The Ghoul Lord]]'), 'The Ghoul Lord')
  assert.equal(redirectTarget('#redirect [[Lower_Guk#Bosses|the lord]]\n[[Category:x]]'), 'Lower Guk')
  assert.equal(redirectTarget('{{Namedmobpage\n|name = a bat\n}}'), null)
})

test("a mob keeps the redirects that land on its page, minus re-cased copies of its own names", () => {
  const mobs: NamedMob[] = [
    { page: 'The Ghoul Lord', name: 'the ghoul lord (Hoptor Thaggelum)' },
    { page: 'A bat', name: 'a bat', otherNames: ['Stale'] }
  ]
  applyOtherNames(mobs, [
    { from: 'Hoptor Thaggelum', to: 'The Ghoul Lord' },
    { from: 'Ghoul Lord', to: 'The Ghoul Lord' },
    { from: 'THE GHOUL LORD', to: 'The Ghoul Lord' },
    { from: 'Lower Guk Bosses', to: 'Lower Guk' }
  ])
  assert.deepEqual(mobs[0].otherNames, ['Ghoul Lord', 'Hoptor Thaggelum'])
  assert.equal(mobs[1].otherNames, undefined)
  assert.deepEqual(redirectsOf(mobs), [
    { from: 'Ghoul Lord', to: 'The Ghoul Lord' },
    { from: 'Hoptor Thaggelum', to: 'The Ghoul Lord' }
  ])
})

test('the collector joins the redirect pages to their targets by page id, 500 a request', async () => {
  const asked: Record<string, string>[] = []
  const answers = [
    { query: { allpages: [{ pageid: 1, title: 'A' }] }, continue: { apcontinue: 'M' } },
    { query: { allpages: [{ pageid: 2, title: 'N' }] } },
    { query: { allredirects: [{ fromid: 1, title: 'B' }, { fromid: 2, title: 'O' }, { fromid: 9, title: 'X' }] } }
  ]
  const get = (async (params: Record<string, string>) => {
    asked.push(params)
    return answers[asked.length - 1]
  }) as Parameters<typeof allRedirects>[0]
  assert.deepEqual(await allRedirects(get), [{ from: 'A', to: 'B' }, { from: 'N', to: 'O' }])
  assert.deepEqual(asked.map((q) => [q.list, q.apcontinue ?? q.arcontinue ?? '']), [['allpages', ''], ['allpages', 'M'], ['allredirects', '']])
  assert.equal(asked[0].apfilterredir, 'redirects')
})
