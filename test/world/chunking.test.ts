import {
  CHUNK_SIZE, chunkCoordAt, chunkOrigin, chunkSeed, chunksInRadius, chunkKey,
} from '../../src/world/chunking'

describe('chunkCoordAt', () => {
  it('puts the world origin in chunk (0, 0)', () => {
    expect(chunkCoordAt(0, 0)).toEqual({ cx: 0, cz: 0 })
  })

  it('floors toward negative infinity, not toward zero', () => {
    expect(chunkCoordAt(-1, -1, 200)).toEqual({ cx: -1, cz: -1 })
    expect(chunkCoordAt(-200.001, 0, 200)).toEqual({ cx: -2, cz: 0 })
  })

  it('is exact at a chunk boundary', () => {
    expect(chunkCoordAt(200, 0, 200)).toEqual({ cx: 1, cz: 0 })
  })

  it('stays in the same chunk anywhere strictly inside it', () => {
    expect(chunkCoordAt(150, 150, 200)).toEqual({ cx: 0, cz: 0 })
  })
})

describe('chunkOrigin', () => {
  it('is the centre of chunk (0, 0)', () => {
    expect(chunkOrigin({ cx: 0, cz: 0 }, 200)).toEqual({ x: 100, z: 100 })
  })

  it('is the centre of a negative chunk', () => {
    expect(chunkOrigin({ cx: -1, cz: -1 }, 200)).toEqual({ x: -100, z: -100 })
  })

  it('round-trips with chunkCoordAt: the origin is always inside its own chunk', () => {
    const coord = { cx: 3, cz: -5 }
    const { x, z } = chunkOrigin(coord, 200)
    expect(chunkCoordAt(x, z, 200)).toEqual(coord)
  })
})

describe('chunkSeed', () => {
  it('is deterministic for the same chunk and world seed', () => {
    expect(chunkSeed({ cx: 2, cz: -3 }, 42)).toBe(chunkSeed({ cx: 2, cz: -3 }, 42))
  })

  it('differs between neighbouring chunks', () => {
    expect(chunkSeed({ cx: 0, cz: 0 }, 42)).not.toBe(chunkSeed({ cx: 1, cz: 0 }, 42))
  })

  it('differs between two world seeds for the same chunk', () => {
    expect(chunkSeed({ cx: 0, cz: 0 }, 1)).not.toBe(chunkSeed({ cx: 0, cz: 0 }, 2))
  })
})

describe('chunksInRadius', () => {
  it('gives just the centre chunk at radius 0', () => {
    expect(chunksInRadius({ cx: 5, cz: 5 }, 0)).toEqual([{ cx: 5, cz: 5 }])
  })

  it('gives a (2r+1)² square', () => {
    expect(chunksInRadius({ cx: 0, cz: 0 }, 1)).toHaveLength(9)
    expect(chunksInRadius({ cx: 0, cz: 0 }, 2)).toHaveLength(25)
  })

  it('is centred on the given chunk', () => {
    const list = chunksInRadius({ cx: 0, cz: 0 }, 1)
    expect(list).toContainEqual({ cx: -1, cz: -1 })
    expect(list).toContainEqual({ cx: 1, cz: 1 })
    expect(list).toContainEqual({ cx: 0, cz: 0 })
  })
})

describe('chunkKey', () => {
  it('is unique per coordinate and stable', () => {
    expect(chunkKey({ cx: 1, cz: -2 })).toBe(chunkKey({ cx: 1, cz: -2 }))
    expect(chunkKey({ cx: 1, cz: -2 })).not.toBe(chunkKey({ cx: -1, cz: 2 }))
  })
})

describe('CHUNK_SIZE', () => {
  it('is comfortably larger than the fog draw distance (140m, game/scene.ts)', () => {
    expect(CHUNK_SIZE).toBeGreaterThan(140)
  })
})
