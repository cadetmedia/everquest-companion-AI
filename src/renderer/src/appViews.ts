// The app's top-level view identity: the union the nav drawer, the content switch and the
// persisted "which tab was I on" key all agree on. Lives outside App.tsx so the nav drawer
// can import it without importing the app itself.

import { OWNER_TOOLS, UNRELEASED } from './devFlags'

export type View =
  | 'overview'
  | 'combat'
  | 'mobs'
  | 'maps'
  | 'bosses'
  // ACHIEVEMENTS: everything the newest `/outputfile achievements` dump lists, grouped as the
  // game groups it, and for the kill counters where to go. The id is the one the tab was given
  // as the Slayer tab (2026-09-28), a day before it took in the other families; an id is not a
  // label (`bosses` is Raid Targets). UNRELEASED like every new tab: in `KNOWN_VIEWS` only
  // behind the flag's splice, its nav row gated the same way, and absent from `TELEMETRY_VIEWS`.
  | 'slayer'
  // UNLOCKS (2026-09-29): the three unlock families of the same dump (races, classes, deities)
  // as what each still needs, joined to the factions dump and the Sky quests. UNRELEASED on the
  // same three terms as the tab above.
  | 'unlocks'
  | 'posky'
  | 'alerts'
  | 'leveling'
  | 'loot'
  // BAZAAR (2026-10-06): what trade chat asked and offered per item, per day. UNRELEASED like
  // every new tab: in `KNOWN_VIEWS` only behind the flag's splice, its nav row gated the same
  // way, and absent from `TELEMETRY_VIEWS`.
  | 'bazaar'
  // GAPS (2026-10-11): names the log mentions that the wiki data has no record of. UNRELEASED
  // like every new tab: in `KNOWN_VIEWS` only behind the flag's splice, its nav row gated the
  // same way, and absent from `TELEMETRY_VIEWS`.
  | 'gaps'
  | 'planner'
  // The GEAR PLANNER's search surface (JOS-284) — the candidate index over every equippable item.
  // It was a top-level nav row of its own until JOS-324; it is now the FIRST TAB of the gear area
  // (see `GEAR_AREA_VIEWS` below) and its view id, route and every `gear-*` testid are unchanged.
  | 'gear'
  // The PROGRESSION PLAN (docs/plans/gear-progression-planner.md §4) — the gear area's second tab
  // and the only one that answers a question about the FUTURE: where should I be at each level
  // bracket, and what am I there for. Gear is the corpus, Exaltations is the socket board, the Wish
  // list is what you decided you want; this is the route that produces the wanting. It sits beside
  // Gear rather than beside Leveling on purpose — the Leveling tab is OBSERVED HISTORY and stays
  // that (plan §4), and everything this surface reads (the item index, the class pin, the era
  // toggle, the wish list it seeds) is already standing in the gear area.
  | 'plan'
  // The WISH LIST (JOS-324 shell, JOS-326 content) — the third face of the gear area: the items
  // you have decided you want, kept as a list rather than derived from a plan. It ships this
  // ticket as an honest placeholder panel and gains its content in JOS-326.
  | 'wishlist'
  | 'buffs'
  | 'timers'
  // FACTION STANDINGS (the third graduated `/outputfile` kind, 2026-09-05) — the tab that draws
  // `ProgressState.factionStandings`. UNRELEASED (the review-gate mechanism, devFlags.ts): it is
  // in `KNOWN_VIEWS` only behind the flag's splice below, its nav row is gated the same way in
  // NavDrawer.tsx, and it is deliberately ABSENT from `TELEMETRY_VIEWS` — that enum is validated
  // by the ingest Lambda, so widening it is a server deploy before it is a client change
  // (shared/telemetry.ts), and a gated view reports no dwell by construction (`dwellView` fails
  // closed). Graduation is the character sheet's exact path: delete the gate, widen the enum,
  // owner-sequenced.
  | 'factions'
  | 'preferences'
  // OWNER-ONLY view (src/renderer/src/features/triage/**). It stays in the union
  // unconditionally because a union member is a TYPE and types are erased — nothing of it
  // survives compilation. What actually strips is the CODE: the nav row, the content branch
  // and the whole component tree sit behind `OWNER_TOOLS` (DEV **and** `EQ_OWNER_TOOLS=1`,
  // JOS-72), and `KNOWN_VIEWS` below drops the string itself in a build or a checkout without
  // it, so a persisted 'triage' can never leave anyone staring at an empty content area.
  | 'triage'
  // The CHARACTER SHEET (src/renderer/src/features/character/**) — the gear area's LAST TAB: what
  // you are wearing right now, read out of the newest `/outputfile inventory` dump, plus the
  // searchable ledger of everything else that dump lists. It was UNRELEASED from JOS-45 (a
  // compile-time strip behind `UNRELEASED`, absent from every packaged build) until the owner
  // released it in JOS-327; it is an ordinary member of both lists below now.
  | 'character'
  // THE SPELL DRILLDOWN (JOS-508) — the first member of this union that is NOT a tab.
  //
  // It has no nav row (components/NavDrawer.tsx `ROWS` is an explicit list and this is not in it)
  // and it is deliberately ABSENT from `KNOWN_VIEWS` below, which is the one thing making that
  // work: a view id the build cannot restore bounces to the default on launch, and a spell page
  // with no spell is exactly the thing nobody should be able to come back to. It is reached ONLY
  // by clicking a spell name — every one of them, through `lib/spellLink.tsx` — and left by Back.
  //
  // AND IT IS ABSENT FROM `TELEMETRY_VIEWS` (shared/telemetry.ts) ON PURPOSE. That enum is
  // validated by the ingest Lambda, so a new member is a SERVER DEPLOY before it is a client
  // change; `lib/telemetry.ts dwellView` already fails closed for a view the schema does not
  // carry — its header calls that "the ONE deliberate exception" — so this page reports no dwell
  // and distorts no other tab's, with no deploy ordering to arrange. The same applies to
  // `noteCurrentView` in main, which drops an unknown id and keeps the last one it trusted: an
  // error thrown here is attributed to the tab you came from, which for a drill is the honest
  // answer anyway. Widening either enum is a separate, owner-sequenced change.
  | 'spell'
  // ============================================================================================
  // THE SPELLS AREA (docs/plans/spell-upgrades-and-loadout.md §2) — three tabs behind one nav row
  // ============================================================================================
  //
  // The gear area's shape, for the reason the gear area has that shape: these are three faces of
  // ONE question a player brings to a spell bar. `spells` is the corpus ("what is out there, and
  // what does it actually do"), `spellUpgrades` is the mote decision ("what do I spend on"), and
  // `spellLoadout` is the answer ("what should I have up"). Three nav rows would have put three
  // parts of one question in a vertical list where nothing said they belonged together, which is
  // precisely the mistake JOS-324 corrected for Gear.
  //
  // THE FOURTH FACE IS `spell` ABOVE, AND IT IS DELIBERATELY NOT A TAB. A drilldown is reached by
  // clicking a spell name and left by Back; a tab that opened it would have to invent a spell to
  // open it on.
  //
  // ALL THREE ARE UNRELEASED (devFlags.ts) — the review gate, and the exact path the character
  // sheet took to release (JOS-45 -> JOS-327). They are spliced into `KNOWN_VIEWS` behind the flag,
  // their nav row is gated the same way in NavDrawer.tsx, and they are ABSENT from
  // `TELEMETRY_VIEWS` (shared/telemetry.ts): that enum is validated by the ingest Lambda, so
  // widening it is a server deploy before it is a client change, and `lib/telemetry.ts dwellView`
  // already fails closed for a view the schema does not carry. Graduation is one word moved here
  // plus a server deploy, owner-sequenced, and the plan doc's wave 7 is where that is written down.
  | 'spells'
  | 'spellUpgrades'
  | 'spellLoadout'

