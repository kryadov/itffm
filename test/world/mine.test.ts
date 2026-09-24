import * as THREE from 'three'
import {
  placeMine, mineObstacles, isInsideMine, diamondSpotInMine, mineFloorHeightAt, caveSdf, caveLattice,
  localToWorld, worldToLocal, TUNNEL_WIDTH, TUNNEL_HEIGHT, type Mine, type MineSegment,
} from '../../src/world/mine'
import { createMineTerrain } from '../../src/world/mineTerrain'
import { buildMineMesh, setMineLighting } from '../../src/world/mineMesh'
import { buildGround } from '../../src/world/ground'
import { stepPlayer, type PlayerState } from '../../src/game/player'
import { fbm2 } from '../../src/util/noise'
import type { ElevationProvider } from '../../src/terrain/provider'

const shelter = { x: 0, z: 0 }

const flat: ElevationProvider = { heightAt: () => 0 }
const slope: ElevationProvider = { heightAt: (x) => x * 0.3 }
const steep: ElevationProvider = { heightAt: (x, z) => x * 0.55 + z * 0.15 }
const bumpy: ElevationProvider = { heightAt: (x, z) => 4 * fbm2(x / 20, z / 20, 5, 3) + x * 0.05 }
const TERRAINS: [string, ElevationProvider][] = [['flat', flat], ['slope', slope], ['steep', steep], ['bumpy', bumpy]]
const SEEDS = [1, 3, 7, 11, 23]

const HALF = 90
const SEGMENTS = 160
const CELL = (HALF * 2) / SEGMENTS

describe('placeMine', () => {
  it('sits at the mapped entrance, on the ground beneath it, when this plot has one', () => {
    const ground: ElevationProvider = { heightAt: () => 3 }
    const m = placeMine(ground, 90, 3, [], shelter, [{ x: 5, z: -2 }])
    expect(m.x).toBe(5)
    expect(m.z).toBe(-2)
    expect(m.y).toBe(3)
  })

  it('ignores a mapped entrance that falls outside this plot', () => {
    const withoutMapped = placeMine(flat, 90, 3, [], shelter, [])
    const withOffPlot = placeMine(flat, 90, 3, [], shelter, [{ x: 500, z: 500 }])
    expect(withOffPlot.x).toBe(withoutMapped.x)
    expect(withOffPlot.z).toBe(withoutMapped.z)
  })

  it('sites one procedurally when this plot has no mapped entrance at all', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [])
    expect(Math.abs(m.x)).toBeLessThanOrEqual(90)
    expect(Math.abs(m.z)).toBeLessThanOrEqual(90)
    expect(Math.hypot(m.x - shelter.x, m.z - shelter.z)).toBeGreaterThan(1)
  })

  it('is deterministic for the same seed when sited procedurally', () => {
    expect(placeMine(flat, 90, 7, [], shelter, [])).toEqual(placeMine(flat, 90, 7, [], shelter, []))
  })

  it('gives a different procedural spot for a different seed', () => {
    expect(placeMine(flat, 90, 1, [], shelter, []).x).not.toBe(placeMine(flat, 90, 2, [], shelter, []).x)
  })

  it('bores into whichever direction actually climbs — a real slope', () => {
    const m = placeMine({ heightAt: (x) => x * 0.5 }, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    expect(Math.cos(m.heading)).toBeGreaterThan(0.9)
  })

  it('bores toward the steepest of two rising sides, not the shallow one', () => {
    const m = placeMine({ heightAt: (x, z) => x * 0.1 + z * 0.8 }, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    expect(Math.sin(m.heading)).toBeGreaterThan(0.9)
  })

  it('is deterministic on perfectly flat ground', () => {
    const a = placeMine(flat, 90, 3, [], shelter, [{ x: 1, z: 1 }])
    const b = placeMine(flat, 90, 3, [], shelter, [{ x: 1, z: 1 }])
    expect(a.heading).toBe(b.heading)
  })
})

describe('placeMine keeps the whole system inside the plot', () => {
  const inside = (m: Mine, half: number): boolean => {
    for (const s of m.segments) {
      for (const [lx, lz] of [[s.x0, s.z0], [s.x1, s.z1]]) {
        const w = localToWorld(m, lx, lz)
        if (Math.abs(w.x) + s.width / 2 > half || Math.abs(w.z) + s.width / 2 > half) return false
      }
    }
    const front = localToWorld(m, -10, 0)
    return Math.abs(front.x) <= half && Math.abs(front.z) <= half
  }

  it('sites every procedural mine so that tunnels, mound and apron fit (demo plot 150 and default 90)', () => {
    for (const half of [90, 150]) {
      for (let seed = 1; seed <= 40; seed++) {
        const m = placeMine(steep, half, seed, [], shelter, [])
        expect(inside(m, half), `half ${half}, seed ${seed}`).toBe(true)
      }
    }
  })

  it('turns a mapped mouth standing toward the plot edge to face into the plot', () => {
    for (const [x, z] of [[65, 0], [-65, 10], [0, 68], [5, -66], [130, 30]]) {
      const half = x === 130 ? 150 : 90
      const m = placeMine(flat, half, 3, [], shelter, [{ x, z }])
      expect(inside(m, half), `mouth at ${x},${z}`).toBe(true)
    }
  })
})

