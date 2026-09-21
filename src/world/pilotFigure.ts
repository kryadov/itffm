import * as THREE from 'three'

/**
 * The player, seen from outside: a little person standing on the ground with a
 * controller in their hands, while the quadcopter flies. The player is never
 * drawn otherwise (the camera is their own eyes), so this exists only to be
 * shown during a flight, when the camera is the drone's.
 *
 * Built standing on y = 0, facing -z (the way the player faces at yaw 0), about
 * 1.75 m tall. Flat primitives, like everything else here.
 */

const SKIN = 0xd9a88a
const TROUSERS = 0x2f3a4f
const BOOTS = 0x2a221c
const JACKET = 0x4f6b3a
const PACK = 0x6b4a2c
const CAP = 0xc0532e
const DEVICE = 0x22252a

/** How fast the body turns to face the drone, radians a second. */
const TURN_RATE = 3.2
/** How fast the head follows, per second. */
const HEAD_EASE = 8

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a))

export function buildPilotFigure(): {
  group: THREE.Group
  /** Turns the figure to face `target` (world space) and tilts its head up at it. */
  update: (dt: number, target: THREE.Vector3) => void
  dispose: () => void
} {
  const group = new THREE.Group()
  group.name = 'pilot'
  const mat = (color: number, rough = 0.85): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ color, roughness: rough })
  const put = (mesh: THREE.Mesh, name: string, x: number, y: number, z: number): THREE.Mesh => {
    mesh.name = name
    mesh.position.set(x, y, z)
    group.add(mesh)
    return mesh
  }

  // Legs and boots, a little apart, as a person stands.
  for (const side of [-1, 1]) {
    put(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.72, 0.2), mat(TROUSERS)), 'leg', side * 0.1, 0.5, 0)
    put(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.32), mat(BOOTS)), 'boot', side * 0.1, 0.07, -0.05)
  }
  // Body and a small pack on the back (+z).
  put(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.6, 0.26), mat(JACKET)), 'torso', 0, 1.14, 0)
  put(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.14), mat(PACK)), 'pack', 0, 1.18, 0.2)

  // Arms held out in front, elbows bent, hands together at the chest.
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.42), mat(JACKET))
    arm.rotation.x = 0.18
    arm.rotation.y = -side * 0.3
    put(arm, 'arm', side * 0.25, 1.22, -0.18)
    put(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(SKIN)), 'hand', side * 0.13, 1.2, -0.36)
  }

  // The controller: a slab between the hands, with two short sticks and an antenna.
  const controller = new THREE.Group()
  controller.name = 'controller'
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.12), mat(DEVICE, 0.5))
  controller.add(body)
  for (const side of [-1, 1]) {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6), mat(0x9aa0a8, 0.4))
    stick.position.set(side * 0.07, 0.04, 0.01)
    controller.add(stick)
  }
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6), mat(DEVICE, 0.5))
  antenna.position.set(0.1, 0.09, -0.05)
  antenna.rotation.x = -0.35
  controller.add(antenna)
  controller.position.set(0, 1.19, -0.4)
  group.add(controller)

  // Head on a neck pivot, so it can look up at the drone.
  const headPivot = new THREE.Group()
  headPivot.name = 'head'
  headPivot.position.set(0, 1.5, 0)
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10), mat(SKIN))
  skull.position.y = 0.11
  headPivot.add(skull)
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(CAP))
  cap.name = 'cap'
  cap.position.y = 0.14
  headPivot.add(cap)
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.13), mat(CAP))
  brim.position.set(0, 0.145, -0.13)
  headPivot.add(brim)
  group.add(headPivot)

  const update = (dt: number, target: THREE.Vector3): void => {
    const dx = target.x - group.position.x
    const dz = target.z - group.position.z
    const horizontal = Math.hypot(dx, dz)
    // Straight overhead there is no direction to turn to: keep facing where it is.
    if (horizontal > 0.5) {
      const wantYaw = Math.atan2(-dx, -dz) // the forward vector at yaw θ is (-sin θ, -cos θ)
      const diff = wrap(wantYaw - group.rotation.y)
      const step = Math.sign(diff) * Math.min(Math.abs(diff), TURN_RATE * dt)
      group.rotation.y = wrap(group.rotation.y + step)
    }
    const dy = target.y - (group.position.y + 1.6)
    const wantPitch = Math.max(-0.3, Math.min(1.2, Math.atan2(dy, Math.max(horizontal, 0.5))))
    headPivot.rotation.x += (wantPitch - headPivot.rotation.x) * (1 - Math.exp(-HEAD_EASE * dt))
  }

  const dispose = (): void => {
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose()
        const m = o.material
        if (!Array.isArray(m)) m.dispose()
      }
    })
  }
  return { group, update, dispose }
}

/**
 * A tall slim pole with a flag on top, standing where the pilot stands and
 * reaching above the tallest tree: seen from over the canopy, where the pilot
 * themself is hidden, it says where home is. Unlit, so it shows in any light.
 */
export function buildPilotBeacon(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'pilotBeacon'
  const height = 40
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, height, 6), new THREE.MeshBasicMaterial({ color: 0xff8a2a }),
  )
  pole.name = 'pole'
  pole.position.y = height / 2
  group.add(pole)
  const flag = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.6), new THREE.MeshBasicMaterial({ color: 0xffd23a }),
  )
  flag.name = 'flag'
  flag.position.y = height + 0.3
  group.add(flag)
  return group
}
