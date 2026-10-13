// factions/FactionWorkPanel.tsx — the FACTION WORK an expanded row reveals: the quests that raise
// this faction (the point of the whole tab — "save your Bone Chips, Kaladim wants them"), and the
// ones that cost it, so a player farming one side knows what the other side charges.
//
// EVERY NAME THAT HAS A DESTINATION IS A LINK, the app's standing idiom: item names (turn-ins AND
// rewards) open that item's Loot drill-down through `onOpenLoot` — the same `DonorName` the
// Exaltations and Wish list tabs use, so the styling and the Back contract come for free — and
// the quest giver opens the Mobs tab through `onOpenMob`, the Raid Targets contract. The START
// ZONE stays TEXT: the app has no zone deep link yet (factionQuests.ts's header), and a fake link
// would be worse than a plain word.
//
// LONG LISTS ARE CAPPED IN PLACE, the hover carrying the rest (the JOS-106 idiom — the long form
// lives in the hover, never in the row): a Kaladim newbie quest lists eighteen reward items, and
// eighteen chips would bury the one fact this panel exists to say.

import { type JSX } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import type { HeldCounts } from '@shared/types'
import type { ZoneShort } from '@shared/maps'
import { wikiPageUrl } from '@shared/wiki'
import { zoneShortName, zoneShortNameFromCatalog } from '@shared/zones'
import Tooltip from '../../lib/Tooltip'
import { KnownItemTooltip } from '../../lib/KnownItemTooltip'
import { EQ_ITEM_COLORS } from '../../lib/ItemWindow'
import { MOB_CARD_SLOT_PROPS, MobCard } from '../../lib/hoverCards'
import { mainMobLookup } from '../timers/mobLookup'
// The reward-name fold (`*` off, corpus key) — the same one the filters and the wishlist use.
import { rewardKey as rewardKeyOf } from './factionFilters'
import { unlocksNeedingQuest } from '@shared/unlocks/unlockGraph'
import UnlockChips from '../unlocks/UnlockChips'
import type { FactionQuestRef, FactionWork } from './factionQuests'
import FactionReceipt, { type ReceiptLinks } from './FactionReceipt'

/** The links a quest line can offer — threaded once rather than as four props per level. */
export interface WorkPanelLinks extends ReceiptLinks {
  onOpenLoot?: (item?: string) => void
  onOpenMob?: (t: { mob: string }) => void
  /** open the Maps tab pinned at a zone (the stem is resolved HERE; unresolvable stays text) */
  onOpenZone?: (zone: ZoneShort) => void
  /** wishlist item keys (`rewardKey` fold) — a wished reward name wears the heart */
  wished?: ReadonlySet<string>
}

/**
 * An item name: the EQ-style hover card (the Sky tab's `KnownItemTooltip` — stats, icon, what
 * it's for), a click through to the Loot drill-down. Its own anchor rather than the planner's
 * `DonorName` because that one carries a native `title`, and a browser tooltip under a hover
 * card is two answers to one hover. The wiki's trailing `*` (its stats-vary marker on reward
 * names) is stripped for the LOOKUP and the CLICK — the item DB keys the bare name — and kept in
 * the display, because it is the page's own claim about variance.
 */
function ItemName({
  name,
  onOpen,
  bold = false
}: {
  name: string
  onOpen?: (item?: string) => void
  bold?: boolean
}): JSX.Element {
  const bare = name.replace(/\*+$/, '').trim()
  return (
    <KnownItemTooltip name={bare}>
      <Box
        component="span"
        data-testid="factions-item-name"
        onClick={onOpen === undefined ? undefined : () => onOpen(bare)}
        sx={{
          color: EQ_ITEM_COLORS.name,
          fontWeight: bold ? 700 : 400,
          textDecoration: 'underline dotted',
          textUnderlineOffset: 2,
          cursor: onOpen === undefined ? 'default' : 'pointer'
        }}
      >
        {name}
      </Box>
    </KnownItemTooltip>
  )
}


/**
 * A start zone: a Maps link when the name resolves to an installed map stem (the log-name table
 * first, the mob catalog's spellings second — shared/zones.ts owns both), plain text when it does
 * not. A fake link would be worse than a plain word; an unresolved zone is simply a zone this
 * install has no map name for.
 */
function ZoneLink({ zone, onOpenZone }: { zone: string; onOpenZone?: (z: ZoneShort) => void }): JSX.Element {
  const stem = zoneShortName(zone) ?? zoneShortNameFromCatalog(zone)
  if (stem === null || onOpenZone === undefined) return <>{zone}</>
  return (
    <Box
      component="span"
      data-testid="factions-zone-link"
      onClick={() => onOpenZone(stem)}
      sx={{ textDecoration: 'underline dotted', textUnderlineOffset: 2, cursor: 'pointer' }}
    >
      {zone}
    </Box>
  )
}