describe('placeMine keeps its mound off the hut and the rest', () => {
  // A live report (2026-09-24): once the mine grew into a maze, its mound
  // swallowed the hut. Nothing in keepClear may end up under the mound or on
  // the apron in front of the mouth.
  it('never buries the hut, the campfire or the rails, on any seed', () => {
    for (const half of [90, 150]) {
      for (let seed = 1; seed <= 40; seed++) {
        const keepClear = [
          { x: 0, z: 0, radius: 2.5 },
          { x: 14, z: -9, radius: 1.3 },
          ...Array.from({ length: 30 }, (_, i) => ({ x: -half + i * (half / 15), z: half * 0.55, radius: 3 })),
        ]
        const m = placeMine(steep, half, seed, [], shelter, [], [], keepClear)
        const terrain = createMineTerrain(m, steep, CELL)
        for (const k of keepClear) {
          expect(terrain.occupies(k.x, k.z, k.radius), `half ${half} seed ${seed} at ${k.x},${k.z}`).toBe(false)
        }
      }
    }
  })
})

describe('placeMine and the trails', () => {
  const trail = [{ x: -60, z: 0 }, { x: 60, z: 0 }]

  it('points the tunnels away from a trail that runs through the mouth, so the trail is never at the back of the mound', () => {
    // Flat ground: every heading climbs the same, so without the trail the
    // first candidate (straight along +x, i.e. along the trail) would win.
    const without = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }], [])
    expect(Math.cos(without.heading)).toBeGreaterThan(0.9)
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }], [trail])
    expect(Math.abs(Math.cos(m.heading))).toBeLessThan(0.3)
    // and no trail point stands behind the doorway plane over the tunnels
    for (let x = -60; x <= 60; x += 2) {
      const { lx, lz } = worldToLocal(m, x, 0)
      if (lx > 1) expect(caveSdf(m, lx, lz)).toBeGreaterThan(6)
    }
  })

  it('never trades the plot edge or the hillside for a trail that is not in the way', () => {
    const far = [{ x: -60, z: 70 }, { x: 60, z: 70 }]
    const a = placeMine(steep, 90, 3, [], shelter, [{ x: 0, z: 0 }], [])
    const b = placeMine(steep, 90, 3, [], shelter, [{ x: 0, z: 0 }], [far])
    expect(b.heading).toBe(a.heading)
  })

  it('is deterministic with trails', () => {
    expect(placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }], [trail])).toEqual(
      placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }], [trail]),
    )
  })
})

