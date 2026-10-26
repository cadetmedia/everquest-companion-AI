# Performance bench scripts, 2026-10-26

The scripts the optimization pass 1 agents measured with (perf-renderer), kept so the re-measurement
after all changes (plans/2026-10-26-trunk-release-run.md, "Re-run the performance review") can
repeat them. Kept here as text, not as files under `scripts/`, because they were throwaway: copy one
into a scratch folder, fix the import paths to the checkout being measured, and run it with
`node --import tsx <file> [args]` (Node 24). Results are in
[2026-10-20-performance-review.md](2026-10-20-performance-review.md), "Done 2026-10-26".

## Derivations (timed 5 times each; the first call is the cold one)

`maps.mts`: the Maps/Mobs zone join.

```ts
import { mobsInZone, rosterInZone } from '<repo>/src/renderer/src/features/mobs/mobZone'
import mobsJson from '<repo>/src/renderer/src/data/eqlegends/mobs.json'
const cat = (mobsJson as any).mobs
function t(label: string, f: () => unknown, n = 5) {
  const xs: number[] = []
  for (let i = 0; i < n; i++) { const s = performance.now(); f(); xs.push(performance.now() - s) }
  console.log(label, xs.map((x) => x.toFixed(2)).join(' '))
}
t('mobsInZone Najena', () => mobsInZone('Najena 4 (Refined)', cat))
t('mobsInZone keep', () => mobsInZone('The Plane of Sky', cat, (m) => m.level !== '1'))
t('rosterInZone', () => rosterInZone('Lower Guk', cat))
```

`slayer.mts <achievements dump>`: Slayer's `planZones` (arg: the owner's `Drywrought_oggok-Achievements.txt`).

```ts
import { readFileSync } from 'node:fs'
import { parseAchievementsDump } from '<repo>/src/shared/outputs/achievements'
import { slayerRecord } from '<repo>/src/shared/outputs/slayer'
import { planZones, slayerMobs, slayerTarget, targetReach } from '<repo>/src/shared/slayer/slayerPlan'
const D = '<repo>/src/renderer/src/data/eqlegends/'
const cat = JSON.parse(readFileSync(D + 'mobs.json', 'utf8')).mobs
const races = JSON.parse(readFileSync(D + 'mobRaces.json', 'utf8')).races as Record<string, string[]>
const raceOf = new Map<string, string>(); for (const [r, ps] of Object.entries(races)) for (const p of ps) raceOf.set(p, r)
const mobs = slayerMobs(cat, (p) => raceOf.get(p))
const rec = slayerRecord(parseAchievementsDump(readFileSync(process.argv[2], 'utf8')))
const targets = rec.counters.map(slayerTarget)
const opts = { maxLevel: 60, outOfEra: false, noFactionHits: false, met: 0 } as any
for (let i = 0; i < 5; i++) { const s = performance.now(); targetReach(planZones(mobs, targets, opts)); console.log('planZones all', (performance.now() - s).toFixed(1)) }
```

`plan.mts <gear index file>` and `gear.mts <gear index file>`: Plan's `candidatePool` and Factions' `gearMaps` (arg: the committed items corpus as `buildGearIndex` reads it).

```ts
import { readFileSync } from 'node:fs'
import { buildGearIndex } from '<repo>/src/main/planner/gearIndex'
import { candidatePool } from '<repo>/src/shared/planner/progressionPlan'
import { conBand } from '<repo>/src/shared/conBands'
import { zoneProfiles, mobLevelOf } from '<repo>/src/renderer/src/features/plan/planData'
import { gearMaps } from '<repo>/src/renderer/src/features/factions/factionDerive'
const rows = buildGearIndex(JSON.parse(readFileSync(process.argv[2], 'utf8'))).rows
const corpora: any = { gear: rows, profiles: zoneProfiles(true), mobLevel: (n: string) => mobLevelOf(n, true), con: conBand, owned: new Set(), questSources: () => [], ownedBestBySlot: new Map(), ownedHaste: [] }
for (let i = 0; i < 5; i++) { const s = performance.now(); const p = candidatePool({ classes: ['WAR'], role: 'tank', eraOnly: true, survivability: 0.5 } as any, corpora); console.log('pool', p.length, (performance.now() - s).toFixed(1)) }
for (let i = 0; i < 5; i++) { const s = performance.now(); gearMaps(rows); console.log('gearMaps', (performance.now() - s).toFixed(2)) }
```

`dps.mts`: Overview's `buildDpsSeries` on a synthetic timeline.

```ts
import { buildDpsSeries } from '<repo>/src/renderer/src/features/combat/dashboardData'
const kinds = ['you', 'pet', 'member', 'incoming']
for (const n of [2000, 6000]) {
  const events = Array.from({ length: n }, (_, i) => ({ t: i * 150, amount: 50 + (i % 40), kind: kinds[i % 4] }))
  const tl: any = { id: 'x', name: 'x', startTs: 0, durationMs: n * 150, lanes: [], events, stanceSpans: [], markers: [], downsampled: false, rawCount: n, totalCount: n }
  for (const live of [false, true]) { const xs = []; for (let i = 0; i < 5; i++) { const s = performance.now(); buildDpsSeries(tl, live); xs.push((performance.now() - s).toFixed(2)) } console.log(n, live, xs.join(' ')) }
}
```

## Bundle size per window (after `npm run build`)

`chunks.mjs <repo>/out/renderer`: the overlay entry's static import closure, plus each lazy kind.

```js
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
const dir = process.argv[2]
const assets = join(dir, 'assets')
const entry = /src="\.\/assets\/([^"]+\.js)"/.exec(readFileSync(join(dir, 'overlay.html'), 'utf8'))[1]
const size = (f) => statSync(join(assets, f)).size
const src = (f) => readFileSync(join(assets, f), 'utf8')
const staticDeps = (f) => [...src(f).matchAll(/(?:import|export)\s*(?:[^'"()]*?from\s*)?["']\.\/([^"']+\.js)["']/g)].map((m) => m[1])
const dynDeps = (f) => [...src(f).matchAll(/import\(\s*["']\.\/([^"']+\.js)["']\s*\)/g)].map((m) => m[1])
function closure(f, seen = new Set()) { if (seen.has(f)) return seen; seen.add(f); for (const d of staticDeps(f)) closure(d, seen); return seen }
const kb = (n) => (n / 1024).toFixed(1) + ' KB'
const base = closure(entry)
const baseSize = [...base].reduce((a, f) => a + size(f), 0)
console.log('entry', entry, 'static closure', base.size, 'files', kb(baseSize))
const dyn = new Set(); for (const f of base) for (const d of dynDeps(f)) dyn.add(d)
for (const d of dyn) { const extra = [...closure(d, new Set(base))].filter((x) => !base.has(x)); const e = extra.reduce((a, f) => a + size(f), 0); console.log('lazy', d, '+', kb(e), 'total', kb(baseSize + e)) }
```

Measured 2026-10-26: before, every overlay window loaded 715.3 KB (5 files); after, 241.9 KB shared
plus 27-134 KB for its own kind (268.9-376.3 KB a window).

## Engine-side sizes

- Whole-log fold time and module snapshot sizes: `engine/target/release/parity.exe <log copy> --snapshots`
  (no knowledge installed, so the gaps rows come out empty).
- The gaps snapshot with knowledge: `VERIFY_LOG=<log copy> cargo test --release -p knowledge --test verify_fold -- --ignored`
  in `engine/` (perf-gaps-slim measured with it: October log 951 KB to 482 KB).
- Respawn learned evidence: MEASURED.md, "Respawn constants" (fold time and snapshot size).
