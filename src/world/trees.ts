import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mulberry32, pickWeighted, hashString } from '../util/rng'
import { fbm2 } from '../util/noise'
import type { ElevationProvider } from '../terrain/provider'
import type { TreeGenus } from '../species/schema'

export interface Tree {
  x: number
  z: number
  /** Ground height under the tree. */
  y: number
  genus: TreeGenus
  /** Trunk radius at the base, metres — collisions use this. */
  radius: number
  height: number
}

const MIN_GAP = 1.6

/** How sharply a genus wins its patch. Higher means cleaner stands. */
const STAND_SHARPNESS = 5

export interface GenusLook {
  trunk: number
  crown: number
  height: [number, number]
  crownColor: number
  trunkColor: number
  conifer: boolean
}

/**
 * How each genus is drawn. Every genus the species data can name as a partner
 * has to be here: a mushroom that grows with hornbeam needs a hornbeam to grow
 * under, and a missing entry would silently fall back to birch.
 */
export const LOOK: Record<TreeGenus, GenusLook> = {
  betula: { trunk: 0.16, crown: 2.4, height: [14, 22], crownColor: 0x74963f, trunkColor: 0xe8e4d8, conifer: false },
  picea: { trunk: 0.22, crown: 1.7, height: [16, 28], crownColor: 0x2f4a33, trunkColor: 0x4a3b2c, conifer: true },
  pinus: { trunk: 0.26, crown: 2.1, height: [18, 30], crownColor: 0x44603a, trunkColor: 0x8a5a3b, conifer: true },
  abies: { trunk: 0.24, crown: 1.8, height: [18, 32], crownColor: 0x27412f, trunkColor: 0x5a4a3a, conifer: true },
  larix: { trunk: 0.22, crown: 1.9, height: [18, 30], crownColor: 0x6d8a3c, trunkColor: 0x7a5533, conifer: true },
  quercus: { trunk: 0.34, crown: 3.4, height: [15, 24], crownColor: 0x556b2f, trunkColor: 0x5a4632, conifer: false },
  populus: { trunk: 0.24, crown: 2.4, height: [16, 26], crownColor: 0x7a9a4a, trunkColor: 0x6b6154, conifer: false },
  fagus: { trunk: 0.32, crown: 3.2, height: [18, 28], crownColor: 0x5f7a33, trunkColor: 0x8b8378, conifer: false },
  carpinus: { trunk: 0.22, crown: 2.6, height: [12, 20], crownColor: 0x63803a, trunkColor: 0x8a8478, conifer: false },
  tilia: { trunk: 0.30, crown: 3.0, height: [16, 26], crownColor: 0x6b8a3e, trunkColor: 0x5f5348, conifer: false },
  acer: { trunk: 0.26, crown: 2.9, height: [14, 22], crownColor: 0x6f8b38, trunkColor: 0x6a5a49, conifer: false },
  alnus: { trunk: 0.20, crown: 2.2, height: [12, 20], crownColor: 0x4e6b34, trunkColor: 0x53483f, conifer: false },
  salix: { trunk: 0.22, crown: 2.5, height: [10, 18], crownColor: 0x8aa055, trunkColor: 0x5d5347, conifer: false },
}

const DEFAULT_LOOK: GenusLook = LOOK.betula

/**
 * Scatters trees across the plot.
 *
 * Genera are laid down in patches rather than evenly: a large-scale noise field
 * decides where the spruce stand is and where the birch edge runs. That matters
 * for play, not for looks — a forager hunts a particular corner of a wood, and
 * patches give them something to learn and come back to.
 *
 * @param density trees per square metre before the spacing cull
 */
export function placeTrees(
  provider: ElevationProvider,
  halfSize: number,
  seed: number,
  mix: TreeGenus[],
  density = 0.06,
  origin: { x: number; z: number } = { x: 0, z: 0 },
): Tree[] {
  const rng = mulberry32(seed)
  const area = halfSize * 2 * halfSize * 2
  const attempts = Math.floor(area * density)
  const trees: Tree[] = []

  // A grid to cull neighbours that are too close; without it the check would
  // be quadratic in the tree count.
  const cell = MIN_GAP
  const grid = new Map<string, Tree[]>()

  for (let i = 0; i < attempts; i++) {
    const x = origin.x + (rng() * 2 - 1) * halfSize
    const z = origin.z + (rng() * 2 - 1) * halfSize

    const gx = Math.floor(x / cell)
    const gz = Math.floor(z / cell)
    let tooClose = false
    for (let dx = -1; dx <= 1 && !tooClose; dx++) {
      for (let dz = -1; dz <= 1 && !tooClose; dz++) {
        for (const t of grid.get(`${gx + dx}:${gz + dz}`) ?? []) {
          if (Math.hypot(t.x - x, t.z - z) <= MIN_GAP) tooClose = true
        }
      }
    }
    if (tooClose) continue

    // One noise field per genus; the strongest here almost always wins. The
    // exponent is what makes stands read as stands: a gentle weighting left
    // the genera evenly shuffled, which is not how a wood grows. What survives
    // of the randomness shows up where two stands meet, which is right.
    const genus =
      pickWeighted(rng, mix, (g) => {
        const field = fbm2(x / 45, z / 45, seed + g.length * 7717 + g.charCodeAt(0) * 131, 2)
        return Math.exp(field * STAND_SHARPNESS)
      }) ?? mix[0]

    const look = LOOK[genus] ?? DEFAULT_LOOK
    const tree: Tree = {
      x,
      z,
      y: provider.heightAt(x, z),
      genus,
      radius: look.trunk,
      height: look.height[0] + rng() * (look.height[1] - look.height[0]),
    }
    trees.push(tree)

    const key = `${gx}:${gz}`
    const bucket = grid.get(key)
    if (bucket) bucket.push(tree)
    else grid.set(key, [tree])
  }

  return trees
}

