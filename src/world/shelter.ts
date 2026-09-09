import * as THREE from 'three'
import { findOpenSpot, type Circle } from '../util/openSpot'
import { mulberry32 } from '../util/rng'
import type { ElevationProvider } from '../terrain/provider'
import type { Vec2 } from '../geo/types'

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
 *
 * A real survey position (`mapped`, from `geo/parse.ts`'s `isShelterTag`)
 * always wins over the procedural search, the same rule `world/osmTrees.ts`
 * already follows for mapped trees: a surveyor finding an actual hut in this
 * wood outranks our own guess at where a clearing ought to be. Orientation is
 * still seeded, since OSM tagging essentially never records which way a hut
 * faces.
 */
export function placeShelter(
  ground: ElevationProvider,
  halfSize: number,
  seed: number,
  obstacles: Circle[],
  mapped: Vec2[] = [],
): Shelter {
  const rng = mulberry32(seed)
  const real = mapped.find((m) => Math.abs(m.x) <= halfSize && Math.abs(m.z) <= halfSize)
  let x: number
  let z: number
  if (real) {
    x = real.x
    z = real.z
  } else {
    // The search starts from a seed-chosen point, not always the world centre
    // — otherwise an open wood with nothing crowding it would plant the hut
    // dead centre every single time, seed or no seed.
    const origin = { x: (rng() * 2 - 1) * halfSize * 0.5, z: (rng() * 2 - 1) * halfSize * 0.5 }
    ;({ x, z } = findOpenSpot(obstacles, halfSize, origin, SHELTER_CLEARANCE))
  }
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

  // A plain box: an earlier attempt at a log-course ripple displaced each
  // face's vertices along that face's own normal, which at any corner points
  // two adjacent faces in different directions — pulling them apart and
  // opening a real gap letting the background show through the seam. Fixing
  // that properly needs vertices that fade to zero displacement right at the
  // edge, which needs more subdivision than a one-off hut earns; a flat wall
  // reads as plain, not broken, and broken is worse.
  const walls = new THREE.Mesh(new THREE.BoxGeometry(width, wallHeight, depth), wallMat)
  walls.position.y = wallHeight / 2
  // The hearth light below sits inside this box. Without shadow casting a
  // three.js PointLight ignores geometry entirely and lights the ground
  // through the floor and walls alike — visible at night as a warm glow
  // leaking out from under the hut, nowhere near a window (2026-09-09 live
  // report). One light and one solid box is cheap enough to shadow properly
  // instead of just dimming the light and hoping the leak stays unnoticed.
  walls.castShadow = true
  walls.receiveShadow = true
  group.add(walls)

  const roofSpan = Math.hypot(width, depth) * 0.62
  const roof = new THREE.Mesh(new THREE.ConeGeometry(roofSpan, 1.1, 4), roofMat)
  roof.rotation.y = Math.PI / 4
  roof.position.y = wallHeight + 0.55
  group.add(roof)

  // The door: a plank slab set into the front face, not a hole — cheaper,
  // and a hut nobody enters has no need of an actual opening. Two darker
  // grooves mark it as individual planks rather than one flat monolith, and
  // a small round handle is what actually reads as "door" at a glance —
  // without it the slab alone is easy to mistake for a shadow or a stain.
  const doorGroup = new THREE.Group()
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 1 })
  const doorFace = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.25, 0.06), doorMat)
  doorGroup.add(doorFace)
  const grooveMat = new THREE.MeshStandardMaterial({ color: 0x1f150c, roughness: 1 })
  for (const gx of [-0.17, 0.17]) {
    const groove = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.2, 0.01), grooveMat)
    groove.position.set(gx, 0, 0.035)
    doorGroup.add(groove)
  }
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.4, metalness: 0.3 })
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), handleMat)
  handle.position.set(0.24, -0.05, 0.05)
  doorGroup.add(handle)
  doorGroup.position.set(0, 0.625, -depth / 2 - 0.08)
  group.add(doorGroup)

  // Two windows, one per side wall — a pale, faintly blue "glass" pane on a
  // darker wooden frame, so it reads as a window by day (not just a same-
  // colour patch on the wall) and glows amber once setNight() says it is
  // dark outside. DoubleSide on both: a PlaneGeometry only has one true
  // front face, and getting each window's own rotation to point that face
  // outward by hand is exactly the kind of sign error that had a window
  // invisible from outside the hut and fine from in.
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a1f14, roughness: 1, side: THREE.DoubleSide })
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x8fa8ac,
    roughness: 0.3,
    emissive: 0xffcf8a,
    emissiveIntensity: 0,
    side: THREE.DoubleSide,
  })
  const frameGeo = new THREE.PlaneGeometry(0.5, 0.5)
  const glassGeo = new THREE.PlaneGeometry(0.38, 0.38)
  // A cross-shaped muntin bar over the glass — real boxes, not planes, so
  // they read as wood from every angle without the same one-sided-plane
  // trap the glass itself already ran into once. A flat frame with plain
  // glass behind it (the original shape) never stopped looking like one
  // pale, borderless patch on the wall — a real cottage window is panes
  // separated by a bar, and that bar is most of what the eye recognises.
  const muntinMat = frameMat
  const muntinThickness = 0.028
  const vMuntinGeo = new THREE.BoxGeometry(muntinThickness, 0.4, 0.03)
  const hMuntinGeo = new THREE.BoxGeometry(0.4, muntinThickness, 0.03)
  const buildWindow = (x: number, faceOut: number): THREE.Group => {
    const win = new THREE.Group()
    const frame = new THREE.Mesh(frameGeo, frameMat)
    win.add(frame)
    // Two glass panes, one just in front of the frame each way (+Z and -Z),
    // not one — a single pane offset only toward +Z sat behind the frame
    // (which is bigger than the glass, so fully covers it) as seen from
    // whichever side turned out to be -Z, which is exactly what made a
    // window look like solid wall from outside and fine from in.
    for (const dz of [0.006, -0.006]) {
      const glass = new THREE.Mesh(glassGeo, glassMat)
      glass.name = 'glass'
      glass.position.z = dz
      win.add(glass)
    }
    win.add(new THREE.Mesh(vMuntinGeo, muntinMat))
    win.add(new THREE.Mesh(hMuntinGeo, muntinMat))
    win.position.set(x, wallHeight * 0.58, 0)
    win.rotation.y = faceOut
    return win
  }
  // Same clearance reasoning as the door: has to clear the log-course bump.
  const winLeft = buildWindow(-width / 2 - 0.08, Math.PI / 2)
  const winRight = buildWindow(width / 2 + 0.08, -Math.PI / 2)
  group.add(winLeft, winRight)

  // A point light at the hearth: physically-correct falloff (three r150+)
  // means it needs tens, not units, to read from a few metres out — see the
  // same lesson the flashlight already learned (game/scene.ts).
  const hearthLight = new THREE.PointLight(0xffcf8a, 0, 5)
  hearthLight.position.set(0, wallHeight * 0.5, 0)
  hearthLight.castShadow = true
  // A cube shadow map this small only has to hide one box from itself —
  // nowhere near what a scene-wide light would need.
  hearthLight.shadow.mapSize.set(256, 256)
  hearthLight.shadow.bias = -0.002
  group.add(hearthLight)

  const setNight = (t: number): void => {
    glassMat.emissiveIntensity = t * 2.2
    hearthLight.intensity = t * 18
  }

  // A stacked armful of firewood against one side of the hut — the wall
  // itself never explained where the hearth's own fuel comes from.
  const firewoodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 })
  const logEndMat = new THREE.MeshStandardMaterial({ color: 0xcbb384, roughness: 0.9 })
  const logRadius = 0.09
  const logLength = 0.5
  const logGeo = new THREE.CylinderGeometry(logRadius, logRadius, logLength, 8)
  const logEndGeo = new THREE.CircleGeometry(logRadius, 8)
  const firewood = new THREE.Group()
  firewood.name = 'firewood'
  const firewoodRows = [4, 3]
  for (let row = 0; row < firewoodRows.length; row++) {
    const count = firewoodRows[row]
    const offset = (count - 1) / 2
    const y = logRadius + row * logRadius * 2
    for (let i = 0; i < count; i++) {
      const log = new THREE.Mesh(logGeo, firewoodMat)
      log.rotation.z = Math.PI / 2
      log.position.set((i - offset) * (logRadius * 2 + 0.015), y, 0)
      firewood.add(log)
      // The cylinder's own caps carry the trunk colour; a paler disc facing
      // the viewer is what actually reads as "cut log end" from outside.
      const endCap = new THREE.Mesh(logEndGeo, logEndMat)
      endCap.rotation.y = Math.PI / 2
      endCap.position.set(log.position.x + logLength / 2 + 0.001, y, 0)
      firewood.add(endCap)
    }
  }
  firewood.position.set(width / 2 + 0.45, 0, depth / 2 - 0.3)
  group.add(firewood)

  // A small well: a stone-ringed shaft, a crossbeam on two posts, and a
  // bucket hanging from it — the other everyday fixture a lived-in
  // clearing has next to a hearth, not just a place to sleep.
  const wellStoneMat = new THREE.MeshStandardMaterial({ color: 0x8a8a82, roughness: 1 })
  const wellWoodMat = new THREE.MeshStandardMaterial({ color: 0x4a3a22, roughness: 1 })
  const bucketMat = new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.6, metalness: 0.15 })
  const well = new THREE.Group()
  well.name = 'well'
  const wellRadius = 0.42
  const wellWallHeight = 0.32
  // Open-ended — a capped cylinder would read as a solid stone drum, not a
  // shaft with anything down it.
  const wellWall = new THREE.Mesh(
    new THREE.CylinderGeometry(wellRadius, wellRadius, wellWallHeight, 12, 1, true),
    wellStoneMat,
  )
  wellWall.position.y = wellWallHeight / 2
  well.add(wellWall)
  const postHeight = 0.85
  const postGeo = new THREE.BoxGeometry(0.06, postHeight, 0.06)
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, wellWoodMat)
    post.position.set(0, postHeight / 2, side * wellRadius * 0.85)
    well.add(post)
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, wellRadius * 2.1), wellWoodMat)
  beam.position.set(0, postHeight, 0)
  well.add(beam)
  const wellRoof = new THREE.Mesh(new THREE.ConeGeometry(wellRadius * 0.95, 0.32, 4), roofMat)
  wellRoof.rotation.y = Math.PI / 4
  wellRoof.position.set(0, postHeight + 0.18, 0)
  well.add(wellRoof)
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.32, 6), wellWoodMat)
  rope.position.set(0, postHeight - 0.16, 0)
  well.add(rope)
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.16, 10), bucketMat)
  bucket.position.set(0, postHeight - 0.32 - 0.08, 0)
  well.add(bucket)
  well.position.set(-(width / 2 + 1.3), 0, -(depth / 2 + 1.4))
  group.add(well)

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
