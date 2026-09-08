import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

/** Sits just above the sampled bed, so it reads as water rather than mud. */
const WATER_OFFSET = 0.15
/** How far the skirt around the shore hangs below the surface, metres — a
 *  flat surface over a sloping bank would otherwise float clear of the
 *  ground at the shoreline, showing daylight under the water's edge. */
const SKIRT_DROP = 1.2
/** A ring at least this many times longer than it is wide reads as a channel
 *  rather than a body of standing water — used only when the ring does not
 *  already close on itself (see `classifyWater`). */
const STREAM_ASPECT = 3
/** How wide a mapped stream reads on screen, metres — real width varies far
 *  more than a demo wood's OSM data ever specifies, so this is a fixed,
 *  modest brook rather than a guess at any one real channel. */
const STREAM_WIDTH = 1.2
/** Horizontal drop a stream must make between two consecutive points to read
 *  as a waterfall rather than an ordinary sloped run. */
const WATERFALL_DROP = 1.4
const SPRING_RADIUS = 0.35
const SPRING_OFFSET_MIN = 2
const SPRING_OFFSET_MAX = 6

export type WaterKind = 'pond' | 'stream'

/**
 * A pond polygon, whether OSM's or the demo wood's, is roughly as wide as it
 * is long and (when it comes from OSM) closes on itself: its last node
 * repeats its first. A river or stream way is a line, not an area — long
 * and thin, and not closed at all. Neither test alone is reliable across
 * both sources, so a ring closed on itself is a pond outright, and anything
 * else falls back to its own aspect ratio; no separate tag has to survive
 * the trip through `WorldData`.
 */
export function classifyWater(ring: Vec2[]): WaterKind {
  if (ring.length < 2) return 'pond'
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (Math.hypot(last.x - first.x, last.z - first.z) < 1e-6) return 'pond'

  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const p of ring) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minZ = Math.min(minZ, p.z)
    maxZ = Math.max(maxZ, p.z)
  }
  const long = Math.max(maxX - minX, maxZ - minZ)
  const short = Math.max(1e-6, Math.min(maxX - minX, maxZ - minZ))
  return long / short >= STREAM_ASPECT ? 'stream' : 'pond'
}

/**
 * The level to float a body of water at: a low point of the ground actually
 * inside its outline, not the outline's own lowest vertex — an outline can
 * run past the plot entirely, and its lowest point be nowhere near here.
 *
 * Simplified from race-the-city's world/water.ts `waterLevel`: that one
 * samples a whole city-sized map and takes a low quantile of the bed to
 * shrug off one stray DEM artefact. A wood's water body is small enough
 * (well under the plot itself) that its own ring vertices are already a
 * fair sample of the bed beneath it.
 */
export function waterLevel(ring: Vec2[], ground: ElevationProvider): number {
  let low = Infinity
  for (const p of ring) low = Math.min(low, ground.heightAt(p.x, p.z))
  return (Number.isFinite(low) ? low : 0) + WATER_OFFSET
}

/**
 * The steepest drop along a stream's own line, if any segment falls further
 * than a rapid — that segment is where a waterfall belongs. Picks the worst
 * one rather than the first: a stream can cross rough ground more than once,
 * and only the biggest fall reads as a waterfall rather than white water.
 */
export function findWaterfall(
  ring: Vec2[],
  ground: ElevationProvider,
): { a: Vec2; b: Vec2; drop: number } | null {
  let best: { a: Vec2; b: Vec2; drop: number } | null = null
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]
    const b = ring[i + 1]
    const drop = ground.heightAt(a.x, a.z) - ground.heightAt(b.x, b.z)
    if (drop >= WATERFALL_DROP && (!best || drop > best.drop)) best = { a, b, drop }
  }
  return best
}

/**
 * A thin ribbon that follows the ground's own slope point by point, instead
 * of one flat plane — a pond can be flat because it is still, but a stream
 * runs downhill along the same bed it sits in. The ripple in `update` is a
 * per-vertex sine along the channel's own length, not a scrolling texture:
 * runtime deps stop at three and yaml (see CLAUDE.md), so there is no map to
 * scroll.
 */
