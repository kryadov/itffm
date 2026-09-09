import * as THREE from 'three'
import { findOpenSpot, type Circle } from '../util/openSpot'
import { mulberry32 } from '../util/rng'
import { isClearing } from './clearings'
import { smokeOffset, smokeScale, smokeOpacity } from './smoke'
import type { ElevationProvider } from '../terrain/provider'
import type { Vec2 } from '../geo/types'

export interface Campfire {
  x: number
  z: number
  y: number
  rotationY: number
}

/** How far the fire needs from anything already standing, metres — much
 *  less than the shelter's own (world/shelter.ts's SHELTER_CLEARANCE): a
 *  fire ring and a bench need room to sit around, not a building's footprint. */
const CAMPFIRE_CLEARANCE = 2
/** Its own footprint, for other things (including the player) to avoid. */
const CAMPFIRE_RADIUS = 1.3

/**
 * Sites the wood's one campfire — deliberately apart from the shelter (a
 * live request, 2026-09-09: "не у дома, а на поляне в другой части
 * локации"), and on an actual clearing (`world/clearings.ts`'s `isClearing`)
 * rather than just open ground, so it reads as a place people gather, not a
 * gap the search happened to fill.
 */
export function placeCampfire(
  ground: ElevationProvider,
  halfSize: number,
  seed: number,
  obstacles: Circle[],
  shelter: Vec2,
): Campfire {
  const rng = mulberry32(seed)
  // Biased toward the opposite side of the plot from the shelter, with
  // jitter so it is not dead-on opposite every single wood.
  const away = { x: -shelter.x, z: -shelter.z }
  const mag = Math.hypot(away.x, away.z)
  const dir = mag > 1e-3 ? { x: away.x / mag, z: away.z / mag } : { x: 1, z: 0 }
  const dist = halfSize * (0.35 + rng() * 0.35)
  const jitter = halfSize * 0.25
  const clamp = (v: number): number => Math.max(-halfSize, Math.min(halfSize, v))
  const origin = { x: clamp(dir.x * dist + (rng() * 2 - 1) * jitter), z: clamp(dir.z * dist + (rng() * 2 - 1) * jitter) }

  const { x, z } = findOpenSpot(obstacles, halfSize, origin, CAMPFIRE_CLEARANCE, (px, pz) => isClearing(px, pz, seed))
  const rotationY = rng() * Math.PI * 2
  return { x, z, y: ground.heightAt(x, z), rotationY }
}

/** The campfire's own collision footprint — nobody walks through the ring
 *  or the bench. */
export function campfireObstacle(c: Campfire): Circle {
  return { x: c.x, z: c.z, radius: CAMPFIRE_RADIUS }
}

export interface CampfireFx {
  group: THREE.Group
  /** Drifts the smoke and flickers the embers — call every frame. */
  update(dt: number): void
}

/** White-yellow-red, the coldest-to-hottest-reading embers a fire pit shows
 *  at once — a live request (2026-09-09) asked for exactly this palette. */
const EMBER_COLORS = [0xfff2c0, 0xffb347, 0xff5a2a, 0xd93a1f]

/**
 * A ring of stones around a bed of charred logs and glowing embers, a
 * tripod with a pot hung over it, and a plank bench to sit on — a second
 * everyday fixture in the wood besides the shelter, sited apart from it on
 * its own clearing (see `placeCampfire`).
 */
