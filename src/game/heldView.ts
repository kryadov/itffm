import * as THREE from 'three'
import { buildHoneyJar } from '../world/honeyJar'
import { buildSoupBowl } from '../world/soupBowl'

/**
 * What you are carrying, in view: the honey jar (empty or full) or the bowl of
 * ukha low on the right while you walk, and the jar hanging on its string
 * under the quadcopter while it flies.
 *
 * Drawn the way the bicycle is (game/bikeView.ts): a second pass over the
 * finished frame with the depth cleared, so it never sinks into a wall, with
 * its own lights copied from the wood's each frame.
 */
export type HeldItem = 'jar-empty' | 'jar-full' | 'soup' | null
export type HeldMode = 'hand' | 'drone'

export interface HeldView {
  set(item: HeldItem, mode: HeldMode): void
  /** Follows the camera — call once a frame after it is posed. */
  update(dt: number, camera: THREE.Camera): void
  render(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void
}

/** Low on the right, a little ahead, as if held in the right hand. */
const IN_HAND = new THREE.Vector3(0.2, -0.2, -0.42)
/** Under the quadcopter's camera, hanging on its string. */
const UNDER_DRONE = new THREE.Vector3(0, -0.24, -0.5)

export function createHeldView(worldScene: THREE.Scene): HeldView {
  const scene = new THREE.Scene()
  const hemi = new THREE.HemisphereLight(0xffffff, 0x555555, 1)
  const sun = new THREE.DirectionalLight(0xffffff, 1)
  scene.add(hemi, sun)
  let worldHemi: THREE.HemisphereLight | undefined
  let worldSun: THREE.DirectionalLight | undefined
  worldScene.traverse((o) => {
    if (o instanceof THREE.HemisphereLight && !worldHemi) worldHemi = o
    else if (o instanceof THREE.DirectionalLight && !worldSun) worldSun = o
  })

  const rig = new THREE.Group()
  scene.add(rig)
  const holder = new THREE.Group()
  rig.add(holder)
  const jar = buildHoneyJar()
  jar.group.position.y = -0.065
  holder.add(jar.group)
  const bowl = buildSoupBowl()
  bowl.group.position.y = -0.03
  bowl.group.rotation.x = 0.5
  holder.add(bowl.group)
  // The jar's string, up out of the top of the view to the quadcopter.
  const string = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0015, 0.0015, 0.5, 4),
    new THREE.MeshBasicMaterial({ color: 0xe8dcc0 }),
  )
  string.position.y = 0.05 + 0.25
  holder.add(string)

  let item: HeldItem = null
  let mode: HeldMode = 'hand'
  let elapsed = 0
  rig.visible = false

  return {
    set(next, nextMode) {
      item = next
      mode = nextMode
      rig.visible = item !== null
      jar.group.visible = item === 'jar-empty' || item === 'jar-full'
      jar.setFull(item === 'jar-full')
      bowl.group.visible = item === 'soup'
      string.visible = mode === 'drone'
      holder.position.copy(mode === 'drone' ? UNDER_DRONE : IN_HAND)
    },
    update(dt, camera) {
      if (!item) return
      elapsed += dt
      rig.position.copy(camera.position)
      rig.quaternion.copy(camera.quaternion)
      // A jar on a string sways; one in hand rocks a little with the walk.
      const sway = mode === 'drone' ? 0.12 : 0.03
      holder.rotation.z = Math.sin(elapsed * 1.7) * sway
      holder.rotation.x = Math.sin(elapsed * 1.3 + 1) * sway * 0.6
      if (item === 'soup') bowl.update(elapsed)
      if (worldHemi) {
        hemi.color.copy(worldHemi.color)
        hemi.groundColor.copy(worldHemi.groundColor)
        hemi.intensity = worldHemi.intensity
      }
      if (worldSun) {
        sun.color.copy(worldSun.color)
        sun.intensity = worldSun.intensity
        // Only the direction matters for a directional light.
        sun.position.copy(worldSun.position).sub(worldSun.target.position)
      }
    },
    render(renderer, camera) {
      if (!item) return
      const autoClear = renderer.autoClear
      renderer.autoClear = false
      renderer.clearDepth()
      renderer.render(scene, camera)
      renderer.autoClear = autoClear
    },
  }
}
