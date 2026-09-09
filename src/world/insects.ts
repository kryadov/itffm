import * as THREE from 'three'

/**
 * Flying fauna — bees around a hive, dragonflies over water — see
 * docs/superpowers/specs/2026-09-10-wildlife-design.md. Deliberately not
 * `world/critters.ts`: a swarm circling a fixed point has no "flee the
 * player" state to share with a hare or squirrel, so it earns its own,
 * much smaller, always-in-motion model instead of a state machine with
 * unused branches.
 */
export interface SwarmAnchor {
  x: number
  y: number
  z: number
}

export interface Swarm {
  update(dt: number): void
  setEnabled(on: boolean): void
  dispose(): void
}

interface Insect {
  anchorIndex: number
  phase: number
  bobPhase: number
  bobSpeed: number
}

/**
 * A rou of `count` insects, each circling one of `anchors` (cycled if there
 * are fewer anchors than insects) on its own fixed-radius orbit with a
 * per-instance phase and a small vertical bob — a pure function of time, so
 * nothing here ever needs the player's position: this is ambient background,
 * not something that reacts.
 *
 * @param buildParts species geometry, same contract as
 *   `world/critters.ts`'s `createCritterGroup`.
 * @param pose sets one instance's matrix from its current world position —
 *   species decide their own facing/orientation from `heading` (the
 *   direction of travel around the orbit) and `time`.
 */
export function createSwarm(
  scene: THREE.Scene,
  name: string,
  rand: () => number,
  count: number,
  anchors: SwarmAnchor[],
  orbitRadius: number,
  orbitSpeed: number,
  bobAmplitude: number,
  buildParts: (mat: THREE.Material, n: number) => THREE.InstancedMesh[],
  pose: (parts: THREE.InstancedMesh[], i: number, x: number, y: number, z: number, heading: number, time: number) => void,
  color: number,
): Swarm {
  const group = new THREE.Group()
  group.name = name
  scene.add(group)

  const mat = new THREE.MeshStandardMaterial({ color, flatShading: true, side: THREE.DoubleSide })
  const n = Math.max(1, count)
  const parts = buildParts(mat, n)
  group.add(...parts)
  for (const p of parts) p.frustumCulled = false

  const insects: Insect[] = []
  for (let i = 0; i < n; i++) {
    insects.push({
      anchorIndex: anchors.length > 0 ? i % anchors.length : 0,
      phase: rand() * Math.PI * 2,
      bobPhase: rand() * Math.PI * 2,
      bobSpeed: 1.5 + rand() * 1.5,
    })
  }

  let time = 0

  return {
    setEnabled(on) {
      group.visible = on
    },
    dispose() {
      scene.remove(group)
      for (const p of parts) p.geometry.dispose()
      mat.dispose()
      insects.length = 0
    },
    update(dt) {
      time += dt
      for (let i = 0; i < n; i++) {
        const insect = insects[i]
        const a = anchors.length > 0 ? anchors[insect.anchorIndex] : { x: 0, y: 0, z: 0 }
        const angle = time * orbitSpeed + insect.phase
        const x = a.x + Math.cos(angle) * orbitRadius
        const z = a.z + Math.sin(angle) * orbitRadius
        const y = a.y + Math.sin(time * insect.bobSpeed + insect.bobPhase) * bobAmplitude
        // Tangent to the orbit — the direction of travel, so a species can
        // face the way it's actually going rather than out from the centre.
        const heading = angle + Math.PI / 2
        pose(parts, i, x, y, z, heading, time)
      }
      for (const p of parts) p.instanceMatrix.needsUpdate = true
    },
  }
}

// ---------------------------------------------------------------------------
// Species: bee and dragonfly.
// ---------------------------------------------------------------------------

const m = new THREE.Matrix4()
const q = new THREE.Quaternion()
const pos = new THREE.Vector3()
const one = new THREE.Vector3(1, 1, 1)
const yAxis = new THREE.Vector3(0, 1, 0)
const xAxis = new THREE.Vector3(1, 0, 0)
const off = new THREE.Vector3()