describe('mine segment graph', () => {
  const m0 = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])

  it('has one root segment starting at the entrance', () => {
    const root = m0.segments.find((s) => s.parentId === null)!
    expect(root.x0).toBe(0)
    expect(root.z0).toBe(0)
  })

  it('keeps the floor flat — no ramp buried under the hillside', () => {
    for (const s of m0.segments) {
      expect(s.y0).toBe(0)
      expect(s.y1).toBe(0)
    }
  })

  it('every non-root segment continues exactly where its parent ends', () => {
    for (const s of m0.segments) {
      if (s.parentId === null) continue
      const parent = m0.segments.find((p) => p.id === s.parentId)!
      expect(s.x0).toBeCloseTo(parent.x1, 6)
      expect(s.z0).toBeCloseTo(parent.z1, 6)
    }
  })

  it('has exactly one diamond chamber, and every other leaf is a dead end', () => {
    const leaves = m0.segments.filter((s) => s.isLeaf)
    expect(leaves.filter((s) => s.isDiamondChamber).length).toBe(1)
    expect(leaves.length).toBeGreaterThanOrEqual(7)
  })

  // A live request (2026-09-24): the diamond was too easy to find. The mine
  // is bigger and branches more, and the diamond waits at the far end.
  it('is a real maze: many dead ends and a long way round, on every seed', () => {
    let total = 0
    for (const seed of SEEDS) {
      const m = placeMine(flat, 90, seed, [], shelter, [{ x: 0, z: 0 }])
      expect(m.segments.filter((x) => x.isLeaf).length, `seed ${seed}`).toBeGreaterThanOrEqual(7)
      for (const x of m.segments) total += Math.hypot(x.x1 - x.x0, x.z1 - x.z0)
    }
    expect(total / SEEDS.length).toBeGreaterThan(70)
  })

  it('puts the diamond in the dead end farthest along the tunnels from the mouth', () => {
    for (const seed of SEEDS) {
      const m = placeMine(flat, 90, seed, [], shelter, [{ x: 0, z: 0 }])
      const byId = new Map(m.segments.map((x) => [x.id, x]))
      const depth = (x: MineSegment): number => {
        let d = 0
        for (let c: MineSegment | undefined = x; c; c = c.parentId === null ? undefined : byId.get(c.parentId)) {
          d += Math.hypot(c.x1 - c.x0, c.z1 - c.z0)
        }
        return d
      }
      const leaves = m.segments.filter((x) => x.isLeaf)
      const chamber = leaves.find((x) => x.isDiamondChamber)!
      expect(depth(chamber), `seed ${seed}`).toBeCloseTo(Math.max(...leaves.map(depth)), 6)
    }
  })

  it('keeps solid rock between passages that are not joined, so no tunnel breaks into another', () => {
    const segDist = (a: MineSegment, b: MineSegment): number => {
      const d = (px: number, pz: number, s: MineSegment): number => {
        const dx = s.x1 - s.x0
        const dz = s.z1 - s.z0
        const l2 = dx * dx + dz * dz
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - s.x0) * dx + (pz - s.z0) * dz) / l2)) : 0
        return Math.hypot(px - s.x0 - dx * t, pz - s.z0 - dz * t)
      }
      // Two segments that do not cross: the nearest pair includes an endpoint.
      return Math.min(d(a.x0, a.z0, b), d(a.x1, a.z1, b), d(b.x0, b.z0, a), d(b.x1, b.z1, a))
    }
    for (const seed of SEEDS) {
      const m = placeMine(flat, 90, seed, [], shelter, [{ x: 0, z: 0 }])
      for (const a of m.segments) {
        for (const b of m.segments) {
          if (a.id >= b.id) continue
          const joined = a.parentId === b.id || b.parentId === a.id || (a.parentId !== null && a.parentId === b.parentId)
          if (joined) continue
          expect(segDist(a, b), `seed ${seed}: ${a.id} and ${b.id}`).toBeGreaterThan((a.width + b.width) / 2 + 0.8)
        }
      }
    }
  })

  it('is deterministic, and different seeds give different graphs', () => {
    const a = placeMine(flat, 90, 11, [], shelter, [{ x: 0, z: 0 }])
    expect(a.segments).toEqual(placeMine(flat, 90, 11, [], shelter, [{ x: 0, z: 0 }]).segments)
    expect(a.segments).not.toEqual(placeMine(flat, 90, 12, [], shelter, [{ x: 0, z: 0 }]).segments)
  })

  it('reach covers the farthest segment endpoint from the entrance', () => {
    expect(m0.reach).toBeCloseTo(Math.max(...m0.segments.map((s) => Math.hypot(s.x1, s.z1))), 6)
  })

  it('is wide and tall enough to walk through comfortably', () => {
    expect(TUNNEL_WIDTH).toBeGreaterThanOrEqual(3)
    expect(TUNNEL_HEIGHT).toBeGreaterThanOrEqual(2.6)
    for (const seed of SEEDS) {
      const m = placeMine(flat, 90, seed, [], shelter, [{ x: 0, z: 0 }])
      for (const s of m.segments) expect(s.width).toBeGreaterThanOrEqual(TUNNEL_WIDTH * 0.8)
    }
  })

  it('never turns back through the mouth: every passage stays in front of it', () => {
    for (const seed of SEEDS) {
      const m = placeMine(flat, 90, seed, [], shelter, [{ x: 0, z: 0 }])
      for (const s of m.segments) {
        expect(s.x1).toBeGreaterThan(-0.001)
        expect(s.x0).toBeGreaterThan(-0.001)
      }
    }
  })
})

describe('caveSdf — one union of tunnels, no notches at the forks', () => {
  it('is cave on the axis of the entrance and rock behind the mouth', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    expect(caveSdf(m, 1, 0)).toBeLessThan(0)
    expect(caveSdf(m, -0.5, 0)).toBeGreaterThan(0)
    expect(caveSdf(m, 1, TUNNEL_WIDTH)).toBeGreaterThan(0)
  })

  it('every passage is open at both ends, and joints between passages are open too', () => {
    for (const seed of SEEDS) {
      const m = placeMine(flat, 90, seed, [], shelter, [{ x: 0, z: 0 }])
      for (const s of m.segments) {
        expect(caveSdf(m, s.x0, s.z0)).toBeLessThan(-0.5)
        expect(caveSdf(m, (s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2)).toBeLessThan(-0.5)
        expect(caveSdf(m, s.x1, s.z1)).toBeLessThan(-0.5)
      }
    }
  })
})

describe('isInsideMine', () => {
  const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])

  it('is true right at the entrance and at the far end of the graph', () => {
    expect(isInsideMine(m, 0, 0)).toBe(true)
    const far = m.segments.reduce((best, s) => (Math.hypot(s.x1, s.z1) > Math.hypot(best.x1, best.z1) ? s : best))
    const w = localToWorld(m, far.x1, far.z1)
    expect(isInsideMine(m, w.x, w.z)).toBe(true)
  })

  it('is false in the meadow in front of the mouth and well outside the whole graph', () => {
    const front = localToWorld(m, -6, 0)
    expect(isInsideMine(m, front.x, front.z)).toBe(false)
    expect(isInsideMine(m, m.reach * 5, m.reach * 5)).toBe(false)
  })
})

