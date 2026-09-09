import type {
  CaveEntrance, LatLon, LeafType, MappedShelter, MappedTree, OpenArea, OpenKind, Path, Vec2, WoodArea, WorldData,
} from './types'
import type { Projector } from './project'
import { centroidOf } from '../util/geometry'

export interface OverpassMember {
  type: string
  ref: number
  role?: string
}

export interface OverpassElement {
  type: string
  id: number
  lat?: number
  lon?: number
  nodes?: number[]
  members?: OverpassMember[]
  tags?: Record<string, string>
}

export interface OverpassResponse {
  elements: OverpassElement[]
}

const LEAF_TYPES = new Set(['broadleaved', 'needleleaved', 'mixed'])

/**
 * What kind of trees this polygon says it holds.
 *
 * Strictly from the tag, never inferred: a wood with no leaf_type is 'unknown'
 * and gets a regional mix later. Guessing from a place name or a nearby polygon
 * would be inventing data and calling it a survey.
 */
export function leafTypeOf(tags: Record<string, string>): LeafType {
  const v = tags.leaf_type
  return v && LEAF_TYPES.has(v) ? (v as LeafType) : 'unknown'
}

/**
 * The genus a mapper recorded, if any: `genus`, or the first word of a binomial
 * `species`/`taxon`. "Betula pendula" is a birch as far as a mushroom cares.
 */
function genusOf(tags: Record<string, string>): string | undefined {
  const raw = tags.genus ?? tags.species ?? tags.taxon
  if (!raw) return undefined
  const first = raw.trim().split(/\s+/)[0]?.toLowerCase()
  return first && /^[a-z]+$/.test(first) ? first : undefined
}

/** Which open-ground kind these tags describe, if any. */
function openKindOf(tags: Record<string, string>): OpenKind | undefined {
  const { natural, landuse, leisure } = tags
  if (natural === 'scrub' || natural === 'heath') return 'scrub'
  if (natural === 'grassland') return 'grassland'
  if (natural === 'sand' || natural === 'beach' || natural === 'dune') return 'sand'
  if (natural === 'wetland') return 'wetland'
  if (landuse === 'meadow' || landuse === 'grass') return 'meadow'
  if (leisure === 'park' || leisure === 'nature_reserve') return 'park'
  return undefined
}

function isWood(tags: Record<string, string>): boolean {
  return tags.natural === 'wood' || tags.landuse === 'forest'
}

function isWater(tags: Record<string, string>): boolean {
  return tags.natural === 'water' || tags.waterway === 'river' || tags.waterway === 'stream'
}

function isPath(tags: Record<string, string>): boolean {
  return tags.highway !== undefined
}

function isCave(tags: Record<string, string>): boolean {
  return (
    tags.natural === 'cave_entrance' || tags.man_made === 'adit' || tags.man_made === 'mineshaft'
  )
}

/**
 * A real forest hut, shelter or lookout tower — see `forestQuery`'s doc
 * comment for why this is the one building-shaped tag ever asked for.
 * `building=hut` is deliberately not `tags.building !== undefined`: an
 * ordinary house mapped inside the query's margin (odd, but OSM tagging is
 * other people's data) must not be read as our one shelter.
 */
export function isShelterTag(tags: Record<string, string>): boolean {
  return (
    tags.tourism === 'wilderness_hut' ||
    tags.amenity === 'shelter' ||
    tags.building === 'hut' ||
    tags.man_made === 'tower'
  )
}

/**
 * Turns an Overpass answer into the wood, in local metres.
 *
 * Nothing here throws. OpenStreetMap is other people's data, edited by hand:
 * ways referencing nodes outside the bbox, relations missing members and
 * half-finished tagging are all normal, and none of them is a reason to leave
 * the player staring at a blank screen. Anything unreadable is skipped.
 */
export function parseWorld(res: OverpassResponse, projector: Projector): WorldData {
  const world: WorldData = { woods: [], open: [], water: [], paths: [], trees: [], caves: [], shelters: [] }
  const elements = Array.isArray(res?.elements) ? res.elements : []

  const nodes = new Map<number, LatLon>()
  const ways = new Map<number, OverpassElement>()
  for (const el of elements) {
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      nodes.set(el.id, { lat: el.lat, lon: el.lon })
    } else if (el.type === 'way') {
      ways.set(el.id, el)
    }
  }

  /** A way's nodes as local points, or null if any of them never arrived. */
  const lineOf = (way: OverpassElement | undefined): Vec2[] | null => {
    if (!way?.nodes || way.nodes.length < 2) return null
    const pts: Vec2[] = []
    for (const id of way.nodes) {
      const ll = nodes.get(id)
      if (!ll) return null
      pts.push(projector.toLocal(ll))
    }
    return pts
  }

  const addArea = (ring: Vec2[], tags: Record<string, string>): void => {
    if (ring.length < 3) return
    if (isWood(tags)) {
      const wood: WoodArea = { ring, leafType: leafTypeOf(tags) }
      const genus = genusOf(tags)
      if (genus) wood.genus = genus
      world.woods.push(wood)
      return
    }
    if (isWater(tags)) {
      world.water.push(ring)
      return
    }
    const kind = openKindOf(tags)
    if (kind) world.open.push({ ring, kind } satisfies OpenArea)
  }

  for (const el of elements) {
    const tags = el.tags
    if (!tags) continue

    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      const at = projector.toLocal({ lat: el.lat, lon: el.lon })
      if (tags.natural === 'tree') {
        const tree: MappedTree = { at }
        const genus = genusOf(tags)
        if (genus) tree.genus = genus
        world.trees.push(tree)
      } else if (isCave(tags)) {
        world.caves.push({ at } satisfies CaveEntrance)
      } else if (isShelterTag(tags)) {
        world.shelters.push({ at } satisfies MappedShelter)
      }
      continue
    }

    if (el.type === 'way') {
      const line = lineOf(el)
      if (!line) continue
      if (isPath(tags)) {
        world.paths.push({ points: line } satisfies Path)
        continue
      }
      if (isShelterTag(tags)) {
        // A building outline has no single "position" of its own — its
        // footprint's plain average is the one point world/shelter.ts needs.
        world.shelters.push({ at: centroidOf(line) } satisfies MappedShelter)
        continue
      }
      addArea(line, tags)
      continue
    }

    if (el.type === 'relation' && el.members) {
      // Only the outer rings. A wood's holes are not worth doubling this code
      // for: a clearing inside a forest polygon reads as forest, which is a far
      // smaller error than a clearing the size of the wood.
      for (const m of el.members) {
        if (m.type !== 'way' || (m.role && m.role !== 'outer')) continue
        const ring = lineOf(ways.get(m.ref))
        if (ring) addArea(ring, tags)
      }
    }
  }

  return world
}