export const VIEW_KEY = 'eq.view'
export const DEFAULT_VIEW: View = 'overview'

/**
 * What a view is CALLED, once. Two surfaces now say a tab's name out loud — the nav drawer's
 * rows, and a deep-linked drill's Back ("Back to Raid Targets", navOrigin.ts) — and a second copy
 * is exactly how one of them ends up saying "Bosses" while the other says "Raid Targets".
 *
 * A `Record<View, string>` rather than a lookup with a fallback: adding a view to the union
 * without naming it is a type error here, which is the only moment anyone would remember to.
 */
export const VIEW_LABELS: Record<View, string> = {
  overview: 'Overview',
  combat: 'Combat',
  mobs: 'Mobs',
  maps: 'Maps',
  bosses: 'Raid Targets',
  slayer: 'Achievements',
  unlocks: 'Unlocks',
  posky: 'Plane of Sky',
  alerts: 'Alerts',
  leveling: 'Leveling',
  loot: 'Loot',
  bazaar: 'Bazaar',
  // "Wiki Gaps" (owner, 2026-10-19): what the tab lists is what the WIKI lacks. Label only; the view id stays `gaps`.
  gaps: 'Wiki Gaps',
  // THE TAB IS CALLED EXALTATIONS (owner, 2026-08-06, JOS-42). "Planner" described what the
  // surface does for us; "Exaltations" names the game system the player came here about. The
  // `planner` view id, its route, its `eq.planner.*` keys and every `planner-*` testid are
  // unchanged — this is a label, not a refactor — and since JOS-43 this table is the ONE place a
  // tab is named, so the nav row and a drill's Back button rename together by construction.
  planner: 'Exaltations',
  gear: 'Gear',
  // THE TAB IS CALLED RECOMMENDED (owner, 2026-08-22). "Plan" named the doc's feature; "Recommended"
  // says what the surface hands you — the items and zones it recommends for your level. The `plan`
  // view id, its `eq.plan.*` keys, its telemetry value and every `plan-*` testid are unchanged: a
  // label, not a refactor, exactly as the Exaltations rename above.
  plan: 'Recommended',
  // JOS-324. Two words, as a player writes it — the tab bar says it and, the day a wish-list row
  // deep-links into Loot, so will that drill's Back button.
  wishlist: 'Wish list',
  buffs: 'Buffs',
  timers: 'Timers',
  factions: 'Factions',
  preferences: 'Preferences',
  triage: 'Triage',
  character: 'Character',
  // Named even though no nav row draws it: this table is also what a drill's Back button reads
  // (navOrigin.ts), so the day a spell page links onward to something else, that something's Back
  // says "Back to Spell" without anybody remembering to come here.
  spell: 'Spell',
  // THE SPELLS AREA. `spells` carries the nav row's name, so the row reads "Spells" while the tab
  // bar under it reads "Spellbook" for the same view - the gear area's own arrangement, where the
  // row says Gear and its first tab says Gear too. The word a player uses for the corpus is
  // "spellbook", and the word for the whole area is "spells"; naming them separately is what lets
  // both be right.
  spells: 'Spellbook',
  spellUpgrades: 'Upgrades',
  spellLoadout: 'Loadout'
}

