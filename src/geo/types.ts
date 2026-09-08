export interface LatLon {
  lat: number
  lon: number
}

/** Local metric coordinates: x east, z south, matching the scene. */
export interface Vec2 {
  x: number
  z: number
}

export interface BBox {
  south: number
  west: number
  north: number
  east: number
}

/** What a wooded polygon says about itself. */
export type LeafType = 'broadleaved' | 'needleleaved' | 'mixed' | 'unknown'

export interface WoodArea {
  ring: Vec2[]
  leafType: LeafType
  /** Genus from a species/genus/taxon tag, lowercased, when the mapper left one. */
  genus?: string
}

export type OpenKind = 'scrub' | 'meadow' | 'grassland' | 'sand' | 'wetland' | 'park'

export interface OpenArea {
  ring: Vec2[]
  kind: OpenKind
}

export interface MappedTree {
  at: Vec2
  genus?: string
}

export interface Path {
  points: Vec2[]
}

export interface CaveEntrance {
  at: Vec2
}

/**
 * Everything we ask OpenStreetMap for, in local metres.
 *
 * Deliberately narrow: this is a wood, not a city. Buildings, carriageways and
 * railways are not part of the game and are never parsed.
 */
export interface WorldData {
  woods: WoodArea[]
  open: OpenArea[]
  water: Vec2[][]
  paths: Path[]
  trees: MappedTree[]
  caves: CaveEntrance[]
}
