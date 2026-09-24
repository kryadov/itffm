import type { PlayerInput } from './player'

const BASE_SENSITIVITY = 0.0022

/** Keys that crouch and stand up again. */
export const CROUCH_KEYS: readonly string[] = ['ControlLeft', 'ControlRight', 'KeyC']

/**
 * Crouching is a toggle: one press down, the next up — holding Ctrl while
 * walking turned WASD into browser shortcuts (Ctrl+W closes the tab; a live
 * request, 2026-09-24). `repeat` is whether the key was already down (the
 * browser repeats keydown while it is held).
 */
export function nextCrouch(on: boolean, code: string, repeat: boolean): boolean {
  return CROUCH_KEYS.includes(code) && !repeat ? !on : on
}

/**
 * Keyboard and mouse into a PlayerInput. Pointer lock on click: without it the
 * mouse runs into the edge of the window and you cannot look around.
 *
 * @param sensitivity multiplier on the base mouse sensitivity — the settings
 *   menu's slider (see ui/settingsMenu.ts) reaches this through `setSensitivity`
 *   rather than requiring the controls to be rebuilt.
 */
export function createControls(
  dom: HTMLElement,
  sensitivity = 1,
): {
  read(dt: number): PlayerInput
  setSensitivity(v: number): void
  setInvertY(v: boolean): void
  /** Stands the player up (or crouches them) from outside — getting on the bicycle. */
  setCrouching(v: boolean): void
  dispose(): void
} {
  const keys = new Set<string>()
  let dYaw = 0
  let dPitch = 0
  let jumpPending = false
  let sens = sensitivity
  let invertY = false
  let crouchOn = false

  const down = (e: KeyboardEvent) => {
    // Edge-triggered: the browser repeats keydown while a key is held, but a
    // jump command should fire once per press, not once per repeat event.
    if (e.code === 'Space' && !keys.has('Space')) jumpPending = true
    crouchOn = nextCrouch(crouchOn, e.code, keys.has(e.code))
    keys.add(e.code)
  }
  const up = (e: KeyboardEvent) => keys.delete(e.code)
  const move = (e: MouseEvent) => {
    if (document.pointerLockElement !== dom) return
    dYaw -= e.movementX * BASE_SENSITIVITY * sens
    dPitch -= e.movementY * BASE_SENSITIVITY * sens * (invertY ? -1 : 1)
  }
  const click = () => {
    // Overlays (inspection, the encyclopedia) take the mouse for themselves.
    if (document.querySelector('#ui > div[data-modal]')) return
    // A touch tap fires this same click (game/touchControls.ts owns actual
    // touch look/aim), and Pointer Lock has no touch equivalent — every tap
    // would otherwise throw an unhandled "user gesture required" rejection.
    if (window.matchMedia?.('(pointer: coarse)').matches) return
    // Even on a mouse device the browser can refuse this (a click too soon
    // after the tab regained focus, say) — a rejection here has nothing
    // useful to do about it, so it is swallowed rather than left unhandled.
    dom.requestPointerLock().catch(() => {})
  }

  addEventListener('keydown', down)
  addEventListener('keyup', up)
  addEventListener('mousemove', move)
  dom.addEventListener('click', click)

  return {
    read(dt: number): PlayerInput {
      const input: PlayerInput = {
        forward:
          (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) -
          (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0),
        strafe:
          (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
          (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
        dYaw,
        dPitch,
        crouching: crouchOn,
        descend: CROUCH_KEYS.some((k) => keys.has(k)) ? 1 : 0,
        sprinting: keys.has('ShiftLeft'),
        jumping: jumpPending,
        lift: keys.has('Space') ? 1 : 0,
        dt,
      }
      dYaw = 0
      dPitch = 0
      jumpPending = false
      return input
    },
    setSensitivity(v: number) {
      sens = v
    },
    setInvertY(v: boolean) {
      invertY = v
    },
    setCrouching(v: boolean) {
      crouchOn = v
    },
    dispose() {
      removeEventListener('keydown', down)
      removeEventListener('keyup', up)
      removeEventListener('mousemove', move)
      dom.removeEventListener('click', click)
    },
  }
}
