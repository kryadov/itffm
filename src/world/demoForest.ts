import type { LatLon, Vec2, WorldData } from '../geo/types'

const square = (cx: number, cz: number, r: number): Vec2[] => [
  { x: cx - r, z: cz - r },
  { x: cx + r, z: cz - r },
  { x: cx + r, z: cz + r },
  { x: cx - r, z: cz + r },
]

/**
 * A wood baked into the build, by hand, for when the network refuses.
 *
 * Overpass can time out, every mirror can be down, and a fair share of rural
 * OpenStreetMap is unmapped outright — a bare field where a real wood stands.
 * Standing on empty ground looks like the game is broken, not like an honest
 * absence of data, so this is what loads instead: a real-looking mix of
 * conifer, broadleaf and a clearing, entirely deterministic, no network at all.
 *
 * The centre sits near Losiny Ostrov, Moscow — a real wooded park, so the
 * regional tree mix this coordinate implies is the right one.
 */
export function demoForest(): { world: WorldData; center: LatLon } {
  const world: WorldData = {
    woods: [
      { ring: square(0, 0, 140), leafType: 'mixed' },
      { ring: square(-300, -300, 60), leafType: 'needleleaved' },
      { ring: square(300, 300, 60), leafType: 'broadleaved' },
    ],
    open: [{ ring: square(200, -60, 40), kind: 'meadow' }],
    water: [square(-60, 160, 25)],
    paths: [
      {
        points: [
          { x: -140, z: 0 },
          { x: -40, z: 20 },
          { x: 40, z: -10 },
          { x: 140, z: 30 },
        ],
      },
    ],
    trees: [],
    caves: [],
  }

  return { world, center: { lat: 55.87, lon: 37.77 } }
}
