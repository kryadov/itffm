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
