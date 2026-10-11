// Respawn scraper field reader and name collisions (scripts/scrape-respawns.ts). No network.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dedupe, respawnField } from '../scripts/scrape-respawns'

test('the respawn field is read in either spelling and a piped link inside it stays whole', () => {
  assert.equal(respawnField('{{Namedmobpage\n| level = 22-25 | respawn time = 6:40min\n}}'), '6:40min')
  assert.equal(respawnField('{{Namedmobpage\n| Respawn Time      = 6.5 minutes - 11.9 minutes\n}}'), '6.5 minutes - 11.9 minutes')
  assert.equal(respawnField('{{Namedmobpage\n|respawn_time = 18 hours([[variance|+/-1]])\n|zone = x\n}}'), '18 hours([[variance|+/-1]])')
  assert.equal(respawnField('{{Namedmobpage\n|respawn_time = 15 minutes}}'), '15 minutes')
  assert.equal(respawnField('{{Namedmobpage\n|respawn_time = 16:00 minutes\n| Respawn Time = 6min\n}}'), '16:00 minutes')
})

test('same-named mobs keep the first parsed row and every disagreement is reported', () => {
  const { rows, conflicts } = dedupe([
    { key: 'a bandit', page: 'A bandit (Eastern Karana)', text: '6:40', seconds: 400 },
    { key: 'a bandit', page: 'A bandit (Lake Rathe)', text: 'Unknown' },
    { key: 'a bandit', page: 'A bandit (Western Karana)', text: '6:40', seconds: 400 }
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].page, 'A bandit (Eastern Karana)')
  assert.deepEqual(conflicts, ["a bandit: 'A bandit (Eastern Karana)' says 6:40; 'A bandit (Lake Rathe)' says Unknown"])
})