export function buildCampfireMesh(c: Campfire): CampfireFx {
  const group = new THREE.Group()
  group.name = 'campfire'

  // The ring: small stones, not the full ragged-boulder treatment
  // (world/boulders.ts) — a background detail here, not a focal shape.
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x83807a, roughness: 1 })
  const ringRadius = 0.5
  const stoneCount = 8
  for (let i = 0; i < stoneCount; i++) {
    const a = (i / stoneCount) * Math.PI * 2
    const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09 + (i % 3) * 0.015, 0), stoneMat)
    stone.position.set(Math.cos(a) * ringRadius, 0.06, Math.sin(a) * ringRadius)
    stone.rotation.set(a, a * 1.3, 0)
    group.add(stone)
  }

  // Charred logs, crossed at the centre like a real laid fire.
  const charredMat = new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 1 })
  const logGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.65, 6)
  for (const rot of [0.5, -0.5, 1.6]) {
    const log = new THREE.Mesh(logGeo, charredMat)
    log.rotation.set(Math.PI / 2, 0, rot)
    log.position.y = 0.05
    group.add(log)
  }

  // Embers: a loose pile of small glowing chunks, white through red — the
  // fire's actual light source, not just colour, so it reads lit even
  // without the point light below carrying the whole effect.
  const emberGeo = new THREE.IcosahedronGeometry(0.05, 0)
  const embers: THREE.Mesh[] = []
  for (let i = 0; i < 10; i++) {
    const color = EMBER_COLORS[i % EMBER_COLORS.length]
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 1 })
    const ember = new THREE.Mesh(emberGeo, mat)
    const a = (i / 10) * Math.PI * 2
    const r = 0.08 + (i % 3) * 0.04
    ember.position.set(Math.cos(a) * r, 0.08 + (i % 2) * 0.03, Math.sin(a) * r)
    group.add(ember)
    embers.push(ember)
  }

  // A warm light at the embers — physically-correct falloff (three r150+)
  // needs tens, not units, to read from a few metres out (same lesson as
  // world/shelter.ts's hearth light and game/scene.ts's flashlight).
  const fireLight = new THREE.PointLight(0xff9a4a, 14, 6)
  fireLight.position.set(0, 0.15, 0)
  group.add(fireLight)

  // A tripod over the fire, and a pot hanging from it.
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3a22, roughness: 1 })
  const apex = new THREE.Vector3(0, 0.95, 0)
  const legGeo = new THREE.CylinderGeometry(0.02, 0.02, 1, 6)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    const base = new THREE.Vector3(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42)
    const mid = base.clone().add(apex).multiplyScalar(0.5)
    const leg = new THREE.Mesh(legGeo, woodMat)
    leg.position.copy(mid)
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), apex.clone().sub(base).normalize())
    leg.scale.y = apex.distanceTo(base)
    group.add(leg)
  }
  const potMat = new THREE.MeshStandardMaterial({ color: 0x2c2c2e, roughness: 0.5, metalness: 0.4 })
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.2, 12), potMat)
  pot.position.set(0, apex.y - 0.28, 0)
  group.add(pot)
  const hookGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.14, 5)
  const hook = new THREE.Mesh(hookGeo, woodMat)
  hook.position.set(0, apex.y - 0.07, 0)
  group.add(hook)

  // A plank bench to sit at, facing the fire.
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x5a4530, roughness: 1 })
  const bench = new THREE.Group()
  bench.name = 'bench'
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.3), benchMat)
  seat.position.y = 0.4
  bench.add(seat)
  const legGeoBench = new THREE.BoxGeometry(0.06, 0.4, 0.06)
  for (const lx of [-0.45, 0.45]) {
    const leg = new THREE.Mesh(legGeoBench, benchMat)
    leg.position.set(lx, 0.2, 0)
    bench.add(leg)
  }
  bench.position.set(0, 0, ringRadius + 0.8)
  bench.rotation.y = Math.PI // face the fire
  group.add(bench)

  const smokeMat = new THREE.SpriteMaterial({ color: 0xb8b8b0, transparent: true, opacity: 0, depthWrite: false })
  const SMOKE_N = 4
  const smoke: THREE.Sprite[] = []
  for (let i = 0; i < SMOKE_N; i++) {
    const sprite = new THREE.Sprite(smokeMat.clone())
    sprite.userData.phase = i / SMOKE_N
    sprite.position.y = 0.15
    group.add(sprite)
    smoke.push(sprite)
  }

  let elapsed = 0
  const update = (dt: number): void => {
    elapsed += dt
    for (const sprite of smoke) {
      const t = (elapsed * 0.15 + sprite.userData.phase) % 1
      const off = smokeOffset(t, sprite.userData.phase)
      sprite.position.set(off.x, 0.15 + off.y, off.z)
      sprite.scale.setScalar(smokeScale(t))
      ;(sprite.material as THREE.SpriteMaterial).opacity = 0.4 * smokeOpacity(t)
    }
    // A gentle two-frequency flicker — deterministic (no Math.random, see
    // CLAUDE.md's Conventions), reads as a live fire rather than a mechanical
    // pulse because the two periods drift in and out of phase with each other.
    fireLight.intensity = 14 + Math.sin(elapsed * 11) * 3 + Math.sin(elapsed * 3.7) * 2
    for (let i = 0; i < embers.length; i++) {
      const mat = embers[i].material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 1.2 + Math.sin(elapsed * 9 + i * 1.7) * 0.4
    }
  }

  group.position.set(c.x, c.y, c.z)
  group.rotation.y = c.rotationY
  return { group, update }
}