describe('mineFloorHeightAt', () => {
  const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])

  it('is the entrance height everywhere in the tunnels — the floor is flat', () => {
    for (const s of m.segments) {
      const w = localToWorld(m, s.x1, s.z1)
      expect(mineFloorHeightAt(m, w.x, w.z)).toBe(m.y)
    }
    expect(mineFloorHeightAt(m, m.x + 1, m.z)).toBe(m.y)
  })

  it('is null outside every passage — callers fall back to the terrain there', () => {
    expect(mineFloorHeightAt(m, m.x, m.z + 50)).toBeNull()
    expect(mineFloorHeightAt(m, m.x - 3, m.z)).toBeNull()
  })
})

describe('mineObstacles', () => {
  it('walls every passage in, on every mine, and leaves the doorway itself open', () => {
    for (const seed of SEEDS) {
      const m = placeMine(flat, 90, seed, [], shelter, [{ x: 0, z: 0 }])
      const obstacles = mineObstacles(m)
      expect(obstacles.length).toBeGreaterThan(m.segments.length * 4)
      // Nothing across the doorway: a player-sized disc at the mouth's centre
      // and out along the entrance axis touches no circle.
      for (const lx of [-3, -1, 0, 1, 2, 3]) {
        const w = localToWorld(m, lx, 0)
        for (const o of obstacles) expect(Math.hypot(o.x - w.x, o.z - w.z)).toBeGreaterThan(o.radius + 0.3 + 0.5)
      }
    }
  })

  it('with the mound around it, still leaves the doorway and the approach clear, and adds only a ring at the foot', () => {
    for (const seed of SEEDS) {
      const m = placeMine(flat, 90, seed, [], shelter, [{ x: 0, z: 0 }])
      const terrain = createMineTerrain(m, flat, CELL)
      const plain = mineObstacles(m)
      const withMound = mineObstacles(m, terrain.deckRadius)
      expect(withMound.length).toBeGreaterThan(plain.length)
      expect(withMound.length).toBeLessThan(plain.length + 3000)
      for (const lx of [-8, -5, -3, -1, 0, 1, 2, 3]) {
        const w = localToWorld(m, lx, 0)
        for (const o of withMound) expect(Math.hypot(o.x - w.x, o.z - w.z)).toBeGreaterThan(o.radius + 0.3 + 0.5)
      }
      // Every circle beyond the plain walls lies on the mound's foot or its rock face.
      const extra = withMound.slice(plain.length)
      for (const o of extra) {
        const { lx, lz } = worldToLocal(m, o.x, o.z)
        const onFace = Math.abs(lx) < 1e-6
        const onFoot = Math.abs(caveSdf(m, lx, lz) - (terrain.deckRadius - 0.4)) < 0.3
        expect(onFace || onFoot).toBe(true)
      }
    }
  })

  it('places every circle within reach of the entrance', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    for (const o of mineObstacles(m)) {
      expect(Math.hypot(o.x - m.x, o.z - m.z)).toBeLessThanOrEqual(m.reach + TUNNEL_WIDTH * 1.5)
    }
  })

  it('is deterministic', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 2, z: -3 }])
    expect(mineObstacles(m)).toEqual(mineObstacles(m))
  })

  it('leaves no wall stranded in the middle of a passage (nothing invisible to walk into)', () => {
    for (const seed of SEEDS) {
      const m = placeMine(flat, 90, seed, [], shelter, [{ x: 0, z: 0 }])
      for (const o of mineObstacles(m)) {
        const { lx, lz } = worldToLocal(m, o.x, o.z)
        if (lx < 0.1) continue
        // Every circle sits on (or within a jitter's width of) a wall.
        expect(Math.abs(caveSdf(m, lx, lz))).toBeLessThan(0.5)
      }
    }
  })
})

describe('diamondSpotInMine', () => {
  it('sits inside the chamber, clear of the walls, on the floor', () => {
    for (const seed of SEEDS) {
      const m = placeMine(flat, 90, seed, [], shelter, [{ x: 0, z: 0 }])
      const spot = diamondSpotInMine(m)
      const { lx, lz } = worldToLocal(m, spot.x, spot.z)
      expect(caveSdf(m, lx, lz)).toBeLessThan(-0.8)
      expect(spot.y).toBe(m.y)
      expect(isInsideMine(m, spot.x, spot.z)).toBe(true)
    }
  })

  it('is deterministic', () => {
    const m = placeMine(flat, 90, 3, [], shelter, [{ x: 0, z: 0 }])
    expect(diamondSpotInMine(m)).toEqual(diamondSpotInMine(m))
  })
})

// ---------------------------------------------------------------------------
// The mesh.

