import * as THREE from 'three'
import { fbm2 } from '../util/noise'
import type { ElevationProvider } from '../terrain/provider'
import type { Biome } from '../species/schema'

const DEFAULT_COLOR = new THREE.Color(0x4d5b39)
/** What leaf litter looks like against the default forest floor — always
 *  darker, the way duff and bare patches read against grass, never lighter. */
const LITTER_DARK = new THREE.Color(0x333e20)
/** How far a patch can darken towards `LITTER_DARK`, 0..1 — short of the full
 *  distance, so the floor still reads as the same green underneath. */
const LITTER_STRENGTH = 0.45
/** Metres per litter patch — coarser than a single leaf, finer than a whole
 *  clearing, the size an actual drift of duff piles up at. */
const LITTER_SCALE = 3.2

/** Ground tint for the biomes that read as a different landscape entirely,
 *  not just a different mushroom list — everything else keeps the default
 *  forest-floor green (mottled by leaf litter, see `litterColor`). */
const BIOME_COLOR: Partial<Record<Biome, THREE.Color>> = {
  'dunes-coast': new THREE.Color(0xd6c290),
  wetland: new THREE.Color(0x3d4a30),
}

/** The default forest floor is not one flat green: leaf litter, bare soil and
 *  moss break it into patches, the one thing `world/grass.ts`/`flora.ts`'s
 *  scattered decoration stands on top of but never actually is. Pure noise,
 *  not a texture — the whole project draws no images (see CLAUDE.md). */
function litterColor(x: number, z: number, seed: number): THREE.Color {
  const t = (fbm2(x / LITTER_SCALE, z / LITTER_SCALE, seed, 2) + 1) / 2
  return DEFAULT_COLOR.clone().lerp(LITTER_DARK, t * LITTER_STRENGTH)
}

/**
 * The ground mesh for an elevation provider: the square
 * [-halfSize, halfSize]² divided into `segments` per side.
 *
 * @param biomeAt when given, tints each vertex by the biome under it — sand
 *   for dunes, dark peat for wetland, mottled litter for the ordinary forest
 *   floor — so a plot that crosses biomes reads as one on the ground, not
 *   just in which mushrooms happen to grow there.
 * @param seed only used for the litter pattern — the same seed the rest of
 *   the wood already grows from, so a reload keeps the same floor.
 */
export function buildGround(
  provider: ElevationProvider,
  halfSize: number,
  segments: number,
  biomeAt?: (x: number, z: number) => Biome,
  seed = 0,
  origin: { x: number; z: number } = { x: 0, z: 0 },
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(halfSize * 2, halfSize * 2, segments, segments)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const colors = biomeAt ? new Float32Array(pos.count * 3) : null
  for (let i = 0; i < pos.count; i++) {
    // Vertices stay in the mesh's own local space (mesh.position carries the
    // chunk's world offset, set below) — heightAt/biomeAt still need the
    // real world point, hence the origin added only for those two calls.
    const x = pos.getX(i)
    const z = pos.getZ(i)
    pos.setY(i, provider.heightAt(x + origin.x, z + origin.z))
    if (colors && biomeAt) {
      const biome = biomeAt(x + origin.x, z + origin.z)
      const c = BIOME_COLOR[biome] ?? litterColor(x + origin.x, z + origin.z, seed)
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
  mesh.position.set(origin.x, 0, origin.z)
  // Lets the shelter's hearth light (world/shelter.ts) leave a real shadow
  // under its own walls instead of shining straight through them — the only
  // shadow-casting light in the wood, so this costs nothing anywhere else.
  mesh.receiveShadow = true
  return mesh
}
