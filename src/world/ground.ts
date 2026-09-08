import * as THREE from 'three'
import type { ElevationProvider } from '../terrain/provider'
import type { Biome } from '../species/schema'

const DEFAULT_COLOR = new THREE.Color(0x4d5b39)

/** Ground tint for the biomes that read as a different landscape entirely,
 *  not just a different mushroom list — everything else keeps the default
 *  forest-floor green. */
const BIOME_COLOR: Partial<Record<Biome, THREE.Color>> = {
  'dunes-coast': new THREE.Color(0xd6c290),
  wetland: new THREE.Color(0x3d4a30),
}

/**
 * The ground mesh for an elevation provider: the square
 * [-halfSize, halfSize]² divided into `segments` per side.
 *
 * @param biomeAt when given, tints each vertex by the biome under it — sand
 *   for dunes, dark peat for wetland — so a plot that crosses biomes reads as
 *   one on the ground, not just in which mushrooms happen to grow there.
 */
export function buildGround(
  provider: ElevationProvider,
  halfSize: number,
  segments: number,
  biomeAt?: (x: number, z: number) => Biome,
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(halfSize * 2, halfSize * 2, segments, segments)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const colors = biomeAt ? new Float32Array(pos.count * 3) : null
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    pos.setY(i, provider.heightAt(x, z))
    if (colors && biomeAt) {
      const c = BIOME_COLOR[biomeAt(x, z)] ?? DEFAULT_COLOR
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  if (colors) geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: colors ? 0xffffff : DEFAULT_COLOR,
      vertexColors: colors !== null,
      roughness: 1,
    }),
  )
  mesh.name = 'ground'
  return mesh
}