function setup(base: ElevationProvider, seed: number) {
  const m = placeMine(base, HALF, seed, [], shelter, [{ x: 8 + seed, z: -6 }])
  const terrain = createMineTerrain(m, base, CELL)
  const group = buildMineMesh(m, terrain)
  group.updateMatrixWorld(true)
  return { m, terrain, group }
}

function interiorOf(group: THREE.Group): THREE.Mesh {
  return group.getObjectByName('mine-interior') as THREE.Mesh
}

/** Triangles of a non-indexed mesh, in the mesh's own (local) space. */
function trianglesOf(mesh: THREE.Mesh): THREE.Vector3[][] {
  const pos = mesh.geometry.getAttribute('position')
  const out: THREE.Vector3[][] = []
  for (let i = 0; i + 2 < pos.count; i += 3) {
    out.push([0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, i + k)))
  }
  return out
}

describe('buildMineMesh — the tunnel interior', () => {
  it('is closed: every edge is shared by exactly two triangles, except the doorway', () => {
    for (const [name, base] of TERRAINS) {
      for (const seed of [3, 11]) {
        const { group } = setup(base, seed)
        const key = (v: THREE.Vector3): string => `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`
        const undirected = new Map<string, { n: number; onMouthPlane: boolean }>()
        const directed = new Map<string, number>()
        for (const tri of trianglesOf(interiorOf(group))) {
          for (let k = 0; k < 3; k++) {
            const a = tri[k]
            const b = tri[(k + 1) % 3]
            const ka = key(a)
            const kb = key(b)
            directed.set(`${ka}>${kb}`, (directed.get(`${ka}>${kb}`) ?? 0) + 1)
            const ku = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
            const e = undirected.get(ku) ?? { n: 0, onMouthPlane: Math.abs(a.x) < 1e-6 && Math.abs(b.x) < 1e-6 }
            e.n++
            undirected.set(ku, e)
          }
        }
        for (const [k, e] of undirected) {
          if (e.onMouthPlane && e.n === 1) continue
          expect(e.n, `${name}/${seed}: edge ${k}`).toBe(2)
        }
        // Consistently wound: an edge walked one way by one triangle is walked
        // the other way by its neighbour.
        for (const [k, n] of directed) {
          const [ka, kb] = k.split('>')
          const back = directed.get(`${kb}>${ka}`) ?? 0
          const onMouth = ka.startsWith('0.0000,') && kb.startsWith('0.0000,')
          if (onMouth && back === 0) continue
          expect(back, `${name}/${seed}: ${k}`).toBe(n)
        }
      }
    }
  })

  it('has no folded cell: every floor quad keeps its shape over dozens of mines', () => {
    for (let seed = 1; seed < 40; seed++) {
      const m = placeMine(flat, HALF, seed, [], shelter, [{ x: 11 + seed, z: -6 }])
      for (const c of caveLattice(m).cells) {
        const [a, b, cc, d] = c.corners
        expect((b.x - a.x) * (cc.z - a.z) - (b.z - a.z) * (cc.x - a.x)).toBeGreaterThan(0)
        expect((cc.x - a.x) * (d.z - a.z) - (cc.z - a.z) * (d.x - a.x)).toBeGreaterThan(0)
      }
    }
  })

  it('has a doorway: some edges are open, and all of them lie on the mouth plane', () => {
    const { group } = setup(flat, 3)
    const edges = new Map<string, number>()
    const key = (v: THREE.Vector3): string => `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`
    const onPlane = new Map<string, boolean>()
    for (const tri of trianglesOf(interiorOf(group))) {
      for (let k = 0; k < 3; k++) {
        const a = tri[k]
        const b = tri[(k + 1) % 3]
        const ku = key(a) < key(b) ? `${key(a)}|${key(b)}` : `${key(b)}|${key(a)}`
        edges.set(ku, (edges.get(ku) ?? 0) + 1)
        onPlane.set(ku, Math.abs(a.x) < 1e-6 && Math.abs(b.x) < 1e-6)
      }
    }
    const open = [...edges].filter(([, n]) => n === 1)
    expect(open.length).toBeGreaterThan(4)
    for (const [k] of open) expect(onPlane.get(k)).toBe(true)
  })

  it('faces every quad into the passage, whatever the terrain', () => {
    for (const [name, base] of TERRAINS) {
      const { m, group } = setup(base, 7)
      let bad = 0
      for (const [a, b, c] of trianglesOf(interiorOf(group))) {
        const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize()
        const centre = new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(1 / 3)
        const p = centre.addScaledVector(n, 0.3)
        const inside = caveSdf(m, p.x, p.z) < 0.35 && p.y > m.y && p.y < m.y + TUNNEL_HEIGHT + 0.2
        if (!inside) bad++
      }
      expect(bad, name).toBe(0)
    }
  })

  it('is drawn on both sides, so a surface never vanishes into the void', () => {
    const { group } = setup(flat, 3)
    expect((interiorOf(group).material as THREE.Material).side).toBe(THREE.DoubleSide)
  })

  it('lets nothing escape: a ray from anywhere inside hits the tunnel, unless it leaves by the doorway', () => {
    for (const [name, base] of TERRAINS) {
      const { m, group } = setup(base, 11)
      const interior = interiorOf(group)
      const raycaster = new THREE.Raycaster()
      const rng = (() => { let s = 12345; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 })()
      const lattice = caveLattice(m)
      let escaped = 0
      let tried = 0
      for (let n = 0; n < 250; n++) {
        const cell = lattice.cells[Math.floor(rng() * lattice.cells.length)]
        if (cell.i < 3) continue
        const lo = new THREE.Vector3(cell.cx, m.y + 1.2, cell.cz)
        const dirLocal = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize()
        const origin = group.localToWorld(lo.clone())
        const dir = dirLocal.clone().transformDirection(group.matrixWorld)
        raycaster.set(origin, dir)
        raycaster.far = 200
        tried++
        if (raycaster.intersectObject(interior).length === 0) escaped++
      }
      expect(tried).toBeGreaterThan(100)
      // A ray only gets out through the doorway, a 3 m gap at the end of a
      // 5-7 m corridor — a small share of directions, never a large one.
      expect(escaped / tried, name).toBeLessThan(0.08)
    }
  })

  it('has no light of its own that could light it up in daylight, and no stock lit material', () => {
    const { group } = setup(flat, 3)
    group.traverse((o) => expect(o instanceof THREE.Light).toBe(false))
    expect((interiorOf(group).material as THREE.Material).type).toBe('ShaderMaterial')
  })

  it('answers only to the lamp: the lamp uniform follows setMineLighting', () => {
    const { group } = setup(flat, 3)
    const u = group.userData.caveUniforms
    expect(u.uLampOn.value).toBe(0)
    setMineLighting(group, { lampOn: true, lampPos: new THREE.Vector3(1, 2, 3) })
    expect(u.uLampOn.value).toBe(1)
    expect(u.uLampPos.value.toArray()).toEqual([1, 2, 3])
    setMineLighting(group, { lampOn: false })
    expect(u.uLampOn.value).toBe(0)
  })

  it('is deterministic (vertex jitter included)', () => {
    const a = interiorOf(setup(flat, 3).group).geometry.getAttribute('position').array
    const b = interiorOf(setup(flat, 3).group).geometry.getAttribute('position').array
    expect(Array.from(a)).toEqual(Array.from(b))
  })
})

