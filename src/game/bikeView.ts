import * as THREE from 'three'
import { buildBikeCockpitModel } from '../world/questItemModels'
import { steerTarget, smoothSteer, wheelSpin } from './bikeSteer'

/**
 * The bicycle you are carrying, seen from the saddle: its handlebar and front
 * wheel low in the view, turning as you turn.
 *
 * It is drawn as a second pass over the finished frame, with the depth buffer
 * cleared in between — the same trick a first-person game uses for the gun in
 * hand. Put into the wood's own scene it would sink into a wall or a trunk the
 * moment you stood close to one, and the fog would grey it out. The price is
 * that this pass has its own lights, so it copies the wood's each frame: a bar
 * that stayed noon-bright in the middle of the night would give it away.
 */
export interface BikeView {
  /** Everything this view draws, in world space. */
  group: THREE.Group
  /** Whether the bicycle is drawn at all — only while it is being carried. */
  setVisible(on: boolean): void
  isVisible(): boolean
  /** Follows the camera, eases the bar toward the way the view is turning, and
   *  rolls the front wheel with `forwardSpeed` (m/s along the way you face,
   *  negative backing up). Call once a frame, after the camera has been posed. */
  update(dt: number, yaw: number, camera: THREE.Camera, forwardSpeed?: number): void
  /** Draws the bicycle over what is already on screen. Call right after the
   *  wood's own `renderer.render`. */
  render(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void
  /** The angle the bar is currently turned to, radians. */
  steerAngle(): number
}

/** How big it appears: 1 is a real bicycle's own size. A bit under, so the
 *  front wheel still shows in the lower part of the view instead of falling out
 *  of the bottom of it. */
const VIEW_SCALE = 0.75
/** Where the bar's middle sits in the camera's own frame: centred, low, a
 *  little ahead of the eye. Higher than a rider's real bar, and the whole front
 *  end tipped up (`VIEW_TILT`), so the wheel — 0.6 m below the bar — comes up
 *  into the frame instead of sitting under its bottom edge: the wheel is the part
 *  that turns, and it has to be seen. */
const BAR_IN_VIEW = new THREE.Vector3(0, -0.09, -0.62)
/** How far the front end is tipped up about the bar, radians. */
const VIEW_TILT = 0.62
/** The bar's own position in the model (see `buildBikeModel`). */
const BAR_IN_MODEL = new THREE.Vector3(0.31, 0.92, 0)

export function createBikeView(worldScene: THREE.Scene): BikeView {
  const scene = new THREE.Scene()
  const group = new THREE.Group()
  group.name = 'bikeView'
  scene.add(group)

  const hemi = new THREE.HemisphereLight(0xffffff, 0x555555, 1)
  const sun = new THREE.DirectionalLight(0xffffff, 1)
  scene.add(hemi, sun)
  // The wood's own, found once: `game/scene.ts` builds exactly one of each.
  let worldHemi: THREE.HemisphereLight | undefined
  let worldSun: THREE.DirectionalLight | undefined
  worldScene.traverse((o) => {
    if (o instanceof THREE.HemisphereLight && !worldHemi) worldHemi = o
    else if (o instanceof THREE.DirectionalLight && !worldSun) worldSun = o
  })

  const cockpit = buildBikeCockpitModel()
  // The model faces +x; the camera looks down -z.
  const mount = new THREE.Group()
  mount.rotation.y = Math.PI / 2
  mount.scale.setScalar(VIEW_SCALE)
  // Where the model's origin has to go for its bar to sit on the tilt's pivot:
  // the bar's own offset, scaled and turned the way the model is, subtracted.
  const barOffset = BAR_IN_MODEL.clone().multiplyScalar(VIEW_SCALE).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
  mount.position.copy(barOffset).negate()
  mount.add(cockpit.group)
  // Pivoting at the bar, so tipping the front end up leaves the bar where it is.
  const tilt = new THREE.Group()
  tilt.position.copy(BAR_IN_VIEW)
  tilt.rotation.x = VIEW_TILT
  tilt.add(mount)
  group.add(tilt)

  let visible = false
  group.visible = false
  let steer = 0
  let wheelAngle = 0
  let lastYaw: number | null = null

  return {
    group,
    setVisible(on) {
      visible = on
      group.visible = on
      if (!on) {
        steer = 0
        lastYaw = null
        cockpit.steer(0)
      }
    },
    isVisible: () => visible,
    update(dt, yaw, camera, forwardSpeed = 0) {
      if (!visible) return
      group.position.copy(camera.position)
      group.quaternion.copy(camera.quaternion)
      // A first frame (or one after a pause) has no turn to speak of.
      const rate = lastYaw === null || dt <= 0 ? 0 : (yaw - lastYaw) / dt
      lastYaw = yaw
      steer = smoothSteer(steer, steerTarget(rate), dt)
      cockpit.steer(steer)
      // Kept within a half turn either way, so a long ride never loses precision.
      wheelAngle = wheelSpin(wheelAngle, forwardSpeed, dt)
      wheelAngle = Math.atan2(Math.sin(wheelAngle), Math.cos(wheelAngle))
      cockpit.spin(wheelAngle)
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
      if (!visible) return
      const autoClear = renderer.autoClear
      renderer.autoClear = false
      renderer.clearDepth()
      renderer.render(scene, camera)
      renderer.autoClear = autoClear
    },
    steerAngle: () => steer,
  }
}