/** The Spells nav row's own name, which is the AREA's name and not its first tab's. */
export const SPELL_AREA_LABEL = 'Spells'

// Every member of `View` this BUILD can actually render. A view missing here is silently
// bounced to the default on the next launch, so the two lists are edited together — always.
const KNOWN_VIEWS: View[] = [
  'overview',
  'combat',
  'mobs',
  'maps',
  'bosses',
  // The review-gate splice: a dev server draws the Achievements tab, a packaged build bounces a
  // persisted 'slayer' to the default view instead of routing to a tab it will not draw.
  ...(UNRELEASED ? (['slayer', 'unlocks'] as const) : []),
  'posky',
  'alerts',
  'leveling',
  'loot',
  // The review-gate splice: a dev server draws the Bazaar and Gaps tabs, a packaged build bounces a
  // persisted 'bazaar' to the default view instead of routing to a tab it will not draw.
  ...(UNRELEASED ? (['bazaar', 'gaps'] as const) : []),
  'planner',
  'gear',
  'plan',
  'wishlist',
  'buffs',
  'timers',
  // The review-gate splice (devFlags.ts UNRELEASED — a compile-time literal in a build, so the
  // string folds away with the branch): a dev server draws the Factions tab, a packaged build
  // bounces a persisted 'factions' to the default view instead of routing to a tab it will not
  // draw. The character sheet lived in this exact splice from JOS-45 until its release in
  // JOS-327; the telemetry contract test reads the splice and exempts its tenants from
  // `TELEMETRY_VIEWS` (tests/telemetryContract.test.mts).
  ...(UNRELEASED ? (['factions'] as const) : []),
  'preferences',
  // JOS-327: `character` used to be spliced in behind `UNRELEASED` right here, beside the
  // owner-tools splice below. It is a plain member now — every build draws it.
  'character',
  // THE SPELLS AREA, in the review-gate splice the character sheet occupied until JOS-327. It is
  // compile-time in a BUILD (`UNRELEASED` folds to `false`, taking the three literals with it) and
  // live on a dev server — so a packaged build bounces a persisted 'spells' to the default view
  // instead of routing to a tab it will not draw, and `SPELL_AREA_VIEWS` below derives its roster
  // from THIS list rather than re-spelling the gate, so the bar can never offer a tab that mounts
  // nothing. The contract test reads the splice and exempts its tenants from `TELEMETRY_VIEWS`
  // (tests/telemetryContract.test.mts).
  ...(UNRELEASED ? (['spells', 'spellUpgrades', 'spellLoadout'] as const) : []),
  // Compile-time in a BUILD (`false ? [...] : []` folds away, taking the literal with it) and a
  // runtime read of the opt-in on a dev server — so a contributor's checkout, which has no
  // `EQ_OWNER_TOOLS`, bounces a persisted 'triage' to the default view instead of routing to a
  // tab it will not draw.
  ...(OWNER_TOOLS ? (['triage'] as const) : [])
]

