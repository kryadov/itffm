import { WORLD_SIZES, DEFAULT_WORLD_SIZE } from '../../src/ui/worldSize'
import { DEFAULT_HALF_SIZE } from '../../src/game/scene'

describe('WORLD_SIZES', () => {
  it('gives every option a unique id and an increasing half-size', () => {
    const ids = WORLD_SIZES.map((o) => o.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (let i = 1; i < WORLD_SIZES.length; i++) {
      expect(WORLD_SIZES[i].halfSize).toBeGreaterThan(WORLD_SIZES[i - 1].halfSize)
    }
  })

  it('keeps the default option in step with scene.ts own default', () => {
    expect(DEFAULT_WORLD_SIZE.halfSize).toBe(DEFAULT_HALF_SIZE)
  })
})