/** A landing spot in a tree's crown, for world/birds.ts. */
export interface TreePerch {
  x: number
  z: number
  y: number
}

/** How far up the trunk the crown sits, as a fraction of total height — a
 *  bird lands in the leaves, not at the very top or down among the branches. */
const PERCH_HEIGHT_FRAC = 0.72

/**
 * Every tree's crown as a place a bird could land, derived straight from the
 * same height each tree was actually drawn at — not a separate guess that
 * could drift from what the canopy looks like.
 */
export function treePerches(trees: Tree[]): TreePerch[] {
  return trees.map((t) => ({ x: t.x, z: t.z, y: t.y + t.height * PERCH_HEIGHT_FRAC }))
}

/** How many distinct broadleaf crown shapes exist. */
const BROADLEAF_VARIANT_COUNT = 3

/**
 * Which crown shape a tree at this position gets. Pure and deterministic —
 * the same spot always grows the same silhouette — so it needs no seed of its
 * own; the tree's own position is enough entropy.
 */
export function crownVariantIndex(x: number, z: number, count = BROADLEAF_VARIANT_COUNT): number {
  return hashString(`${x.toFixed(2)}:${z.toFixed(2)}`) % count
}

interface CrownShape {
  geometry: THREE.BufferGeometry
  /** Vertical squash relative to the trunk-driven spread — under 1 is flatter. */
  yScale: number
  /** Horizontal spread relative to the same base — over 1 is wider. */
  xzScale: number
  /** Where the crown centres, as a fraction of the tree's total height. */
  heightFrac: number
}

/**
 * A crown as a bumpy sphere rather than a perfect one: an icosahedron with
 * each vertex pushed out along its own direction by a bit of noise, so the
 * outline is ragged the way a real canopy is, not a drafting-compass circle.
 * Built once per variant and shared by every instance of it — the raggedness
 * costs nothing per tree.
 */
function buildRaggedCrown(seed: number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 1)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const bump = 1 + fbm2(x * 1.6 + seed, z * 1.6 + seed, seed, 2) * 0.22
    pos.setXYZ(i, x * bump, y * bump, z * bump)
  }
  geo.computeVertexNormals()
  return geo
}

/**
 * Oak-wide, birch-round, poplar-tall: three silhouettes are enough to break
 * up the "rows of identical balloons" a single sphere gives every broadleaf
 * genus, without paying for a unique crown per tree.
 */
const BROADLEAF_CROWNS: CrownShape[] = [
  { geometry: buildRaggedCrown(1), yScale: 0.8, xzScale: 1.0, heightFrac: 0.82 },
  { geometry: buildRaggedCrown(2), yScale: 0.55, xzScale: 1.25, heightFrac: 0.78 },
  { geometry: buildRaggedCrown(3), yScale: 1.35, xzScale: 0.7, heightFrac: 0.88 },
]

interface ConiferShape {
  /** Unit geometry: apex at y=+0.5, widest tier's base radius 1, centred at
   *  the origin — the same convention buildRaggedCrown's broadleaf shapes use,
   *  so real size comes entirely from the instance's own scale. */
  geometry: THREE.BufferGeometry
  /** The crown's own height as a fraction of the whole tree's height — this
   *  is what actually tells a spruce from a pine: how far down the trunk the
   *  crown reaches, not the cone's proportions. */
  crownHeightFrac: number
  /** Extra width multiplier on top of the genus's own `look.crown`. */
  xzScale: number
}

/** One plain cone, shared by every genus whose crown is a single unbroken
 *  spire rather than tiers — cheap, since geometry is shared, only the
 *  instance transform differs. */
const SINGLE_CONE = new THREE.ConeGeometry(1, 1, 8)

/**
 * A "wedding cake" of `tiers` cones, narrowing and shrinking toward the top
 * with a gap between each — the airy, layered look a pine or larch crown
 * actually has, as opposed to spruce or fir's one unbroken spire. Built once
 * per tier count and shared by every instance of that genus.
 */
