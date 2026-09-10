import { birdPan, birdGain, nearestBird } from '../../src/audio/birdCalls'

describe('birdPan', () => {
  it('is 0 when the bird is straight ahead', () => {
    // Facing yaw 0, forward is (-sin(0), -cos(0)) = (0, -1) — a bird due -z.
    expect(birdPan(0, 0, 0, 0, -10)).toBeCloseTo(0, 5)
  })

  it('is positive when the bird is to the right', () => {
    // Facing yaw 0, right is (cos(0), -sin(0)) = (1, 0) — a bird due +x.
    expect(birdPan(0, 0, 0, 10, 0)).toBeGreaterThan(0)
  })

  it('is negative when the bird is to the left', () => {
    expect(birdPan(0, 0, 0, -10, 0)).toBeLessThan(0)
  })

  it('stays within [-1, 1] regardless of distance', () => {
    for (const [bx, bz] of [[100, 3], [1, 100], [-50, -50]] as const) {
      const p = birdPan(0, 0, 0.7, bx, bz)
      expect(p).toBeGreaterThanOrEqual(-1)
      expect(p).toBeLessThanOrEqual(1)
    }
  })

  it('rotates with the player\'s own facing', () => {
    // A bird due +x reads centre-right at yaw 0, but dead ahead once the
    // player turns a quarter turn to face +x.
    const facingX = -Math.PI / 2 // forward = (-sin, -cos) = (1, 0) at this yaw
    expect(birdPan(0, 0, facingX, 10, 0)).toBeCloseTo(0, 1)
  })
})

describe('birdGain', () => {
  it('is loudest at zero distance', () => {
    expect(birdGain(0, 60)).toBeCloseTo(1, 5)
  })

  it('fades to silence at maxDist', () => {
    expect(birdGain(60, 60)).toBeCloseTo(0, 5)
  })

  it('is monotonically quieter further away', () => {
    expect(birdGain(10, 60)).toBeGreaterThan(birdGain(30, 60))
    expect(birdGain(30, 60)).toBeGreaterThan(birdGain(50, 60))
  })

  it('never goes negative past maxDist', () => {
    expect(birdGain(1000, 60)).toBe(0)
  })
})

describe('nearestBird', () => {
  const birds = [
    { x: 5, y: 20, z: 0 },
    { x: -30, y: 22, z: 10 },
    { x: 200, y: 25, z: 0 },
  ]

  it('picks the closest bird within range', () => {
    expect(nearestBird(birds, 0, 0, 60)).toEqual(birds[0])
  })

  it('returns null when nothing is in range', () => {
    expect(nearestBird(birds, 1000, 1000, 60)).toBeNull()
  })

  it('returns null for an empty flock', () => {
    expect(nearestBird([], 0, 0, 60)).toBeNull()
  })
})
