// ownFires.ts — alert definitions the APP adds to the engine's set for its own use, and the taker
// that claims their fires before anything sounds. One user today: the screenshot capture's macro
// line (ipc/shotCapture.ts; owner, 2026-10-21: "stay faithful to the log reading only"). The engine
// is what reads the live log, and a raw alert is its existing way to say a line came by, live only
// (a replayed line never fires). These defs are not in the store, so they are never listed, edited,
// reset or shared with the player's alerts, and a fire taken here makes no sound.
//
// A registration, not an import, so the engine host does not load the capture's reader
// (desktopCapturer, OCR): definePush.ts's pattern.

import type { AlertDef } from '../../shared/types'
import type { FireMessage } from '../../shared/dataServer/protocol.generated'
import { pushAppKnowledge, type DefineOp } from './definePush'

let own: { defs: AlertDef[]; take: (fire: FireMessage) => boolean } | null = null

/** Install the app's own defs and their taker, and hand the engine the new set. */
export function setOwnFires(defs: AlertDef[], take: (fire: FireMessage) => boolean): void {
  own = { defs, take }
  pushAppKnowledge('alerts.define')
}

/** A define's params as sent: `alerts.define` gets the app's own defs after the player's. */
export function withOwnDefs<P>(op: DefineOp, params: P): P {
  if (op !== 'alerts.define' || own === null) return params
  const { defs } = params as { defs: AlertDef[] }
  return { ...params, defs: [...defs, ...own.defs] }
}

/** True when the fire is one of the app's own and was taken: it is not an alert to play. */
export const takeOwnFire = (fire: FireMessage): boolean => own?.take(fire) === true