/** How many linked names a list shows before folding the rest into a "+N more" hover. */
const LIST_CAP = 4

/**
 * A linked, capped item-name list: `label: A (have 14), B, +3 more`. Nothing when empty. `held`
 * is the inventory dump's counts (`ProgressState.inventory`, lowercased names) — passed only for
 * the TURN-IN list, because "do I already have the thing to save" is that list's question; a
 * silent name simply is not in the dump, which is not a claim of zero (the dump only covers what
 * was open when it was generated — CountSource's own caveat).
 */
function ItemLinks({
  label,
  names,
  coin,
  held,
  wished,
  onOpenLoot,
  testId
}: {
  label: string
  names: readonly string[]
  /** a coin cost beside (or instead of) the items — the guard-donation quests' "2 gold" */
  coin?: string
  held?: HeldCounts
  /** wishlist keys — a wished name is drawn loud (♥, bold, the warning color) */
  wished?: ReadonlySet<string>
  onOpenLoot?: (item?: string) => void
  testId?: string
}): JSX.Element | null {
  if (names.length === 0 && coin === undefined) return null
  const shown = names.slice(0, LIST_CAP)
  const rest = names.slice(LIST_CAP)
  return (
    <Typography variant="caption" color="text.secondary" data-testid={testId} sx={{ display: 'block' }}>
      {label}{' '}
      {shown.map((n, i) => {
        const have = held?.[n.toLowerCase()] ?? 0
        const hot = wished?.has(rewardKeyOf(n)) === true
        return (
          <Box component="span" key={n}>
            {i > 0 && ', '}
            {hot && (
              <Box component="span" title="on your wishlist" sx={{ color: 'warning.main', fontWeight: 700 }}>
                {'♥ '}
              </Box>
            )}
            <ItemName name={n} onOpen={onOpenLoot} bold={hot} />
            {have > 0 && (
              <Box component="span" title="in your last inventory dump" sx={{ color: 'success.main' }}>
                {' '}
                (have {have})
              </Box>
            )}
          </Box>
        )
      })}
      {rest.length > 0 && (
        <Box component="span" title={rest.join(', ')} sx={{ cursor: 'help' }}>
          {' '}
          +{rest.length} more
        </Box>
      )}
      {coin !== undefined && (
        <Box component="span" data-testid="factions-coin" sx={{ color: 'primary.main' }}>
          {names.length > 0 ? ' + ' : ''}
          {coin}
        </Box>
      )}
    </Typography>
  )
}

/** The giver's name: the app's mob hover card (the Timers rows' own — drops, your kill counts),
 *  a click through to the Mobs tab. Card and click together, the respawn rows' exact contract. */
function GiverLink({
  giver,
  onOpenMob
}: {
  giver: string
  onOpenMob?: (t: { mob: string }) => void
}): JSX.Element {
  return (
    <Tooltip
      title={<MobCard mob={giver} lookup={mainMobLookup} />}
      slotProps={MOB_CARD_SLOT_PROPS}
      disableInteractive
      placement="top-start"
    >
      <Box
        component="span"
        data-testid="factions-giver"
        onClick={onOpenMob === undefined ? undefined : () => onOpenMob({ mob: giver })}
        sx={{
          textDecoration: 'underline dotted',
          textUnderlineOffset: 2,
          cursor: onOpenMob === undefined ? 'default' : 'pointer'
        }}
      >
        {giver}
      </Box>
    </Tooltip>
  )
}

/** How a quest line speaks about the faction: a stated raise, a stated cost, or — the home-zone
 *  candidates — no statement at all. */
type QuestTone = 'up' | 'down' | 'plain'

/** The signed payout badge: an exact number when the page stated one, a bare arrow otherwise,
 *  and a neutral dot for a quest whose page stated nothing. */
function payoutLabel(ref: FactionQuestRef, tone: QuestTone): string {
  if (tone === 'plain') return '·'
  if (ref.amount === undefined) return tone === 'up' ? '+' : '−'
  return ref.amount > 0 ? `+${String(ref.amount)}` : String(ref.amount)
}

const TONE_COLOR: Record<QuestTone, string> = {
  up: 'success.main',
  down: 'error.main',
  plain: 'text.disabled'
}

