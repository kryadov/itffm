import { mulberry32 } from '../util/rng'
import { fbm2 } from '../util/noise'
import { pointInPolygon, boundsOf } from '../util/geometry'
import { isClearing } from './clearings'
import { LOOK, type Tree } from './trees'
import type { WorldData, LeafType, WoodArea } from '../geo/types'
import type { ElevationProvider } from '../terrain/provider'
import { TREE_GENERA, type TreeGenus } from '../species/schema'

/** Spacing of the candidate lattice inside a wood, metres. */
const GRID = 4.5
/** How close two trees may stand, metres. */
const MIN_GAP = 1.6
/** Spatial scale of a stand, metres — bigger than the tree-placement grid by a lot. */
const STAND_SCALE = 70
/** Ceiling on trees per plot: instanced, but not free. */
const MAX_TREES = 4000

/**
 * Which genera grow at this latitude.
 *
 * A coarse three-band model of the European forest zones — nemoral, mixed,
 * boreal. It is not a vegetation map and does not pretend to be: the point is
 * that a wood in Karelia should not be full of beech, not that every stand is
 * botanically exact. OSM almost never names the species in a wild wood, so
 * something has to fill the gap, and a real regional list is the honest way.
 */
export function regionalMix(leafType: LeafType, lat: number): TreeGenus[] {
  const a = Math.abs(lat)
  let broadleaf: TreeGenus[]
  let conifer: TreeGenus[]

  if (a < 50) {
    // Nemoral: oak and beech woods.
    broadleaf = ['quercus', 'fagus', 'carpinus', 'tilia', 'acer']
    conifer = ['pinus', 'abies']
  } else if (a < 60) {
    // Mixed: the birch-and-spruce belt most of our players know.
    broadleaf = ['betula', 'populus', 'quercus', 'tilia', 'alnus']
    conifer = ['picea', 'pinus']
  } else {
    // Boreal: taiga, where the broadleaves are pioneers along the edges.
    broadleaf = ['betula', 'populus', 'salix', 'alnus']
    conifer = ['picea', 'pinus', 'larix', 'abies']
  }

  if (leafType === 'needleleaved') return conifer
  if (leafType === 'broadleaved') return broadleaf
  return [...conifer, ...broadleaf]
}

function isKnownGenus(g: string | undefined): g is TreeGenus {
  return g !== undefined && (TREE_GENERA as readonly string[]).includes(g)
}

/**
 * The genera to grow in this polygon: what the mapper wrote if we can draw it,
 * otherwise the regional list for its leaf type.
 */
function mixFor(wood: WoodArea, lat: number): TreeGenus[] {
  // A genus tag naming something we have no model for — eucalyptus, say — is
  // better ignored than drawn as a birch pretending to be a gum tree.
  if (isKnownGenus(wood.genus)) return [wood.genus]
  return regionalMix(wood.leafType, lat)
}

/**
 * Grows the trees a real wood is made of.
 *
 * Candidates come from a lattice over each polygon, culled to the ring and to
 * the plot, then thinned so no two trunks stand inside each other. Genus is
 * chosen in patches by a noise field, the same way the procedural wood did it:
 * a forager hunts a particular corner of a wood, and an even shuffle of species
 * gives them nothing to learn.
 */
export function placeOsmTrees(
  world: WorldData,
  ground: ElevationProvider,
  lat: number,
  seed: number,
  halfSize: number,
): Tree[] {
  const rng = mulberry32(seed)
  const trees: Tree[] = []

  const cell = MIN_GAP
  const grid = new Map<string, Tree[]>()

  const tooClose = (x: number, z: number): boolean => {
    const gx = Math.floor(x / cell)
    const gz = Math.floor(z / cell)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const t of grid.get(`${gx + dx}:${gz + dz}`) ?? []) {
          if (Math.hypot(t.x - x, t.z - z) <= MIN_GAP) return true
        }
      }
    }
    return false
  }

  const add = (x: number, z: number, genus: TreeGenus): void => {
    const look = LOOK[genus] ?? LOOK.betula
    const tree: Tree = {
      x,
      z,
      y: ground.heightAt(x, z),
      genus,
      radius: look.trunk,
      height: look.height[0] + rng() * (look.height[1] - look.height[0]),
    }
    trees.push(tree)
    const key = `${Math.floor(x / cell)}:${Math.floor(z / cell)}`
    const bucket = grid.get(key)
    if (bucket) bucket.push(tree)
    else grid.set(key, [tree])
  }

  // Mapped trees first: a surveyed tree outranks anything we would invent, and
  // seeding the grid with them keeps our own trees from growing through them.
  for (const t of world.trees) {
    if (Math.abs(t.at.x) > halfSize || Math.abs(t.at.z) > halfSize) continue
    if (tooClose(t.at.x, t.at.z)) continue
    add(t.at.x, t.at.z, isKnownGenus(t.genus) ? t.genus : 'betula')
  }

  for (const wood of world.woods) {
    const b = boundsOf(wood.ring)
    if (!b) continue
    const mix = mixFor(wood, lat)

    const minX = Math.max(-halfSize, b.minX)
    const maxX = Math.min(halfSize, b.maxX)
    const minZ = Math.max(-halfSize, b.minZ)
    const maxZ = Math.min(halfSize, b.maxZ)

    for (let x = minX; x <= maxX; x += GRID) {
      for (let z = minZ; z <= maxZ; z += GRID) {
        if (trees.length >= MAX_TREES) return trees
        // Jitter, or the wood comes out planted in rows like an orchard.
        const jx = x + (rng() - 0.5) * GRID * 0.8
        const jz = z + (rng() - 0.5) * GRID * 0.8
        if (Math.abs(jx) > halfSize || Math.abs(jz) > halfSize) continue
        if (!pointInPolygon(jx, jz, wood.ring)) continue
        if (isClearing(jx, jz, seed)) continue
        if (tooClose(jx, jz)) continue

        // Argmax over one noise field per genus, not a proportional draw: a
        // proportional pick left the interior of a stand mixed even at a
        // steep exponent, because the runner-up field is rarely far behind.
        // Picking the outright strongest field is what makes a stand a stand.
        let genus = mix[0]
        let best = -Infinity
        for (const g of mix) {
          const field = fbm2(jx / STAND_SCALE, jz / STAND_SCALE, seed + g.length * 7717 + g.charCodeAt(0) * 131, 2)
          if (field > best) {
            best = field
            genus = g
          }
        }

        add(jx, jz, genus)
      }
    }
  }

  return trees
}
