import type { PlayerInput } from './player'

/** Same base as game/controls.ts's mouse look — a finger drags in the same
 *  pixels-to-radians sense a mouse move does, just through a different event. */
const BASE_SENSITIVITY = 0.0022
/** Half the stick's own on-screen size, px — how far a thumb can drag before
 *  the stick is maxed out, not still growing. */
const STICK_RADIUS = 40
/** A finger that moved less than this, px, before lifting is a tap, not a
 *  drag that happened to end quickly. */
const TAP_MOVE_THRESHOLD = 12
/** A press held longer than this, ms, is not a tap even if the finger never
 *  moved — a deliberate hold reads as something else, not an accidental tap. */
const TAP_TIME_THRESHOLD = 350
/** The walking stick's fixed on-screen home, px from the left/bottom edge —
 *  a thumb needs a permanent, findable-by-feel spot, not a ring that only
 *  exists once it is already being dragged. */
const ANCHOR_LEFT = 90
const ANCHOR_BOTTOM = 110
/** The action button (the touch `E`) sits this far above the look pad's
 *  centre, px — right over the thumb that is already on that side. */
const ACTION_ABOVE = 110
/** What the touch `E` looks like — on the button itself and in the HUD's
 *  "name — ✋" prompt, so the prompt points at the button it means. */
export const ACTION_GLYPH = '✋'

// No touch sprint control — the crouch button is the only gesture this
// scheme spends a dedicated screen element on; a run is out of scope here.
const NEUTRAL: PlayerInput = {
  forward: 0, strafe: 0, dYaw: 0, dPitch: 0, crouching: false, sprinting: false, jumping: false, dt: 0,
}

/**
 * The walking stick's forward/strafe from how far a thumb has dragged off
 * its own starting point — same forward/strafe convention `game/controls.ts`
 * already produces from WASD, so `stepPlayer` needs no touch-specific case.
 * Scales smoothly to the radius rather than snapping straight to full speed,
 * the way a real analog stick does.
 */
export function joystickVector(dx: number, dy: number, radius: number): { forward: number; strafe: number } {
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return { forward: 0, strafe: 0 }
  const scale = Math.min(len, radius) / radius / len
  return { forward: -dy * scale, strafe: dx * scale }
}

/** A drag offset pulled back onto a circle of `radius` once it goes past it,
 *  direction kept — where a stick's knob is drawn for a thumb that has
 *  dragged further than the ring. */
export function clampToRadius(dx: number, dy: number, radius: number): { x: number; y: number } {
  const len = Math.hypot(dx, dy)
  const k = len > radius ? radius / len : 1
  return { x: dx * k, y: dy * k }
}

/** A tap: barely moved, released quickly — as opposed to a drag (moved past
 *  the threshold) or a deliberate hold (still down past the time threshold). */
export function isTap(dx: number, dy: number, durationMs: number): boolean {
  return Math.hypot(dx, dy) < TAP_MOVE_THRESHOLD && durationMs < TAP_TIME_THRESHOLD
}

/** A screen point (px) as NDC (-1..1), the coordinate space `game/pick.ts`'s
 *  `nearestInView` casts its ray through — y flips, since NDC grows upward
 *  and screen coordinates grow downward. */
export function screenToNdc(x: number, y: number, width: number, height: number): { x: number; y: number } {
  return { x: (x / width) * 2 - 1, y: -(y / height) * 2 + 1 }
}

export interface TouchControls {
  /** False on anything without a coarse (touch) pointer — every method below
   *  is then a harmless no-op, so main.ts can build this unconditionally. */
  readonly active: boolean
  read(dt: number): PlayerInput
  setSensitivity(v: number): void
  setInvertY(v: boolean): void
  /** Stands the player up (or crouches them) from outside — getting on the bicycle. */
  setCrouching(v: boolean): void
  /** The screen point (NDC) of a tap completed since the last call, or null.
   *  Consuming clears it — a tap fires the interact it stands for exactly
   *  once, the same as the edge-triggered jump key in game/controls.ts. */
  consumeTap(): { x: number; y: number } | null
  /** Whether the action button was pressed since the last call — the touch
   *  `E`. Consuming clears it, like `consumeTap`. */
  consumeAction(): boolean
  /** Lights the action button while there is something in the crosshair to
   *  act on. */
  setActionReady(ready: boolean): void
  /** Hides every on-screen control — they sit above #ui, so an overlay
   *  (the encyclopedia, an inspection card) would otherwise have them on top. */
  setVisible(visible: boolean): void
  dispose(): void
}