/** One quest's line: payout, name, who and where (both linked), then the item lists. */
function QuestLine({
  quest,
  tone,
  held,
  selfKey,
  links
}: {
  quest: FactionQuestRef
  tone: QuestTone
  held?: HeldCounts
  /** the expanded faction's join key — its hit on the receipt is drawn bold */
  selfKey?: string
  links: WorkPanelLinks
}): JSX.Element {
  return (
    <Box sx={{ py: 0.5 }} data-testid="factions-quest">
      <Typography variant="body2" component="div">
        <Box
          component="span"
          sx={{
            color: TONE_COLOR[tone],
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 600,
            mr: 0.75
          }}
        >
          {payoutLabel(quest, tone)}
        </Box>
        {/* The quest NAME opens its eqlwiki page in the system browser — the item dialog's Source
            idiom exactly: `target="_blank"` becomes `shell.openExternal` through main's
            allowlisted open handler (src/main/security.ts), and eqlwiki.com is on the list. */}
        <Box
          component="a"
          href={wikiPageUrl(quest.page)}
          target="_blank"
          rel="noreferrer"
          data-testid="factions-quest-wiki"
          title="open on eqlwiki.com"
          sx={{
            color: 'inherit',
            textDecoration: 'underline dotted',
            textUnderlineOffset: 2
          }}
        >
          {quest.name}
        </Box>
        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          {quest.giver !== undefined && <GiverLink giver={quest.giver} onOpenMob={links.onOpenMob} />}
          {quest.startZone !== undefined && (
            <>
              {' · '}
              <ZoneLink zone={quest.startZone} onOpenZone={links.onOpenZone} />
            </>
          )}
          {quest.minLevel !== undefined && ` · lvl ${String(quest.minLevel)}+`}
        </Typography>
      </Typography>
      <Box sx={{ pl: 3 }}>
        {/* A quest that is an unlock's task, or a part of one, says so (unlockGraph.ts). */}
        <UnlockChips paths={unlocksNeedingQuest(quest.name)} testId="factions-quest-unlock" />
        <FactionReceipt quest={quest} selfKey={selfKey} links={links} />
        <ItemLinks
          label="turn in:"
          names={quest.items}
          coin={quest.coin}
          held={held}
          wished={links.wished}
          onOpenLoot={links.onOpenLoot}
          testId="factions-quest-items"
        />
        <ItemLinks
          label="rewards:"
          names={quest.rewards}
          wished={links.wished}
          onOpenLoot={links.onOpenLoot}
          testId="factions-quest-rewards"
        />
      </Box>
    </Box>
  )
}

/**
 * The expanded panel: every quest on record that raises this faction, then the ones that lower
 * it. `work` is null when no quest page names the faction at all — the panel says so instead of
 * rendering an empty region, because "no work on record" is the answer, not an absence.
 */
export default function FactionWorkPanel({
  work,
  held,
  selfKey,
  links
}: {
  work: FactionWork | null
  held?: HeldCounts
  /** the expanded faction's `factionNameKey` */
  selfKey?: string
  links: WorkPanelLinks
}): JSX.Element {
  if (work === null) {
    return (
      <Typography variant="caption" color="text.secondary" data-testid="factions-no-work" sx={{ py: 1, display: 'block' }}>
        No quest on record names this faction. The catalog knows what the wiki's quest pages state;
        kills and unlisted turn-ins still move it in game.
      </Typography>
    )
  }
  return (
    <Stack spacing={0.5} sx={{ py: 1 }} data-testid="factions-work">
      {work.raise.map((q) => (
        <QuestLine key={q.name} quest={q} tone="up" held={held} selfKey={selfKey} links={links} />
      ))}
      {/* THE SILENT HOME-ZONE QUESTS — candidates, said as exactly that. The wiki attributes a
          fraction of a zone's quests (Kerra Island: 2 of 16), and the ones it misses include the
          rewards a player remembers the zone FOR; hiding them made the tab look wrong about the
          user's own necklace. The label keeps the claim honest: same neighborhood, no receipt. */}
      {work.nearby.length > 0 && work.homeZone !== undefined && (
        <Box sx={{ pt: work.raise.length > 0 ? 1 : 0 }} data-testid="factions-nearby">
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Also in {work.homeZone} (faction effect unstated on the wiki):
          </Typography>
          {work.nearby.map((q) => (
            <QuestLine key={q.name} quest={q} tone="plain" held={held} selfKey={selfKey} links={links} />
          ))}
        </Box>
      )}
      {work.lower.length > 0 && (
        <Box sx={{ pt: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Costs this faction:
          </Typography>
          {work.lower.map((q) => (
            <QuestLine key={q.name} quest={q} tone="down" held={held} selfKey={selfKey} links={links} />
          ))}
        </Box>
      )}
    </Stack>
  )
}
