// shared/gapFight.ts — a mob's fight numbers for its new page, estimated from the log (owner,
// 2026-10-23: "can we estimate NPC HP attacks etc etc etc if we have 10 or more kills of the mob?").
// The engine (gaps_fight.rs) serves them per zone tier on the Mobs row as `fight`; fixed rules only.
//
// The page is the base mob: its fields come from tier +0 alone (the open world or a base instance),
// never from a higher tier (owner: "+4 will multiclass", other HP, hits and attacks). Each field waits
// for its own count at +0 and says it is an estimate, in the wiki's own `~` and parenthesis forms
// (measured 2026-10-23 on the cached mob pages: `HP = ~8000`, `~29k (?)`; `attacks_per_round = up to
// 4`, `2 (?)`; `damage_per_hit = 1 - 12 (?)`). AC, attack speed, aggro radius, run speed and regen
// stay blank: the log shows none of them. Attack kinds (slash, cleave, kick) go in the details only:
// the wiki's pages do not list them (Bash or Kick in `| special` on about ten of 7,984 pages).

/** One tier of a mob's fights, as the engine serves it. */
export interface FightTier {
  /** 0 the base (open world or a base instance), 1-4 the instance tiers */
  tier: number
  /** its deaths seen, whoever killed it */
  kills: number
  /** kills whose fight the log saw whole and alone: HP and swings come from these */
  fights: number
  /** the median damage it took in those fights */
  hp?: number
  hits?: number
  hitMin?: number
  hitMax?: number
  /** every verb it landed or tried: `slash`, `cleave`, `kick` */
  attacks: string[]
  /** the most swings of one round two fights or more showed */
  swings?: number
}

/** Kills before a field is estimated (owner: "10 or more kills"), the drop rates' bar (wikiPage.ts RATE_MIN_KILLS). */
export const FIGHT_MIN_KILLS = 10
/** Landed hits before a hit range is written: a mob that landed one blow on a high-level player has no range. */
export const FIGHT_MIN_HITS = 20

/** A row's tiers, as the engine serves them; read here rather than typed on `GapRow` (its size bar). */
export const fightOf = (row: object): readonly FightTier[] => (row as { fight?: FightTier[] }).fight ?? []

const n = (x: number): string => String(x)

/**
 * The NPC page fields its base-tier fights fill: `HP`, `damage_per_hit`, `attacks_per_round`, each
 * only past its count. A row whose page exists under a redirect gets none: its page is not new, and a
 * page's own value is never replaced.
 */
export function fightFields(row: object): Record<string, string> {
  const base = fightOf(row).find((t) => t.tier === 0)
  if (base === undefined || (row as { viaRedirect?: string }).viaRedirect !== undefined) return {}
  const out: Record<string, string> = {}
  const whole = base.fights >= FIGHT_MIN_KILLS
  if (whole && base.hp !== undefined) out.HP = `~${n(base.hp)} (estimate from ${n(base.fights)} kills)`
  const { hitMin, hitMax } = base
  if (base.kills >= FIGHT_MIN_KILLS && (base.hits ?? 0) >= FIGHT_MIN_HITS && hitMin !== undefined && hitMax !== undefined) {
    out.damage_per_hit = `${n(hitMin)} - ${n(hitMax)} (estimate from ${n(base.kills)} kills)`
  }
  if (whole && base.swings !== undefined) out.attacks_per_round = `up to ${n(base.swings)} (estimate from ${n(base.fights)} kills)`
  return out
}

/**
 * A mob page with its fight estimates in the fields it leaves blank (`| HP                = `, in
 * wikiPage.ts layoutBlock's padding); a field the page already states is never written over.
 */
export function withFightFields(page: string, row: object): string {
  let out = page
  for (const [key, value] of Object.entries(fightFields(row))) out = out.replace(`| ${key.padEnd(17)} = \n`, `| ${key.padEnd(17)} = ${value}\n`)
  return out
}

/** One line per tier for the row's details, base first: what each tier's fights showed, unmixed. */
export function fightLines(row: object): string[] {
  return fightOf(row).map((t) => {
    const parts = [
      `${n(t.kills)} kills, ${n(t.fights)} seen whole`,
      ...(t.hp === undefined ? [] : [`HP ~${n(t.hp)}`]),
      ...(t.hitMin === undefined || t.hitMax === undefined ? [] : [`hits ${n(t.hitMin)} - ${n(t.hitMax)}`]),
      ...(t.swings === undefined ? [] : [`up to ${n(t.swings)} a round`]),
      ...(t.attacks.length === 0 ? [] : [t.attacks.join(', ')])
    ]
    return `Fights at +${n(t.tier)}: ${parts.join(' · ')}`
  })
}