function buildStreamMesh(
  ring: Vec2[],
  ground: ElevationProvider,
): { mesh: THREE.Mesh; update: (t: number) => void } {
  const half = STREAM_WIDTH / 2
  const positions: number[] = []
  const bases: number[] = []
  const along: number[] = []
  let dist = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const p = ring[i]
    const q = ring[i + 1]
    const dx = q.x - p.x
    const dz = q.z - p.z
    const len = Math.hypot(dx, dz) || 1
    const nx = -dz / len
    const nz = dx / len
    const levelP = ground.heightAt(p.x, p.z) + WATER_OFFSET * 0.4
    const levelQ = ground.heightAt(q.x, q.z) + WATER_OFFSET * 0.4
    const p1 = [p.x + nx * half, levelP, p.z + nz * half]
    const p2 = [p.x - nx * half, levelP, p.z - nz * half]
    const q1 = [q.x + nx * half, levelQ, q.z + nz * half]
    const q2 = [q.x - nx * half, levelQ, q.z - nz * half]
    positions.push(...p1, ...q1, ...q2, ...p1, ...q2, ...p2)
    bases.push(levelP, levelQ, levelQ, levelP, levelQ, levelP)
    const distNext = dist + len
    along.push(dist, distNext, distNext, dist, distNext, dist)
    dist = distNext
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  const mat = new THREE.MeshStandardMaterial({
    color: 0x3f84c9,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geo, mat)
  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute
  const update = (t: number): void => {
    for (let i = 0; i < bases.length; i++) {
      posAttr.setY(i, bases[i] + Math.sin(along[i] * 0.8 - t * 3) * 0.03)
    }
    posAttr.needsUpdate = true
  }
  return { mesh, update }
}

/** A near-vertical sheet bridging a stream's steepest drop, standing in for
 *  spray with a slow breathing opacity rather than an actual particle system. */
function buildWaterfallMesh(
  a: Vec2,
  b: Vec2,
  drop: number,
  ground: ElevationProvider,
): { mesh: THREE.Mesh; update: (t: number) => void } {
  const top = ground.heightAt(a.x, a.z) + WATER_OFFSET
  const bottom = top - drop
  const width = Math.max(STREAM_WIDTH, drop * 0.4)
  const geo = new THREE.PlaneGeometry(width, Math.max(0.4, drop))
  const mat = new THREE.MeshStandardMaterial({
    color: 0xeaf5ff,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set((a.x + b.x) / 2, (top + bottom) / 2, (a.z + b.z) / 2)
  mesh.rotation.y = Math.atan2(b.x - a.x, b.z - a.z)
  const update = (t: number): void => {
    mat.opacity = 0.68 + Math.sin(t * 4) * 0.08
  }
  return { mesh, update }
}

export interface WaterFx {
  group: THREE.Object3D
  /** Ripples every stream and breathes every waterfall's spray — call every
   *  frame with the running clock, same convention as world/shelter.ts. */
  update(t: number): void
}

/**
 * Flat, semi-transparent polygons for every still pond, plus sloped, rippling
 * ribbons for every open channel, each floated at its own level with a skirt
 * down past the ground at the shore so the surface meets the bank instead of
 * hanging over it.
 *
 * Everything about race-the-city's own water.ts beyond the surface and the
 * skirt — the stone embankment, the waterfront railing, the quayside
 * collision walls for a car — is carriageway furniture with nothing to do
 * in a wood (see CLAUDE.md: dropped on the way, along with buildings and
 * lanes). A forest pond needs a surface players can see and use to gauge
 * where the ground stays wet; it does not need a kerb.
 */
export function buildWaterMeshes(water: Vec2[][], ground: ElevationProvider): WaterFx {
  const group = new THREE.Group()
  group.name = 'water'
  const updates: ((t: number) => void)[] = []
  if (water.length === 0) return { group, update: () => {} }

  const surfaceMat = new THREE.MeshStandardMaterial({
    color: 0x2f6db0,
    transparent: true,
    opacity: 0.86,
    side: THREE.DoubleSide,
  })
  const skirtPositions: number[] = []

  for (const ring of water) {
    if (ring.length < 3) continue

    if (classifyWater(ring) === 'stream') {
      const stream = buildStreamMesh(ring, ground)
      group.add(stream.mesh)
      updates.push(stream.update)
      const fall = findWaterfall(ring, ground)
      if (fall) {
        const waterfall = buildWaterfallMesh(fall.a, fall.b, fall.drop, ground)
        group.add(waterfall.mesh)
        updates.push(waterfall.update)
      }
      continue
    }

    const level = waterLevel(ring, ground)

    const shape = new THREE.Shape()
    shape.moveTo(ring[0].x, ring[0].z)
    for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i].x, ring[i].z)
    shape.closePath()
    const geo = new THREE.ShapeGeometry(shape)
    geo.rotateX(Math.PI / 2)
    geo.translate(0, level, 0)
    group.add(new THREE.Mesh(geo, surfaceMat))

    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      const ab = Math.min(level, ground.heightAt(a.x, a.z)) - SKIRT_DROP
      const bb = Math.min(level, ground.heightAt(b.x, b.z)) - SKIRT_DROP
      skirtPositions.push(a.x, level, a.z, b.x, level, b.z, a.x, ab, a.z)
      skirtPositions.push(b.x, level, b.z, b.x, bb, b.z, a.x, ab, a.z)
    }
  }

  if (skirtPositions.length > 0) {
    const skirtGeo = new THREE.BufferGeometry()
    skirtGeo.setAttribute('position', new THREE.Float32BufferAttribute(skirtPositions, 3))
    skirtGeo.computeVertexNormals()
    group.add(new THREE.Mesh(skirtGeo, new THREE.MeshStandardMaterial({ color: 0x2a4f63, side: THREE.DoubleSide })))
  }

  const update = (t: number): void => {
    for (const u of updates) u(t)
  }
  return { group, update }
}