/** How many bees orbit the one hive, and how tight/fast that orbit is — a
 *  restless little cloud right at the hive mouth, not a wide lazy circuit. */
const BEE_ORBIT_RADIUS = 0.45
const BEE_ORBIT_SPEED = 3.2
const BEE_BOB = 0.08

function beeBodyGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(0.035, 0)
  geo.scale(1.4, 1, 1)
  return geo
}

/**
 * A small cloud of bees circling the one point `hive` — see
 * `world/hive.ts`'s `placeHive`. A single anchor, since the wood has one hive.
 */
export function createBees(scene: THREE.Scene, rand: () => number, count: number, hive: SwarmAnchor): Swarm {
  return createSwarm(
    scene,
    'bees',
    rand,
    count,
    [hive],
    BEE_ORBIT_RADIUS,
    BEE_ORBIT_SPEED,
    BEE_BOB,
    (mat, n) => [new THREE.InstancedMesh(beeBodyGeometry(), mat, n)],
    ([body], i, x, y, z, heading) => {
      q.setFromAxisAngle(yAxis, heading)
      pos.set(x, y, z)
      m.compose(pos, q, one)
      body.setMatrixAt(i, m)
    },
    0xd9a520, // amber
  )
}

const DRAGONFLY_ORBIT_RADIUS = 0.9
const DRAGONFLY_ORBIT_SPEED = 1.8
const DRAGONFLY_BOB = 0.12
/** Wing shimmer — fast enough to read as a blur, not a countable flap, the
 *  way a real dragonfly's wings do at any distance worth rendering. */
const DRAGONFLY_FLAP_SPEED = 26
const DRAGONFLY_FLAP_AMPLITUDE = 0.5

function dragonflyBodyGeometry(): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(0.015, 0.02, 0.22, 5)
  geo.rotateZ(Math.PI / 2) // lies along local +x — "forward" once heading turns it
  return geo
}

function dragonflyWingGeometry(mirror: 1 | -1): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  const tip: [number, number, number] = [0.16, 0, mirror * 0.09]
  const trail: [number, number, number] = [-0.02, 0, mirror * 0.02]
  const verts = mirror > 0 ? [0, 0, 0, ...tip, ...trail] : [0, 0, 0, ...trail, ...tip]
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3))
  geo.computeVertexNormals()
  return geo
}

/**
 * Dragonflies over water — one or more `anchors` along a pond's own edge
 * (`world/scene.ts` picks them from `classifyWater`), each with its own small
 * knot of dragonflies circling it.
 */
export function createDragonflies(scene: THREE.Scene, rand: () => number, count: number, anchors: SwarmAnchor[]): Swarm {
  return createSwarm(
    scene,
    'dragonflies',
    rand,
    count,
    anchors,
    DRAGONFLY_ORBIT_RADIUS,
    DRAGONFLY_ORBIT_SPEED,
    DRAGONFLY_BOB,
    (mat, n) => {
      const body = new THREE.InstancedMesh(dragonflyBodyGeometry(), mat, n)
      const wingL = new THREE.InstancedMesh(dragonflyWingGeometry(1), mat, n)
      const wingR = new THREE.InstancedMesh(dragonflyWingGeometry(-1), mat, n)
      return [body, wingL, wingR]
    },
    ([body, wingL, wingR], i, x, y, z, heading, time) => {
      q.setFromAxisAngle(yAxis, heading)
      pos.set(x, y, z)
      m.compose(pos, q, one)
      body.setMatrixAt(i, m)

      const flap = Math.sin(time * DRAGONFLY_FLAP_SPEED + i) * DRAGONFLY_FLAP_AMPLITUDE
      off.set(0, 0.01, 0).applyAxisAngle(yAxis, heading)
      pos.set(x + off.x, y + off.y, z + off.z)
      const qWingL = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(xAxis, flap))
      m.compose(pos, qWingL, one)
      wingL.setMatrixAt(i, m)

      const qWingR = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(xAxis, -flap))
      m.compose(pos, qWingR, one)
      wingR.setMatrixAt(i, m)
    },
    0x2f8f8f, // iridescent teal
  )
}
