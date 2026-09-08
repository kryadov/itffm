import * as THREE from 'three'
import type { ElevationProvider } from '../terrain/provider'

export interface FairyRingMarker {
  x: number
  z: number
  radius: number
}

/** How wide the lush band is, metres — thin enough to read as a line in the
 *  grass, not a patch. */
const BAND_WIDTH = 0.35
/** Lifted just clear of the ground mesh so the two surfaces never z-fight. */
const LIFT = 0.02

/**
 * The ring itself is not a mushroom, and the game will never render it as
 * one: it is the visible half of the mycelium that put those mushrooms up —
 * grass grows lusher over it, so the ground reads darker and greener in a
 * perfect circle. A rare payoff for players who already know to look for one.
 */
export function buildFairyRingMesh(marker: FairyRingMarker, ground: ElevationProvider): THREE.Mesh {
  const geo = new THREE.RingGeometry(
    Math.max(0.1, marker.radius - BAND_WIDTH / 2),
    marker.radius + BAND_WIDTH / 2,
    48,
  )
  geo.rotateX(-Math.PI / 2)

  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, ground.heightAt(marker.x + pos.getX(i), marker.z + pos.getZ(i)) + LIFT)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()

  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2f5a24, roughness: 0.9 }))
  mesh.name = 'fairyRing'
  mesh.position.set(marker.x, 0, marker.z)
  return mesh
}
