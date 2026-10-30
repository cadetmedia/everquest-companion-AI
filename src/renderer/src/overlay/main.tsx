import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { isHealOverlayKind } from '@shared/types'
import { isTimerOverlayKind } from '@shared/buffTimers'
import { installOverlayPointerExit } from './pointerExit'

// The overlay renders in its OWN transparent BrowserWindow (Task #52). It is a
// standalone React root — deliberately NOT wrapped in the app's MUI ThemeProvider
// or ErrorBoundary. Every surface here is a tiny, dependency-light component (plain
// divs + inline styles) so it stays cheap to paint on top of the game and has no
// reason to pull the whole MUI/theme surface into a second window bundle.
//
// ONE bundle serves every overlay KIND; which component mounts is decided by the
// `?kind=` query the window was opened with (read + validated by the preload):
//   'events'                          → the event log (alerts / notable loot / quests)
//   'heal-fight' | 'heal-overall'     → the healing meter (Task #59)
//   'toast'                           → the celebration strip (usually renders nothing)
//   'buffs' | 'debuffs'               → the timer bars (JOS-89, split in two by JOS-119): ONE
//                                       component with a `kind` prop, never two copies — the
//                                       buffs window keeps the beneficial rows, the debuffs
//                                       window keeps the debuff + crowd-control rows, and both
//                                       read the same two modules
//   'xp'                              → the progress read (JOS-195): xp/hr, next level (or the AA
//                                       pace at the cap) and motes per hour, over the app-wide
//                                       slice vocabulary with `session` as its own default
//   'alertBanner'                     → the alert banner (JOS-378): one large line per firing of an
//                                       alert marked "Show on screen", where the eyes are. Shares
//                                       the toast's queue (./cardQueue.ts), not its window
//   'conCard'                         → the mob card (JOS-383): one tooltip-shaped card per `/con`
//                                       — level, zone, five resist chips, top drops, respawn.
//                                       Shares the same queue at a cap of one, so the next con
//                                       replaces it
//   'respawn'                         → the respawn clocks (JOS-194): one countdown per watched
//                                       mob that has died, started by the death message and
//                                       numbered from your own kills
//   'gaps'                            → the Wiki Gaps list (owner, 2026-10-20): the first ten rows
//                                       of the Gaps tab's list, written by the main window to the
//                                       storage both windows share (shared/gapsOverlay.ts)
//   'ai'                              → last assistant answer + (unlocked) ask box; shares the
//                                       main tab's thread via localStorage
//   everything else                   → the damage meter (fight / zone selection lives inside)
//
// ONE BUNDLE, BUT EACH WINDOW LOADS ONLY ITS OWN KIND (performance review 2026-10-20, finding 10).
// Every surface is a `React.lazy` chunk, so a window parses the shared entry (React, the bridge
// glue) plus the one surface it draws, not all twelve. A `lazy` import starts on its first render,
// which is the root's first render, so only this window's kind is ever fetched. The Suspense
// fallback is nothing: a transparent window for the one local chunk read, as before React drew.
const kind = window.eqOverlay?.kind ?? 'fight'

const EventLogOverlay = lazy(() => import('./EventLogOverlay'))
const ToastOverlay = lazy(() => import('./ToastOverlay'))
const AlertBannerOverlay = lazy(() => import('./AlertBannerOverlay'))
const ConCardOverlay = lazy(() => import('./ConCardOverlay'))
const XpOverlay = lazy(() => import('./XpOverlay'))
const RespawnOverlay = lazy(() => import('./RespawnOverlay'))
const MapPinsOverlay = lazy(() => import('./MapPinsOverlay'))
const SkyQuestsOverlay = lazy(() => import('./SkyQuestsOverlay'))
const GapsOverlay = lazy(() => import('./GapsOverlay'))
const AiOverlay = lazy(() => import('./AiOverlay'))
const BuffsOverlay = lazy(() => import('./BuffsOverlay'))
const HealMeter = lazy(() => import('./HealMeter'))
const OverlayMeter = lazy(() => import('./OverlayMeter'))

function Surface(): React.JSX.Element {
  if (kind === 'events') return <EventLogOverlay />
  if (kind === 'toast') return <ToastOverlay />
  if (kind === 'alertBanner') return <AlertBannerOverlay />
  if (kind === 'conCard') return <ConCardOverlay />
  if (kind === 'xp') return <XpOverlay />
  if (kind === 'respawn') return <RespawnOverlay />
  if (kind === 'mapPins') return <MapPinsOverlay />
  if (kind === 'skyQuests') return <SkyQuestsOverlay />
  if (kind === 'gaps') return <GapsOverlay />
  if (kind === 'ai') return <AiOverlay />
  if (isTimerOverlayKind(kind)) return <BuffsOverlay kind={kind} />
  if (isHealOverlayKind(kind)) return <HealMeter />
  return <OverlayMeter />
}

// EVERY KIND GETS THE ORPHAN GUARD (JOS-358). A native tooltip that outlives the pointer sits on
// top of the GAME, and a click-through window has nothing left to un-hover it — so the dismissal
// is installed here, once, for whichever surface mounts below. See overlay/pointerExit.ts for
// which three things count as "the pointer left" on an always-on-top window.
installOverlayPointerExit()

// overlay.html always carries #overlay-root; fail loudly rather than letting
// createRoot throw a container error nobody can trace back.
const container = document.getElementById('overlay-root')
if (!container) throw new Error('overlay: #overlay-root container missing from overlay.html')

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      <Surface />
    </Suspense>
  </React.StrictMode>
)