/**
 * A handful of small springs scattered near existing water bodies — not on
 * the OSM river line itself, which only ever gives the main channel, but
 * offset out to either side the way a real spring feeds a pond or brook from
 * the bank rather than sitting in its bed.
 */
export function placeSprings(
  water: Vec2[][],
  halfSize: number,
  rand: () => number,
  count: number,
): Vec2[] {
  const springs: Vec2[] = []
  if (water.length === 0) return springs
  for (let i = 0; i < count; i++) {
    const ring = water[Math.floor(rand() * water.length)]
    if (!ring || ring.length === 0) continue
    const p = ring[Math.floor(rand() * ring.length)]
    const angle = rand() * Math.PI * 2
    const dist = SPRING_OFFSET_MIN + rand() * (SPRING_OFFSET_MAX - SPRING_OFFSET_MIN)
    const x = p.x + Math.cos(angle) * dist
    const z = p.z + Math.sin(angle) * dist
    if (Math.abs(x) > halfSize || Math.abs(z) > halfSize) continue
    springs.push({ x, z })
  }
  return springs
}

export interface SpringFx {
  group: THREE.Object3D
  /** Bobs each spring's little disc — call every frame with the running clock. */
  update(t: number): void
}

/** A spring is small enough that it needs no skirt or ripple mesh of its
 *  own — just a damp disc that gently swells, standing in for a bubble. */
export function buildSpringMeshes(springs: Vec2[], ground: ElevationProvider): SpringFx {
  const group = new THREE.Group()
  group.name = 'springs'
  const mat = new THREE.MeshStandardMaterial({ color: 0x4fa8e0, transparent: true, opacity: 0.85 })
  const meshes: THREE.Mesh[] = []
  for (const s of springs) {
    const geo = new THREE.CircleGeometry(SPRING_RADIUS, 16)
    geo.rotateX(-Math.PI / 2)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(s.x, ground.heightAt(s.x, s.z) + 0.03, s.z)
    group.add(mesh)
    meshes.push(mesh)
  }
  const update = (t: number): void => {
    for (let i = 0; i < meshes.length; i++) {
      const s = 1 + Math.sin(t * 2.2 + i) * 0.06
      meshes[i].scale.set(s, 1, s)
    }
  }
  return { group, update }
}
