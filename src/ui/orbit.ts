import * as THREE from 'three'

/**
 * A small orbit around a point: drag to turn, wheel to zoom.
 *
 * Ours rather than the examples' OrbitControls — this is all we need, and it
 * keeps us off the examples bundle, which drags in far more than that.
 */
export function attachOrbit(
  camera: THREE.PerspectiveCamera,
  dom: HTMLElement,
  target: THREE.Vector3,
  radius: number,
): () => void {
  let theta = 0
  let phi = 1.1
  let r = radius
  let dragging = false

  const apply = () => {
    camera.position.set(
      target.x + r * Math.sin(phi) * Math.sin(theta),
      target.y + r * Math.cos(phi),
      target.z + r * Math.sin(phi) * Math.cos(theta),
    )
    camera.lookAt(target)
  }

  const down = () => { dragging = true }
  const up = () => { dragging = false }
  const move = (e: PointerEvent) => {
    if (!dragging) return
    theta -= e.movementX * 0.006
    phi = Math.min(Math.PI - 0.15, Math.max(0.15, phi - e.movementY * 0.006))
    apply()
  }
  const wheel = (e: WheelEvent) => {
    r = Math.min(radius * 4, Math.max(radius * 0.25, r * (1 + Math.sign(e.deltaY) * 0.12)))
    apply()
  }

  dom.addEventListener('pointerdown', down)
  addEventListener('pointerup', up)
  addEventListener('pointermove', move)
  dom.addEventListener('wheel', wheel, { passive: true })
  apply()

  return () => {
    dom.removeEventListener('pointerdown', down)
    removeEventListener('pointerup', up)
    removeEventListener('pointermove', move)
    dom.removeEventListener('wheel', wheel)
  }
}