export function loadView(): View {
  const v = localStorage.getItem(VIEW_KEY)
  // The Inventory feature was folded into Loot (Task #55) — land those users on Loot
  // instead of silently bouncing them to the default view.
  if (v === 'inventory') return 'loot'
  return v && (KNOWN_VIEWS as string[]).includes(v) ? (v as View) : DEFAULT_VIEW
}

// ============================================================================
// THE GEAR AREA — one nav row, four tabs (JOS-324); five since the progression planner
// ============================================================================
//
// THE LAW THIS REPLACES. Until JOS-324 the nav drawer's law was one row per view, full stop, and
// three of those rows were three faces of the SAME question — Gear (what should I be wearing),
// Exaltations (what am I farming for) and the dev-only Character sheet (what am I wearing right
// now). Three rows put three answers to one question in a vertical list where nothing said they
// belonged together, and the third of them hung off the bottom behind a flag. The owner's ruling
// (2026-08-13, the One Coin Four Faces design) collapses them into ONE nav row with an in-area tab
// bar — and adds the fourth face the list had no room to grow: a Wish list (what do I want).
//
// WHAT DID **NOT** CHANGE, and that is the whole point of this shape. The view ids are untouched
// (`gear`, `planner`, `character`, plus the new `wishlist`), App still renders exactly ONE view at
// a time, and every tab switch travels the ordinary `selectView` path a nav row travels. So deep
// links still land, `viewKey` still unmounts the outgoing view on a switch, and the Back stack
// (appRouting.ts / navOrigin.ts / backTargets.ts) keeps its semantics to the letter — a tab click
// is MANUAL navigation and clears the parked trail, which is what a nav-row click always did.
//
// THE ORDER IS THE TAB BAR'S ORDER, and Character is LAST on purpose: it is the only member that
// is not a shopping question. (It was also the one the review gate could still take away — JOS-327
// released it, and the order is unchanged because the first reason was always the real one.)

/** Where the area remembers which tab you were last on. Renderer-only, like `VIEW_KEY`. */
export const GEAR_TAB_KEY = 'eq.gear.tab'

/** The tab the nav row opens when nothing has been remembered — the area's front door. */
export const DEFAULT_GEAR_TAB: View = 'gear'

/**
 * The faces, in tab order — FILTERED BY WHAT THIS BUILD CAN RENDER.
 *
 * Deriving the roster from `KNOWN_VIEWS` rather than re-spelling a per-view gate is what keeps the
 * two lists from disagreeing: a tab appears exactly when the build can draw the view behind it.
 * JOS-327 is the proof it works — graduating the Character tab was one word moved in `KNOWN_VIEWS`
 * above, no edit down here, and no window in which the bar offered a tab that mounts nothing.
 *
 * FOUR UNTIL THE PROGRESSION PLANNER, WHICH MAKES IT FIVE and takes the second seat. `plan` sits
 * immediately RIGHT OF `gear` because it is the same corpus asked a different question — Gear is
 * "what is out there", Plan is "and in what order should I go and get it" — and because the two
 * share every input the area holds (the class pin, the era toggle, the item index). Anywhere
 * further right would have put the socket board and the character sheet between a question and its
 * answer. The ordering rule the run already had is untouched: the shopping questions lead, and
 * intent (Wish list) is still last with truth (Character) beside it.
 */
export const GEAR_AREA_VIEWS: readonly View[] = (
  // Character sits LEFT of Wish list, in the run with everything else (owner ruling 2026-08-13:
  // the right-pushed placement hid the tab well enough that the owner reported it missing).
  ['gear', 'plan', 'planner', 'character', 'wishlist'] as const
).filter((v) => (KNOWN_VIEWS as readonly View[]).includes(v))

/** Is this view drawn inside the gear area? (⇒ the nav row reads selected, the tab bar is up.) */
export function isGearAreaView(view: View): boolean {
  return GEAR_AREA_VIEWS.includes(view)
}