interface StickTouch {
  id: number
  startX: number
  startY: number
  curX: number
  curY: number
}

interface LookTouch {
  id: number
  startX: number
  startY: number
  lastX: number
  lastY: number
  startT: number
  moved: boolean
}

/**
 * Touch input for a first-person walk: a virtual stick under the left thumb
 * for walking, a drag-to-look under the right for the view (pointer lock has
 * no touch equivalent), and a plain tap on the right side standing in for
 * "aim at it and press E" — a berry or a mushroom is tapped directly rather
 * than centred in a crosshair a thumb cannot aim as precisely as a mouse can.
 *
 * No-op when the device has no coarse pointer at all, so main.ts can build
 * this unconditionally next to the mouse/keyboard `createControls` and simply
 * prefer whichever one is `active`.
 */
export function createTouchControls(
  dom: HTMLElement,
  sensitivity = 1,
  labels: { move: string; look: string } = { move: '', look: '' },
): TouchControls {
  const active = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
  if (!active) {
    return {
      active: false,
      read: () => NEUTRAL,
      setSensitivity: () => {},
      setInvertY: () => {},
      setCrouching: () => {},
      consumeTap: () => null,
      consumeAction: () => false,
      setActionReady: () => {},
      setVisible: () => {},
      dispose: () => {},
    }
  }

  // The root cause of the control vanishing mid-drag on real phones: with
  // `touch-action` left at its default `auto`, the browser's own gesture
  // recognizer claims a drag as a page pan/zoom a few hundred ms in and fires
  // `pointercancel`, tearing down the stick/look touch this element was
  // still tracking. Harmless on desktop — `touch-action` only governs touch
  // gesture recognition, never mouse input.
  dom.style.touchAction = 'none'

  let sens = sensitivity
  let invertY = false
  let stick: StickTouch | null = null
  let look: LookTouch | null = null
  let dYaw = 0
  let dPitch = 0
  let pendingTap: { x: number; y: number } | null = null
  // A toggle, like the keyboard's (game/controls.ts): one tap down, the next up.
  let crouching = false
  let crouchHeld = false

  // A real button, not a canvas zone — a held press is simpler as its own
  // element (its own pointerdown/up, no interference with the stick/look
  // zones it sits outside of) than folding a third gesture into onDown/onUp's
  // left/right split. Bottom-centre: clear of both the left-half stick and
  // the right-half look/tap, and of the basket counter in ui/hud.ts's own
  // bottom-right corner.
  const crouchBtn = document.createElement('button')
  crouchBtn.textContent = '⬇'
  crouchBtn.style.cssText =
    'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);width:52px;height:52px;' +
    'margin:0;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:rgba(15,19,14,.55);' +
    'color:#eee;font-size:20px;line-height:1;pointer-events:auto;touch-action:none;z-index:42'
  const pressCrouch = (e: PointerEvent): void => {
    e.preventDefault()
    crouchBtn.setPointerCapture(e.pointerId)
    crouching = !crouching
    crouchHeld = true
    showCrouch()
  }
  const releaseCrouch = (): void => {
    crouchHeld = false
  }
  /** Lit while crouched, so the toggle's state is visible. */
  function showCrouch(): void {
    crouchBtn.style.background = crouching ? 'rgba(126,196,107,.55)' : 'rgba(15,19,14,.55)'
  }
  crouchBtn.addEventListener('pointerdown', pressCrouch)
  crouchBtn.addEventListener('pointerup', releaseCrouch)
  crouchBtn.addEventListener('pointercancel', releaseCrouch)
  document.body.append(crouchBtn)

  // Permanently on screen at a fixed home rather than appearing at the
  // thumb's touch point — a control that only exists once already being
  // dragged is not a control a player can find. `pointer-events:none` keeps
  // them out of the way of the drag they only reflect.
  const ringStyle =
    'position:fixed;width:84px;height:84px;margin:-42px 0 0 -42px;border-radius:50%;' +
    'background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.35);' +
    'pointer-events:none;z-index:40'
  const knobStyle =
    'position:fixed;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;' +
    'background:rgba(255,255,255,.35);pointer-events:none;z-index:41'
  const ring = document.createElement('div')
  ring.style.cssText = ringStyle
  const knob = document.createElement('div')
  knob.style.cssText = knobStyle
  // The look side gets the same ring and knob, mirrored on the right: the
  // whole right half still turns the view, but a new player had nothing on
  // screen saying so (a live report, 2026-10-16) — only the walking stick.
  const lookRing = document.createElement('div')
  lookRing.style.cssText = ringStyle
  const lookKnob = document.createElement('div')
  lookKnob.style.cssText = knobStyle
  // One-word captions over each ring, until that control is first used.
  const captionStyle =
    'position:fixed;transform:translate(-50%,-100%);margin-top:-50px;font:13px system-ui,sans-serif;' +
    'color:#eee;text-shadow:0 1px 3px #000;opacity:.85;pointer-events:none;z-index:41;' +
    'white-space:nowrap;transition:opacity .6s'
  const moveCaption = document.createElement('div')
  moveCaption.style.cssText = captionStyle
  moveCaption.textContent = labels.move
  const lookCaption = document.createElement('div')
  lookCaption.style.cssText = captionStyle
  lookCaption.textContent = labels.look
  const fadeCaption = (el: HTMLElement): void => {
    el.style.opacity = '0'
  }
  document.body.append(ring, knob, lookRing, lookKnob, moveCaption, lookCaption)

  // The touch `E`: everything the key does (pick, quest item, door, scrub,
  // pot, jar), aimed by the crosshair the same way. A tap on the thing
  // itself still works too, but nothing on screen ever said so.
  const actionBtn = document.createElement('button')
  actionBtn.textContent = ACTION_GLYPH
  actionBtn.style.cssText =
    'position:fixed;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;' +
    'border:1px solid rgba(255,255,255,.35);background:rgba(15,19,14,.55);color:#eee;' +
    'font-size:28px;line-height:1;padding:0;pointer-events:auto;touch-action:none;z-index:42;' +
    'transition:background .15s,border-color .15s'
  let actionPending = false
  let actionReady = false
  let visible = true
  const pressAction = (e: PointerEvent): void => {
    e.preventDefault()
    actionPending = true
  }
  actionBtn.addEventListener('pointerdown', pressAction)
  document.body.append(actionBtn)

  const anchorX = (): number => ANCHOR_LEFT
  const anchorY = (): number => innerHeight - ANCHOR_BOTTOM
  const lookX = (): number => innerWidth - ANCHOR_LEFT

  const placeKnob = (x: number, y: number): void => {
    knob.style.left = `${x}px`
    knob.style.top = `${y}px`
  }
  const placeLookKnob = (dx: number, dy: number): void => {
    const p = clampToRadius(dx, dy, STICK_RADIUS)
    lookKnob.style.left = `${lookX() + p.x}px`
    lookKnob.style.top = `${anchorY() + p.y}px`
  }
  const placeAtAnchor = (): void => {
    ring.style.left = `${anchorX()}px`
    ring.style.top = `${anchorY()}px`
    placeKnob(anchorX(), anchorY())
    lookRing.style.left = `${lookX()}px`
    lookRing.style.top = `${anchorY()}px`
    placeLookKnob(0, 0)
    moveCaption.style.left = `${anchorX()}px`
    moveCaption.style.top = `${anchorY()}px`
    lookCaption.style.left = `${lookX()}px`
    lookCaption.style.top = `${anchorY()}px`
    actionBtn.style.left = `${lookX()}px`
    actionBtn.style.top = `${anchorY() - ACTION_ABOVE}px`
  }
  placeAtAnchor()
  // A phone turned on its side moves every bottom-anchored control.
  addEventListener('resize', placeAtAnchor)

  const onLeft = (x: number): boolean => x < innerWidth / 2

  const onDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return
    if (onLeft(e.clientX)) {
      if (stick) return
      stick = { id: e.pointerId, startX: anchorX(), startY: anchorY(), curX: e.clientX, curY: e.clientY }
    } else {
      if (look) return
      look = {
        id: e.pointerId, startX: e.clientX, startY: e.clientY,
        lastX: e.clientX, lastY: e.clientY, startT: performance.now(), moved: false,
      }
    }
  }

  const onMove = (e: PointerEvent): void => {
    if (stick && e.pointerId === stick.id) {
      stick.curX = e.clientX
      stick.curY = e.clientY
      const p = clampToRadius(stick.curX - stick.startX, stick.curY - stick.startY, STICK_RADIUS)
      placeKnob(stick.startX + p.x, stick.startY + p.y)
      fadeCaption(moveCaption)
    }
    if (look && e.pointerId === look.id) {
      dYaw -= (e.clientX - look.lastX) * BASE_SENSITIVITY * sens
      dPitch -= (e.clientY - look.lastY) * BASE_SENSITIVITY * sens * (invertY ? -1 : 1)
      look.lastX = e.clientX
      look.lastY = e.clientY
      if (!look.moved && Math.hypot(e.clientX - look.startX, e.clientY - look.startY) >= TAP_MOVE_THRESHOLD) {
        look.moved = true
        fadeCaption(lookCaption)
      }
      // The pad's knob shows the drag, wherever on the right half it began.
      placeLookKnob(e.clientX - look.startX, e.clientY - look.startY)
    }
  }

  const onUp = (e: PointerEvent): void => {
    if (stick && e.pointerId === stick.id) {
      stick = null
      placeKnob(anchorX(), anchorY())
    }
    if (look && e.pointerId === look.id) {
      if (!look.moved && isTap(0, 0, performance.now() - look.startT)) {
        pendingTap = screenToNdc(look.startX, look.startY, innerWidth, innerHeight)
      }
      look = null
      placeLookKnob(0, 0)
    }
  }

  dom.addEventListener('pointerdown', onDown)
  dom.addEventListener('pointermove', onMove)
  dom.addEventListener('pointerup', onUp)
  dom.addEventListener('pointercancel', onUp)

  return {
    active: true,
    read(dt: number): PlayerInput {
      const { forward, strafe } = stick
        ? joystickVector(stick.curX - stick.startX, stick.curY - stick.startY, STICK_RADIUS)
        : { forward: 0, strafe: 0 }
      const input: PlayerInput = {
        forward, strafe, dYaw, dPitch, crouching, sprinting: false, jumping: false, descend: crouchHeld ? 1 : 0, dt,
      }
      dYaw = 0
      dPitch = 0
      return input
    },
    setSensitivity(v: number): void {
      sens = v
    },
    setInvertY(v: boolean): void {
      invertY = v
    },
    setCrouching(v: boolean): void {
      crouching = v
      showCrouch()
    },
    consumeTap(): { x: number; y: number } | null {
      const t = pendingTap
      pendingTap = null
      return t
    },
    consumeAction(): boolean {
      const a = actionPending
      actionPending = false
      return a
    },
    setActionReady(ready: boolean): void {
      if (ready === actionReady) return // called every frame
      actionReady = ready
      actionBtn.style.background = ready ? 'rgba(126,196,107,.6)' : 'rgba(15,19,14,.55)'
      actionBtn.style.borderColor = ready ? 'rgba(200,255,180,.8)' : 'rgba(255,255,255,.35)'
    },
    setVisible(v: boolean): void {
      if (v === visible) return // called every frame
      visible = v
      for (const el of [ring, knob, lookRing, lookKnob, moveCaption, lookCaption, actionBtn, crouchBtn]) {
        el.style.display = v ? '' : 'none'
      }
    },
    dispose(): void {
      removeEventListener('resize', placeAtAnchor)
      actionBtn.removeEventListener('pointerdown', pressAction)
      dom.removeEventListener('pointerdown', onDown)
      dom.removeEventListener('pointermove', onMove)
      dom.removeEventListener('pointerup', onUp)
      dom.removeEventListener('pointercancel', onUp)
      crouchBtn.removeEventListener('pointerdown', pressCrouch)
      crouchBtn.removeEventListener('pointerup', releaseCrouch)
      crouchBtn.removeEventListener('pointercancel', releaseCrouch)
      ring.remove()
      knob.remove()
      lookRing.remove()
      lookKnob.remove()
      moveCaption.remove()
      lookCaption.remove()
      actionBtn.remove()
      crouchBtn.remove()
    },
  }
}
