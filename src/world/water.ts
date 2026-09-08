import * as THREE from 'three'
import type { Vec2 } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'

/** Sits just above the sampled bed, so it reads as water rather than mud. */
const WATER_OFFSET = 0.15
/** How far the skirt around the shore hangs below the surface, metres — a
 *  flat surface over a sloping bank would otherwise float clear of the
 *  ground at the shoreline, showing daylight under the water's edge. */
const SKIRT_DROP = 1.2

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
 * Flat, semi-transparent polygons for every water body, each floated at its
 * own level with a skirt down past the ground at the shore so the surface
 * meets the bank instead of hanging over it.
 *
 * Everything about race-the-city's own water.ts beyond the surface and the
 * skirt — the stone embankment, the waterfront railing, the quayside
 * collision walls for a car — is carriageway furniture with nothing to do
 * in a wood (see CLAUDE.md: dropped on the way, along with buildings and
 * lanes). A forest pond needs a surface players can see and use to gauge
 * where the ground stays wet; it does not need a kerb.
 */
export function buildWaterMeshes(water: Vec2[][], ground: ElevationProvider): THREE.Object3D {
  const group = new THREE.Group()
  group.name = 'water'
  if (water.length === 0) return group

  const surfaceMat = new THREE.MeshStandardMaterial({
    color: 0x2f6db0,
    transparent: true,
    opacity: 0.86,
    side: THREE.DoubleSide,
  })
  const skirtPositions: number[] = []

  for (const ring of water) {
    if (ring.length < 3) continue
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

  return group
}