/**
 * Which tab the Gear nav row opens.
 *
 * A row that always opened the Gear tab would make the other three cost two clicks forever, and a
 * row that opened whatever you last had would be wrong the first time. So: last-used, defaulting
 * to Gear — validated against `GEAR_AREA_VIEWS`, so a value written by a build that HAD the
 * Character tab cannot strand a packaged user on a tab their build does not draw.
 */
export function loadGearTab(): View {
  const v = localStorage.getItem(GEAR_TAB_KEY)
  return v && (GEAR_AREA_VIEWS as readonly string[]).includes(v) ? (v as View) : DEFAULT_GEAR_TAB
}

/**
 * Remember the area tab, if this view is one. Called on EVERY view change rather than from the
 * tab bar's click handler, because "last-used tab" has to mean the tab you were last standing on
 * however you got there — a deep link and a Back both count.
 */
export function rememberGearTab(view: View): void {
  if (isGearAreaView(view)) localStorage.setItem(GEAR_TAB_KEY, view)
}

// ============================================================================
// THE SPELLS AREA — one nav row, three tabs
// (docs/plans/spell-upgrades-and-loadout.md §2)
// ============================================================================
//
// THE SECOND AREA, AND IT IS THE GEAR AREA'S CONTRACT WITHOUT A LINE OF NEW MACHINERY. Everything
// below is the shape JOS-324 settled on, keyed differently: the view ids are ordinary members of
// the union, App still renders exactly ONE view at a time, and every tab switch travels the same
// `selectView` a nav row travels. So deep links land, `viewKey` unmounts the outgoing view on a
// switch, and the Back stack keeps its semantics to the letter - a tab click is MANUAL navigation
// and clears the parked trail. A bespoke in-area router would have had to re-earn all three.
//
// THE ORDER IS THE TAB BAR'S ORDER, and it is the order the questions arrive in. Spellbook is what
// exists; Upgrades is what to spend on; Loadout is what to have up. Loadout is LAST because it is
// the only one of the three that is an answer rather than a question, which is the same reason the
// gear area puts Character and Wish list at its end.

/** Where the area remembers which tab you were last on. Renderer-only, like `GEAR_TAB_KEY`. */
export const SPELL_TAB_KEY = 'eq.spells.tab'

/** The tab the nav row opens when nothing has been remembered - the area's front door. */
export const DEFAULT_SPELL_TAB: View = 'spells'

/**
 * The faces, in tab order - FILTERED BY WHAT THIS BUILD CAN RENDER.
 *
 * Derived from `KNOWN_VIEWS` rather than re-spelling the `UNRELEASED` gate, which is what keeps the
 * two lists from disagreeing: a tab appears exactly when the build can draw the view behind it.
 * While the gate is up this is the EMPTY ARRAY in a packaged build, and every function below
 * answers correctly for that - `isSpellAreaView` is false for everything, so no bar is drawn and no
 * row reads selected. Graduating the area is one word moved in `KNOWN_VIEWS` and no edit down here,
 * which is exactly how the Character tab graduated in JOS-327.
 */
export const SPELL_AREA_VIEWS: readonly View[] = (
  ['spells', 'spellUpgrades', 'spellLoadout'] as const
).filter((v) => (KNOWN_VIEWS as readonly View[]).includes(v))

/** Is this view drawn inside the Spells area? (=> the nav row reads selected, the tab bar is up.) */
export function isSpellAreaView(view: View): boolean {
  return SPELL_AREA_VIEWS.includes(view)
}

/**
 * Which tab the Spells nav row opens: last-used, defaulting to Spellbook.
 *
 * Validated against `SPELL_AREA_VIEWS`, so a value written by a dev server (where the gate is down
 * and all three exist) cannot strand a packaged user on a tab their build does not draw. With the
 * gate up that array is empty and this answers `DEFAULT_SPELL_TAB` - a view `loadView` will bounce,
 * which is the correct end state for a row that is not drawn either.
 */
export function loadSpellTab(): View {
  const v = localStorage.getItem(SPELL_TAB_KEY)
  return v && (SPELL_AREA_VIEWS as readonly string[]).includes(v) ? (v as View) : DEFAULT_SPELL_TAB
}

/**
 * Remember the area tab, if this view is one. Called on EVERY view change rather than from the tab
 * bar's click handler, for `rememberGearTab`'s reason: "last-used tab" has to mean the tab you were
 * last standing on however you got there, and a deep link and a Back both count.
 */
export function rememberSpellTab(view: View): void {
  if (isSpellAreaView(view)) localStorage.setItem(SPELL_TAB_KEY, view)
}
