import * as THREE from 'three'
import type { ElevationProvider } from '../terrain/provider'

/**
 * The ground mesh for an elevation provider: the square
 * [-halfSize, halfSize]² divided into `segments` per side.
 */
export function buildGround(
  provider: ElevationProvider,
  halfSize: number,
  segments: number,
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(halfSize * 2, halfSize * 2, segments, segments)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, provider.heightAt(pos.getX(i), pos.getZ(i)))
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()

  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x4d5b39, roughness: 1 }))
  mesh.name = 'ground'
  return mesh
}
