import type { PlayerInput } from './player'

const BASE_SENSITIVITY = 0.0022

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
): { read(dt: number): PlayerInput; setSensitivity(v: number): void; dispose(): void } {
  const keys = new Set<string>()
  let dYaw = 0
  let dPitch = 0
  let jumpPending = false
  let sens = sensitivity

  const down = (e: KeyboardEvent) => {
    // Edge-triggered: the browser repeats keydown while a key is held, but a
    // jump command should fire once per press, not once per repeat event.
    if (e.code === 'Space' && !keys.has('Space')) jumpPending = true
    keys.add(e.code)
  }
  const up = (e: KeyboardEvent) => keys.delete(e.code)
  const move = (e: MouseEvent) => {
    if (document.pointerLockElement !== dom) return
    dYaw -= e.movementX * BASE_SENSITIVITY * sens
    dPitch -= e.movementY * BASE_SENSITIVITY * sens
  }
  const click = () => {
    // Overlays (inspection, the encyclopedia) take the mouse for themselves.
    if (document.querySelector('#ui > div[data-modal]')) return
    dom.requestPointerLock()
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
        crouching: keys.has('ShiftLeft') || keys.has('ControlLeft'),
        jumping: jumpPending,
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
    dispose() {
      removeEventListener('keydown', down)
      removeEventListener('keyup', up)
      removeEventListener('mousemove', move)
      dom.removeEventListener('click', click)
    },
  }
}
