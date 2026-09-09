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

const NEUTRAL: PlayerInput = { forward: 0, strafe: 0, dYaw: 0, dPitch: 0, crouching: false, jumping: false, dt: 0 }

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
  /** The screen point (NDC) of a tap completed since the last call, or null.
   *  Consuming clears it — a tap fires the interact it stands for exactly
   *  once, the same as the edge-triggered jump key in game/controls.ts. */
  consumeTap(): { x: number; y: number } | null
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
export function createTouchControls(dom: HTMLElement, sensitivity = 1): TouchControls {
  const active = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
  if (!active) {
    return {
      active: false,
      read: () => NEUTRAL,
      setSensitivity: () => {},
      setInvertY: () => {},
      consumeTap: () => null,
      dispose: () => {},
    }
  }

  let sens = sensitivity
  let invertY = false
  let stick: StickTouch | null = null
  let look: LookTouch | null = null
  let dYaw = 0
  let dPitch = 0
  let pendingTap: { x: number; y: number } | null = null
  let crouching = false

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
    crouchBtn.style.background = 'rgba(126,196,107,.55)'
    crouching = true
  }
  const releaseCrouch = (): void => {
    crouchBtn.style.background = 'rgba(15,19,14,.55)'
    crouching = false
  }
  crouchBtn.addEventListener('pointerdown', pressCrouch)
  crouchBtn.addEventListener('pointerup', releaseCrouch)
  crouchBtn.addEventListener('pointercancel', releaseCrouch)
  document.body.append(crouchBtn)

  // Purely visual: a ring at the thumb's starting point and a knob that
  // follows the drag, so the stick is discoverable at all — nothing else on
  // screen hints that the left half is touch-draggable. `pointer-events:none`
  // keeps them out of the way of the drag they are only reflecting.
  const ringStyle =
    'position:fixed;width:84px;height:84px;margin:-42px 0 0 -42px;border-radius:50%;' +
    'background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.35);' +
    'pointer-events:none;z-index:40;display:none'
  const knobStyle =
    'position:fixed;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;' +
    'background:rgba(255,255,255,.35);pointer-events:none;z-index:41;display:none'
  const ring = document.createElement('div')
  ring.style.cssText = ringStyle
  const knob = document.createElement('div')
  knob.style.cssText = knobStyle
  document.body.append(ring, knob)

  const onLeft = (x: number): boolean => x < innerWidth / 2

  const onDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return
    if (onLeft(e.clientX)) {
      if (stick) return
      stick = { id: e.pointerId, startX: e.clientX, startY: e.clientY, curX: e.clientX, curY: e.clientY }
      ring.style.left = `${e.clientX}px`
      ring.style.top = `${e.clientY}px`
      ring.style.display = 'block'
      knob.style.left = `${e.clientX}px`
      knob.style.top = `${e.clientY}px`
      knob.style.display = 'block'
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
      const dx = stick.curX - stick.startX
      const dy = stick.curY - stick.startY
      const len = Math.hypot(dx, dy)
      const clamp = len > STICK_RADIUS ? STICK_RADIUS / len : 1
      knob.style.left = `${stick.startX + dx * clamp}px`
      knob.style.top = `${stick.startY + dy * clamp}px`
    }
    if (look && e.pointerId === look.id) {
      dYaw -= (e.clientX - look.lastX) * BASE_SENSITIVITY * sens
      dPitch -= (e.clientY - look.lastY) * BASE_SENSITIVITY * sens * (invertY ? -1 : 1)
      look.lastX = e.clientX
      look.lastY = e.clientY
      if (!look.moved && Math.hypot(e.clientX - look.startX, e.clientY - look.startY) >= TAP_MOVE_THRESHOLD) {
        look.moved = true
      }
    }
  }

  const onUp = (e: PointerEvent): void => {
    if (stick && e.pointerId === stick.id) {
      stick = null
      ring.style.display = 'none'
      knob.style.display = 'none'
    }
    if (look && e.pointerId === look.id) {
      if (!look.moved && isTap(0, 0, performance.now() - look.startT)) {
        pendingTap = screenToNdc(look.startX, look.startY, innerWidth, innerHeight)
      }
      look = null
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
      const input: PlayerInput = { forward, strafe, dYaw, dPitch, crouching, jumping: false, dt }
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
    consumeTap(): { x: number; y: number } | null {
      const t = pendingTap
      pendingTap = null
      return t
    },
    dispose(): void {
      dom.removeEventListener('pointerdown', onDown)
      dom.removeEventListener('pointermove', onMove)
      dom.removeEventListener('pointerup', onUp)
      dom.removeEventListener('pointercancel', onUp)
      crouchBtn.removeEventListener('pointerdown', pressCrouch)
      crouchBtn.removeEventListener('pointerup', releaseCrouch)
      crouchBtn.removeEventListener('pointercancel', releaseCrouch)
      ring.remove()
      knob.remove()
      crouchBtn.remove()
    },
  }
}
