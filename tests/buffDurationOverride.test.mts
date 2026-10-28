// Fork issue #4: the per-spell duration choice's app half — the stored shape through the one
// normalizer, the setter, and the dialog's reading of a typed duration. The engine half (the choice
// replacing the estimate, the median ignoring an outlier) is proven in engine/crates/fold/src/lib.rs
// and buffs_overrides.rs.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addExternalCaster,
  DEFAULT_BUFF_TRUST_PREFS,
  normalizeBuffTrustPrefs,
  parseTypedDuration,
  setDurationOverride
} from '../src/shared/buffTrust'

test('an older store has no choices, and only readable choices survive a hand edit', () => {
  assert.deepEqual(normalizeBuffTrustPrefs({ externals: [] }).durations, {})
  const read = normalizeBuffTrustPrefs({
    externals: [],
    durations: {
      'whirl till you hurl': { mode: 'fixed', ms: 7500.4 },
      'color skew': { mode: 'log' },
      'too short': { mode: 'fixed', ms: 10 },
      'too long': { mode: 'fixed', ms: 4 * 60 * 60_000 },
      'no number': { mode: 'fixed' },
      'odd mode': { mode: 'sometimes' },
      '': { mode: 'log' }
    }
  }).durations
  assert.deepEqual(read, {
    'whirl till you hurl': { mode: 'fixed', ms: 7500 },
    'color skew': { mode: 'log' }
  })
})

test('setting and clearing a choice touches nothing else', () => {
  const withCaster = addExternalCaster(DEFAULT_BUFF_TRUST_PREFS, 'Faelin')
  const set = setDurationOverride(withCaster, 'whirl till you hurl', { mode: 'fixed', ms: 7500 })
  assert.deepEqual(set.externals, ['Faelin'])
  assert.deepEqual(set.durations, { 'whirl till you hurl': { mode: 'fixed', ms: 7500 } })
  const both = setDurationOverride(set, 'color skew', { mode: 'log' })
  assert.equal(Object.keys(both.durations).length, 2)
  const cleared = setDurationOverride(both, 'whirl till you hurl', undefined)
  assert.deepEqual(cleared.durations, { 'color skew': { mode: 'log' } })
  assert.deepEqual(cleared.externals, ['Faelin'])
})

test('a typed duration: bare seconds, the spell-data forms, and refusals', () => {
  assert.equal(parseTypedDuration('7.5'), 7500)
  assert.equal(parseTypedDuration(' 8 '), 8000)
  assert.equal(parseTypedDuration('7.5s'), 7500)
  assert.equal(parseTypedDuration('1m 30s'), 90_000)
  assert.equal(parseTypedDuration('1:30'), 90_000)
  assert.equal(parseTypedDuration(''), null)
  assert.equal(parseTypedDuration('soon'), null)
  assert.equal(parseTypedDuration('0.5'), null)
  assert.equal(parseTypedDuration('4 hours'), null)
})
