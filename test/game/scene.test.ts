import { createForest } from '../../src/game/scene'
import { proceduralTerrain } from '../../src/terrain/procedural'
import { waterObstacles } from '../../src/world/water'
import type { ForestSource } from '../../src/game/scene'

const ground = proceduralTerrain(1)
const biomeAt = (): 'forest-mixed' => 'forest-mixed' as const

// Small on purpose: createForest builds a whole scene (terrain, trees,
// ecology sites, mushrooms...) — this only needs to be big enough that the
// obstacle assembly under test still runs, not a realistic wood.
const HALF_SIZE = 20

describe('createForest obstacle assembly', () => {
  it('includes waterObstacles\' own circles for a mapped pond', () => {
    const pond = [{ x: -5, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 5 }, { x: -5, z: 5 }]
    const source: ForestSource = { ground, trees: [], biomeAt, water: [pond] }
    const forest = createForest(source, 1, HALF_SIZE, 20)
    const expected = waterObstacles([pond])
    expect(expected.length).toBeGreaterThan(0)
    for (const o of expected) {
      expect(forest.extraObstacles.some((e) => e.x === o.x && e.z === o.z && e.radius === o.radius)).toBe(true)
    }
  })
})

describe('createForest deferred placements', () => {
  const source: ForestSource = { ground, trees: [], biomeAt }
  const build = (defer: boolean) => createForest(source, 1, 60, 20, 10, defer)

  it('builds nothing up front when deferred, and everything on request', () => {
    const forest = build(true)
    expect(forest.placements.length).toBeGreaterThan(3)
    expect(forest.mushroomObjects).toHaveLength(0)
    expect(forest.pendingPlacements()).toBe(forest.placements.length)
    expect(forest.buildPlacements(Infinity)).toBe(0)
    expect(forest.pendingPlacements()).toBe(0)
    expect(forest.mushroomObjects.length).toBeGreaterThan(0)
  })

  it('always makes progress, even on a zero budget, and can be drained in slices', () => {
    const forest = build(true)
    const total = forest.placements.length
    let remaining = forest.buildPlacements(0)
    expect(remaining).toBe(total - 1)
    let calls = 1
    while (remaining > 0) {
      const next = forest.buildPlacements(0)
      expect(next).toBeLessThan(remaining)
      remaining = next
      calls++
    }
    expect(calls).toBe(total)
  })

  it('ends up with the same wood as building it all at once', () => {
    const eager = build(false)
    const sliced = build(true)
    while (sliced.buildPlacements(0) > 0) { /* drain */ }
    const key = (f: ReturnType<typeof build>) =>
      f.mushroomObjects.map((o) => [o.position.x, o.position.y, o.position.z, o.userData.placement.speciesId].join(','))
    expect(key(sliced)).toEqual(key(eager))
    expect(eager.pendingPlacements()).toBe(0)
  })
})