function buildTieredConiferCrown(tiers: number): THREE.BufferGeometry {
  const gap = 0.08
  const bandHeight = 1 / tiers
  const coneHeight = bandHeight - gap
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < tiers; i++) {
    const bottomY = -0.5 + i * bandHeight
    const topY = bottomY + coneHeight
    const radius = 1 - (i / tiers) * 0.7
    const cone = new THREE.ConeGeometry(radius, coneHeight, 7)
    cone.translate(0, topY - coneHeight / 2, 0)
    parts.push(cone)
  }
  const merged = mergeGeometries(parts, false)
  merged.computeVertexNormals()
  return merged
}

/**
 * One silhouette per conifer genus instead of one cone proportion for all of
 * them — spruce and pine used to be nearly indistinguishable. `crownHeightFrac`
 * is doing the real work: spruce and fir droop low with an unbroken spire,
 * pine and larch sit raised and visibly tiered.
 */
const CONIFER_SHAPES: Partial<Record<TreeGenus, ConiferShape>> = {
  picea: { geometry: SINGLE_CONE, crownHeightFrac: 0.78, xzScale: 0.8 },
  abies: { geometry: SINGLE_CONE, crownHeightFrac: 0.62, xzScale: 0.95 },
  pinus: { geometry: buildTieredConiferCrown(3), crownHeightFrac: 0.5, xzScale: 1.1 },
  larix: { geometry: buildTieredConiferCrown(2), crownHeightFrac: 0.48, xzScale: 1.0 },
}
const DEFAULT_CONIFER_SHAPE: ConiferShape = CONIFER_SHAPES.picea!

/**
 * Tree meshes, instanced per genus (and, for broadleaf crowns, per shape
 * variant too): a thousand trees would otherwise cost a thousand draw calls
 * and the frame with them.
 */
export function buildTreeMeshes(trees: Tree[]): THREE.Group {
  const group = new THREE.Group()
  group.name = 'trees'
  const byGenus = new Map<TreeGenus, Tree[]>()
  for (const t of trees) {
    const b = byGenus.get(t.genus)
    if (b) b.push(t)
    else byGenus.set(t.genus, [t])
  }

  const dummy = new THREE.Object3D()
  for (const [genus, list] of byGenus) {
    const look = LOOK[genus] ?? DEFAULT_LOOK

    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(look.trunk * 0.7, look.trunk, 1, 7),
      new THREE.MeshStandardMaterial({ color: look.trunkColor, roughness: 1 }),
      list.length,
    )
    list.forEach((t, i) => {
      dummy.rotation.set(0, 0, 0)
      dummy.position.set(t.x, t.y + t.height / 2, t.z)
      dummy.scale.set(1, t.height, 1)
      dummy.updateMatrix()
      trunks.setMatrixAt(i, dummy.matrix)
    })
    group.add(trunks)

    const crownMat = new THREE.MeshStandardMaterial({ color: look.crownColor, roughness: 1 })

    if (look.conifer) {
      const shape = CONIFER_SHAPES[genus] ?? DEFAULT_CONIFER_SHAPE
      const crowns = new THREE.InstancedMesh(shape.geometry, crownMat, list.length)
      list.forEach((t, i) => {
        const spread = 0.75 + ((t.height - look.height[0]) / (look.height[1] - look.height[0])) * 0.5
        const crownH = t.height * shape.crownHeightFrac
        const crownR = spread * look.crown * shape.xzScale
        dummy.rotation.set(0, 0, 0)
        dummy.position.set(t.x, t.y + t.height - crownH / 2, t.z)
        dummy.scale.set(crownR, crownH, crownR)
        dummy.updateMatrix()
        crowns.setMatrixAt(i, dummy.matrix)
      })
      group.add(crowns)
      continue
    }

    // Broadleaf: split by crown shape so each variant gets its own instanced
    // batch. Still just as many draw calls as genera in the wood, times the
    // fixed variant count — not one per tree.
    const byVariant: Tree[][] = Array.from({ length: BROADLEAF_CROWNS.length }, () => [])
    for (const t of list) byVariant[crownVariantIndex(t.x, t.z)].push(t)

    byVariant.forEach((variantTrees, vi) => {
      if (variantTrees.length === 0) return
      const shape = BROADLEAF_CROWNS[vi]
      const crowns = new THREE.InstancedMesh(shape.geometry, crownMat, variantTrees.length)
      variantTrees.forEach((t, i) => {
        const spread = 0.75 + ((t.height - look.height[0]) / (look.height[1] - look.height[0])) * 0.5
        dummy.rotation.set(0, 0, 0)
        dummy.position.set(t.x, t.y + t.height * shape.heightFrac, t.z)
        dummy.scale.set(spread * shape.xzScale, spread * shape.yScale, spread * shape.xzScale)
        dummy.updateMatrix()
        crowns.setMatrixAt(i, dummy.matrix)
      })
      group.add(crowns)
    })
  }
  return group
}
