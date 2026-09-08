import { isClearing } from '../../src/world/clearings'

describe('isClearing', () => {
  it('is deterministic', () => {
    expect(isClearing(12, -34, 7)).toBe(isClearing(12, -34, 7))
  })

  it('gives both clearing and wood over a spread of points', () => {
    let open = 0
    let closed = 0
    for (let x = -90; x <= 90; x += 5) {
      for (let z = -90; z <= 90; z += 5) {
        if (isClearing(x, z, 7)) open++
        else closed++
      }
    }
    expect(open).toBeGreaterThan(0)
    expect(closed).toBeGreaterThan(0)
  })

  it('draws a different shape for a different seed', () => {
    const sample = (seed: number): boolean[] => {
      const out: boolean[] = []
      for (let x = -90; x <= 90; x += 6) {
        for (let z = -90; z <= 90; z += 6) out.push(isClearing(x, z, seed))
      }
      return out
    }
    expect(sample(1)).not.toEqual(sample(2))
  })
})
