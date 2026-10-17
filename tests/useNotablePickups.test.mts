// useNotablePickups — the probe over recent loot, run for real through `tests/hookHost.mts`.
// Pins that a probe still in flight when a newer item is looted is kept, not thrown away: its
// keys stay "asked", so a discarded result would never be fetched again this mount.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mountHook } from './hookHost.mjs'
import { useNotablePickups } from '../src/renderer/src/features/loot/useNotablePickups.ts'
import type { ItemMarks } from '../src/shared/itemKnowledge.ts'
import type { ItemKnowledge, LootEvent } from '../src/shared/types.ts'

const LORE: ItemMarks = { lore: true, quest: false, questUses: 0, recipes: 0, noTrade: false }
const PLAIN: ItemMarks = { lore: false, quest: false, questUses: 0, recipes: 0, noTrade: false }

test('a probe in flight when a newer item drops still lands', async () => {
  const marksCalls: { names: readonly string[]; resolve: (m: Record<string, ItemMarks>) => void }[] = []
  const eq = {
    itemMarks: (names: readonly string[]) =>
      new Promise<Record<string, ItemMarks>>((resolve) => marksCalls.push({ names, resolve })),
    lookupItem: (name: string): Promise<ItemKnowledge> =>
      Promise.resolve({ name, lore: true, quest: false, questUses: [], cached: true })
  }
  ;(globalThis as unknown as { window: unknown }).window = { eq }

  let history: LootEvent[] = [{ ts: 1, item: 'Probe Lore Gem' }]
  const host = mountHook(() => useNotablePickups(history, new Set()))
  assert.equal(marksCalls.length, 1)

  // A plain item drops while the first probe is still waiting on its marks.
  history = [...history, { ts: 2, item: 'Probe Plain Rock' }]
  host.render()
  assert.equal(marksCalls.length, 2)

  marksCalls[0].resolve({ 'Probe Lore Gem': LORE })
  marksCalls[1].resolve({ 'Probe Plain Rock': PLAIN })
  await new Promise((r) => setTimeout(r, 0))

  const { notable } = host.render()
  assert.deepEqual(
    notable.map((n) => n.item),
    ['Probe Lore Gem']
  )
  host.unmount()
})