describe('the mouth on the meadow', () => {
  for (const [name, base] of TERRAINS) {
    for (const seed of SEEDS) {
      it(`${name}/${seed}: opens onto level ground and is not buried by the terrain mesh`, () => {
        const { m, terrain, group } = setup(base, seed)
        const scene = new THREE.Scene()
        const ground = buildGround(terrain.meshGround, HALF, SEGMENTS)
        ground.updateMatrixWorld(true)
        scene.add(ground, group)
        const solids = [ground, group.getObjectByName('mine-deck')!, group.getObjectByName('mine-face')!, interiorOf(group)]
        const raycaster = new THREE.Raycaster()
        const down = new THREE.Vector3(0, -1, 0)
        const topAt = (lx: number, lz: number): number => {
          const w = localToWorld(m, lx, lz)
          raycaster.set(new THREE.Vector3(w.x, m.y + 30, w.z), down)
          raycaster.far = 100
          const hits = raycaster.intersectObjects(solids, false)
          return hits.length ? hits[0].point.y : NaN
        }
        // The apron in front of the mouth is level with the floor.
        for (const lz of [-1.4, 0, 1.4]) {
          for (const lx of [-0.3, -0.9]) expect(Math.abs(topAt(lx, lz) - m.y), `apron ${lx},${lz}`).toBeLessThan(0.08)
        }
        // Looking in from the meadow, nothing blocks the doorway: rays from a
        // standing eye across the approach reach the doorway plane unobstructed.
        const doorway = [-1.2, 0, 1.2].flatMap((lz) => [0.4, 1.2, 1.9].map((h) => new THREE.Vector3(0, m.y + h, lz)))
        const eyes = [-3, -6, -10].flatMap((lx) => [-2.5, 0, 2.5].map((lz) => new THREE.Vector3(lx, m.y + 1.65, lz)))
        for (const eye of eyes) {
          for (const target of doorway) {
            const o = group.localToWorld(eye.clone())
            const t = group.localToWorld(target.clone())
            const dir = t.clone().sub(o)
            const dist = dir.length()
            raycaster.set(o, dir.normalize())
            raycaster.far = dist - 0.02
            const blocked = raycaster.intersectObjects(solids, false)
            expect(blocked.length, `eye ${eye.toArray()} -> ${target.toArray()}`).toBe(0)
          }
        }
        // And the doorway is a real hole in a real face: the rock above it
        // stands well over the top of the opening.
        const lintel = topAt(0.05, 0)
        expect(lintel).toBeGreaterThan(m.y + TUNNEL_HEIGHT + 0.5)
      })
    }
  }

  it('is easy to see: the mound stands proud of flat ground and the face is over the height of a person', () => {
    const { m, terrain } = setup(flat, 3)
    expect(terrain.deckAt(0.05, 0)).toBeGreaterThan(m.y + TUNNEL_HEIGHT + 0.5)
    expect(terrain.deckAt(0.05, TUNNEL_WIDTH / 2 + 1)).toBeGreaterThan(m.y + 1.5)
    // and it falls away to the natural ground at its own rim
    expect(terrain.deckAt(0.05, TUNNEL_WIDTH / 2 + terrain.deckRadius + 0.5)).toBeCloseTo(m.y, 1)
  })

  it('never lets the terrain mesh reach into a passage', () => {
    for (const [name, base] of TERRAINS) {
      for (const seed of [3, 11]) {
        const { m, terrain } = setup(base, seed)
        const ground = buildGround(terrain.meshGround, HALF, SEGMENTS)
        ground.updateMatrixWorld(true)
        const raycaster = new THREE.Raycaster()
        const lattice = caveLattice(m)
        let worst = -Infinity
        for (const cell of lattice.cells) {
          const w = localToWorld(m, cell.cx, cell.cz)
          raycaster.set(new THREE.Vector3(w.x, m.y + 60, w.z), new THREE.Vector3(0, -1, 0))
          raycaster.far = 200
          const hit = raycaster.intersectObject(ground)[0]
          worst = Math.max(worst, hit.point.y - m.y)
        }
        expect(worst, `${name}/${seed}`).toBeLessThan(0.01)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// The player.

function fresh(m: Mine, lx: number, lz: number, yawToward: { x: number; z: number }): PlayerState {
  const w = localToWorld(m, lx, lz)
  return {
    x: w.x, z: w.z, yaw: Math.atan2(-(yawToward.x - w.x), -(yawToward.z - w.z)), pitch: 0, crouch: 0,
    vy: 0, hop: 0, airborne: false, stand: 0, bobPhase: 0,
  }
}

/** Walks the player along a list of local waypoints; returns what happened. */
function walk(
  m: Mine, base: ElevationProvider, start: { lx: number; lz: number }, waypoints: { x: number; z: number }[],
  opts: { inside?: boolean; maxSteps?: number } = {},
) {
  const terrain = createMineTerrain(m, base, CELL)
  terrain.ctx.inside = opts.inside ?? false
  const obstacles = mineObstacles(m)
  const firstW = localToWorld(m, waypoints[0].x, waypoints[0].z)
  let p = fresh(m, start.lx, start.lz, firstW)
  let last = terrain.surface.heightAt(p.x, p.z)
  let maxJump = 0
  let idx = 0
  let steps = 0
  const maxSteps = opts.maxSteps ?? 8000
  while (idx < waypoints.length && steps < maxSteps) {
    const wp = localToWorld(m, waypoints[idx].x, waypoints[idx].z)
    if (Math.hypot(wp.x - p.x, wp.z - p.z) < 0.6) {
      idx++
      continue
    }
    const yaw = Math.atan2(-(wp.x - p.x), -(wp.z - p.z))
    p = stepPlayer(
      p, { forward: 1, strafe: 0, dYaw: yaw - p.yaw, dPitch: 0, crouching: false, sprinting: false, jumping: false, dt: 1 / 60 },
      terrain.surface, obstacles,
    )
    terrain.update(p.x, p.z)
    const h = terrain.surface.heightAt(p.x, p.z)
    maxJump = Math.max(maxJump, Math.abs(h - last))
    last = h
    steps++
  }
  return { reached: idx >= waypoints.length, steps, maxJump, terrain, p }
}

/** Waypoints down the centreline from the mouth to the far end of a segment. */
function pathTo(m: Mine, segId: number): { x: number; z: number }[] {
  const chain: number[] = []
  for (let s = m.segments.find((q) => q.id === segId)!; ; s = m.segments.find((q) => q.id === s.parentId)!) {
    chain.unshift(s.id)
    if (s.parentId === null) break
  }
  return chain.map((id) => {
    const s = m.segments.find((q) => q.id === id)!
    return { x: s.x1, z: s.z1 }
  })
}

describe('walking in and out (stepPlayer, the real collision and the real ground)', () => {
  for (const [name, base] of TERRAINS) {
    for (const seed of SEEDS) {
      it(`${name}/${seed}: from the meadow to the diamond chamber and back out, never stuck, height never jumps`, () => {
        const m = placeMine(base, HALF, seed, [], shelter, [{ x: 8 + seed, z: -6 }])
        const chamber = m.segments.find((s) => s.isDiamondChamber)!
        const inward = pathTo(m, chamber.id)
        const inn = walk(m, base, { lx: -8, lz: 0 }, [{ x: 0.3, z: 0 }, ...inward])
        expect(inn.reached, 'reached the chamber').toBe(true)
        expect(inn.maxJump).toBeLessThan(0.08)
        expect(inn.terrain.ctx.inside).toBe(true)
        // and back out again, from the far end of the chamber
        const back = [...inward].reverse().slice(1).concat([{ x: 0.3, z: 0 }, { x: -7, z: 0 }])
        const out = walk(m, base, { lx: chamber.x1, lz: chamber.z1 }, back, { inside: true })
        expect(out.reached, 'walked back out').toBe(true)
        expect(out.maxJump).toBeLessThan(0.08)
        expect(out.terrain.ctx.inside).toBe(false)
      })
    }
  }

  it('gets in from the side of the approach too, not only dead on', () => {
    for (const lz of [-4, -2.5, 2.5, 4]) {
      const m = placeMine(flat, HALF, 3, [], shelter, [{ x: 0, z: 0 }])
      const r = walk(m, flat, { lx: -8, lz }, [{ x: -1, z: 0 }, { x: 3, z: 0 }])
      expect(r.reached, `from lz=${lz}`).toBe(true)
      expect(r.terrain.ctx.inside).toBe(true)
    }
  })

  it('does not stop the player on the surface anywhere near the mine (no invisible wall across the meadow)', () => {
    const m = placeMine(flat, HALF, 3, [], shelter, [{ x: 0, z: 0 }])
    const obstacles = mineObstacles(m)
    // Every circle is either the doorway's own jamb or the rock face beside
    // it, or sits inside the mound; none lies out in the open in front.
    for (const o of obstacles) {
      const { lx } = worldToLocal(m, o.x, o.z)
      expect(lx).toBeGreaterThanOrEqual(-0.001)
    }
  })

  it('the player is inside once they have walked in through the doorway, and outside once they walk out', () => {
    const m = placeMine(flat, HALF, 3, [], shelter, [{ x: 0, z: 0 }])
    const t = createMineTerrain(m, flat, CELL)
    const at = (lx: number, lz: number): boolean => {
      const w = localToWorld(m, lx, lz)
      return t.update(w.x, w.z)
    }
    expect(at(-5, 0)).toBe(false)
    expect(at(-1, 0)).toBe(false)
    expect(at(0.8, 0)).toBe(true)
    expect(at(5, 0)).toBe(true)
    expect(at(0.5, 0)).toBe(true)
    expect(at(-1, 0)).toBe(false)
    expect(at(5, 8)).toBe(false) // beside the mound
  })

  it('someone who is over the tunnel without having come in by the doorway is not "inside" and keeps the rock height', () => {
    const m = placeMine(flat, HALF, 3, [], shelter, [{ x: 0, z: 0 }])
    const t = createMineTerrain(m, flat, CELL)
    const top = localToWorld(m, 1, 0)
    expect(t.update(top.x, top.z)).toBe(false)
    expect(t.surface.heightAt(top.x, top.z)).toBeGreaterThan(m.y + TUNNEL_HEIGHT)
  })

  it('the mound is a rock outcrop you cannot climb onto, from any side, on any ground', () => {
    for (const [name, base] of TERRAINS) {
      for (const seed of [3, 11]) {
        const m = placeMine(base, HALF, seed, [], shelter, [{ x: 8 + seed, z: -6 }])
        const terrain = createMineTerrain(m, base, CELL)
        const obstacles = mineObstacles(m, terrain.deckRadius)
        let worst = 0
        for (let a = 0; a < 360; a += 20) {
          for (const tgt of [{ x: 2, z: 0 }, { x: 5, z: 3 }, { x: 8, z: -2 }]) {
            const ang = (a * Math.PI) / 180
            const start = localToWorld(m, 4 + Math.cos(ang) * 22, Math.sin(ang) * 22)
            if (Math.abs(terrain.outsideSurface.heightAt(start.x, start.z) - base.heightAt(start.x, start.z)) > 0.01) continue
            const goal = localToWorld(m, tgt.x, tgt.z)
            let p: PlayerState = {
              x: start.x, z: start.z, yaw: 0, pitch: 0, crouch: 0, vy: 0, hop: 0, airborne: false, stand: 0, bobPhase: 0,
            }
            for (let i = 0; i < 1500; i++) {
              const yaw = Math.atan2(-(goal.x - p.x), -(goal.z - p.z))
              p = stepPlayer(
                p, { forward: 1, strafe: 0, dYaw: yaw - p.yaw, dPitch: 0, crouching: false, sprinting: false, jumping: false, dt: 1 / 30 },
                terrain.surface, obstacles,
              )
              terrain.update(p.x, p.z)
              // Over the mound (behind the doorway plane, not down in the tunnel).
              if (worldToLocal(m, p.x, p.z).lx > 0.5 && !terrain.ctx.inside) {
                worst = Math.max(worst, terrain.surface.heightAt(p.x, p.z) - base.heightAt(p.x, p.z))
              }
            }
          }
        }
        // Only the levelled apron and the doorway floor: never the mound (3+ m).
        expect(worst, `${name}/${seed}`).toBeLessThan(0.9)
      }
    }
  })
})
