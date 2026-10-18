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

test('the collector pages through every redirect, 500 a request', async () => {
  const asked: Record<string, string>[] = []
  const pages = [
    { query: { redirects: [{ from: 'A', to: 'B' }] }, continue: { gapcontinue: 'M' } },
    { query: { redirects: [{ from: 'N', to: 'O' }] } }
  ]
  const get = (async (params: Record<string, string>) => {
    asked.push(params)
    return pages[asked.length - 1]
  }) as Parameters<typeof allRedirects>[0]
  assert.deepEqual(await allRedirects(get), [{ from: 'A', to: 'B' }, { from: 'N', to: 'O' }])
  assert.equal(asked.length, 2)
  assert.equal(asked[0].gapfilterredir, 'redirects')
  assert.equal(asked[1].gapcontinue, 'M')
})
