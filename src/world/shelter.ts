import * as THREE from 'three'
import { findOpenSpot, type Circle } from '../util/openSpot'
import { mulberry32 } from '../util/rng'
import type { ElevationProvider } from '../terrain/provider'

export interface Shelter {
  x: number
  z: number
  y: number
  rotationY: number
}

/** How far the hut needs from anything already standing, metres — wider than
 *  a player needs, since a structure is bigger than one pair of shoulders. */
const SHELTER_CLEARANCE = 2.5
/** Its own footprint, for other things (including the player) to avoid. */
const SHELTER_RADIUS = 1.8

/**
 * Sites the wood's one shelter — a hut, not a decoration. It exists to be
 * rare: the same `findOpenSpot` search that keeps the player out of trunks
 * (game/startPose.ts), given more room to ask for, finds it a clearing of its
 * own. Placed once per wood, so it reads as something you came upon rather
 * than something scattered like a tree.
 */
export function placeShelter(
  ground: ElevationProvider,
  halfSize: number,
  seed: number,
  obstacles: Circle[],
): Shelter {
  const rng = mulberry32(seed)
  // The search starts from a seed-chosen point, not always the world centre —
  // otherwise an open wood with nothing crowding it would plant the hut dead
  // centre every single time, seed or no seed.
  const origin = { x: (rng() * 2 - 1) * halfSize * 0.5, z: (rng() * 2 - 1) * halfSize * 0.5 }
  const { x, z } = findOpenSpot(obstacles, halfSize, origin, SHELTER_CLEARANCE)
  const rotationY = rng() * Math.PI * 2
  return { x, z, y: ground.heightAt(x, z), rotationY }
}

/** The shelter's own collision footprint — nobody walks through the wall. */
export function shelterObstacle(s: Shelter): Circle {
  return { x: s.x, z: s.z, radius: SHELTER_RADIUS }
}

export interface ShelterFx {
  group: THREE.Group
  /** 0 by day, 1 at full night — drives the window glow and its light. */
  setNight(t: number): void
  /** Drifts the chimney smoke upward and loops it — call every frame. */
  update(dt: number): void
}

/**
 * A small log cabin: a box for the walls, a four-sided pyramid for the roof,
 * plus the details a box on its own never reads as a dwelling without — a
 * door, two windows, a chimney with its own wisp of smoke, and a window glow
 * that only makes sense now that the wood has a day and a night
 * (world/daynight.ts, v0.16.0). One of everything, so none of it needs
 * instancing the way a hundred trees would.
 */
export function buildShelterMesh(s: Shelter): ShelterFx {
  const group = new THREE.Group()
  group.name = 'shelter'

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x5a4429, roughness: 1 })
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3c2f1c, roughness: 1 })

  const width = 2.6
  const depth = 2.2
  const wallHeight = 1.7

  // Log-course ripple: a plain box reads as smooth siding, not stacked logs.
  // A deterministic sine along each vertex's own normal is enough — one hut
  // per wood needs no per-instance variety, just enough texture to stop
  // reading as a clean architectural box.
  const wallGeo = new THREE.BoxGeometry(width, wallHeight, depth, 5, 8, 5)
  const wpos = wallGeo.attributes.position
  const wnorm = wallGeo.attributes.normal
  for (let i = 0; i < wpos.count; i++) {
    const y = wpos.getY(i)
    const nx = wnorm.getX(i)
    const ny = wnorm.getY(i)
    const nz = wnorm.getZ(i)
    const bump = 0.025 * Math.sin(y * 14 + nx * 3 + nz * 3)
    wpos.setXYZ(i, wpos.getX(i) + nx * bump, wpos.getY(i) + ny * bump * 0.2, wpos.getZ(i) + nz * bump)
  }
  wallGeo.computeVertexNormals()

  const walls = new THREE.Mesh(wallGeo, wallMat)
  walls.position.y = wallHeight / 2
  group.add(walls)

  const roofSpan = Math.hypot(width, depth) * 0.62
  const roof = new THREE.Mesh(new THREE.ConeGeometry(roofSpan, 1.1, 4), roofMat)
  roof.rotation.y = Math.PI / 4
  roof.position.y = wallHeight + 0.55
  group.add(roof)

  // The door: a darker slab set into the front face, not a hole — cheaper,
  // and a hut nobody enters has no need of an actual opening.
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x241a10, roughness: 1 })
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.25, 0.06), doorMat)
  door.position.set(0, 0.625, -depth / 2 - 0.01)
  group.add(door)

  // Two windows, one per side wall — dark by day, glowing amber once
  // setNight() says it is dark outside.
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x1c1710,
    roughness: 0.6,
    emissive: 0xffcf8a,
    emissiveIntensity: 0,
  })
  const windowGeo = new THREE.PlaneGeometry(0.45, 0.45)
  const winLeft = new THREE.Mesh(windowGeo, windowMat)
  winLeft.position.set(-width / 2 - 0.005, wallHeight * 0.58, 0)
  winLeft.rotation.y = Math.PI / 2
  group.add(winLeft)
  const winRight = new THREE.Mesh(windowGeo, windowMat)
  winRight.position.set(width / 2 + 0.005, wallHeight * 0.58, 0)
  winRight.rotation.y = -Math.PI / 2
  group.add(winRight)

  // A point light at the hearth: physically-correct falloff (three r150+)
  // means it needs tens, not units, to read from a few metres out — see the
  // same lesson the flashlight already learned (game/scene.ts).
  const hearthLight = new THREE.PointLight(0xffcf8a, 0, 5)
  hearthLight.position.set(0, wallHeight * 0.5, 0)
  group.add(hearthLight)

  const setNight = (t: number): void => {
    windowMat.emissiveIntensity = t * 2.2
    hearthLight.intensity = t * 18
  }

  // The chimney and its smoke, both offset toward one corner of the roof —
  // centring it over the ridge would look planted, not built.
  const chimneyMat = new THREE.MeshStandardMaterial({ color: 0x4a4a48, roughness: 1 })
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.26), chimneyMat)
  const chimneyTop = new THREE.Vector3(width * 0.22, wallHeight + 1.05, depth * 0.15)
  chimney.position.copy(chimneyTop).setY(wallHeight + 0.7)
  group.add(chimney)

  const SMOKE_N = 5
  const smokeMat = new THREE.SpriteMaterial({ color: 0xcfcfcf, transparent: true, opacity: 0, depthWrite: false })
  const smoke: THREE.Sprite[] = []
  for (let i = 0; i < SMOKE_N; i++) {
    const sprite = new THREE.Sprite(smokeMat.clone())
    sprite.userData.phase = i / SMOKE_N
    sprite.scale.setScalar(0.001)
    group.add(sprite)
    smoke.push(sprite)
  }

  let elapsed = 0
  const update = (dt: number): void => {
    elapsed += dt
    for (const sprite of smoke) {
      // Each wisp loops through 0..1 offset by its own phase, so the chimney
      // never puffs all five at once.
      const t = (elapsed * 0.12 + sprite.userData.phase) % 1
      sprite.position.set(
        chimneyTop.x + Math.sin(t * Math.PI * 2 + sprite.userData.phase * 7) * 0.08,
        chimneyTop.y + t * 1.4,
        chimneyTop.z + Math.cos(t * Math.PI * 2 + sprite.userData.phase * 5) * 0.08,
      )
      sprite.scale.setScalar(0.15 + t * 0.4)
      ;(sprite.material as THREE.SpriteMaterial).opacity = 0.3 * (1 - t)
    }
  }

  group.position.set(s.x, s.y, s.z)
  group.rotation.y = s.rotationY
  return { group, setNight, update }
}
