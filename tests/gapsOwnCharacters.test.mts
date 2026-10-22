// The player's own characters are never a Gaps row (owner, 2026-10-22: a /con with nothing targeted,
// `Drywrought regards you indifferently -- looks like quite a gamble. (Lvl: 50)`, filed the player as
// a "may be a player" Mobs row: "this is me"). One character's view and All characters both pass
// their rows through `withoutPlayers` with the same names; another player's one-word name is untouched.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { GapRow } from '../src/shared/gaps'
import { playerNames, withoutPlayers } from '../src/shared/gapPlayers'

const row = (domain: GapRow['domain'], name: string, extra: Partial<GapRow> = {}): GapRow => ({
  domain,
  name,
  kinds: ['considered'],
  count: 1,
  first: '2026-10-21 22:20:17',
  last: '2026-10-21 22:20:17',
  details: { samples: [] },
  ...extra
})

const OWN = ['Drywrought', 'Kaltinril', 'Prettyboygeorge']

test("one character's view: its own name is no row in any domain; another one-word name may still be a player", () => {
  const rows = [
    row('mob', 'Drywrought', { maybePlayer: true }),
    row('merchant', 'drywrought'),
    row('image', 'Drywrought'),
    row('mob', 'Kamas', { maybePlayer: true }),
    row('mob', 'a kejekan lookout')
  ]
  const shown = withoutPlayers(rows, playerNames([], OWN)).map((r) => r.name)
  assert.deepEqual(shown, ['Kamas', 'a kejekan lookout'])
  const kamas = withoutPlayers(rows, playerNames([], OWN)).find((r) => r.name === 'Kamas')
  assert.equal(kamas?.maybePlayer, true)
})

test('All characters: a name that is any of the own characters is no row, whichever character saw it', () => {
  // Drywrought's rows and Kaltinril's saved rows, joined: each may name the other.
  const joined = [row('mob', 'Drywrought', { maybePlayer: true }), row('mob', 'Kaltinril', { maybePlayer: true }), row('mob', 'PRETTYBOYGEORGE'), row('mob', 'Grapok')]
  assert.deepEqual(
    withoutPlayers(joined, playerNames([], OWN)).map((r) => r.name),
    ['Grapok']
  )
})

test('a marked player still leaves only the Mobs list; with no names nothing goes', () => {
  const rows = [row('mob', 'Kamas', { maybePlayer: true }), row('merchant', 'Kamas'), row('mob', 'Drywrought')]
  assert.deepEqual(
    withoutPlayers(rows, playerNames(['kamas'], [])).map((r) => `${r.domain} ${r.name}`),
    ['merchant Kamas', 'mob Drywrought']
  )
  assert.equal(withoutPlayers(rows, new Set()).length, 3)
})
