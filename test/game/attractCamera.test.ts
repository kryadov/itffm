import { attractOrbitPose } from '../../src/game/attractCamera'

describe('attractOrbitPose', () => {
  it('stays a fixed radius and height from the centre throughout the loop', () => {
    const centerX = 12
    const centerZ = -7
    const radius = 26
    const height = 22
    for (let t = 0; t < 20; t += 0.37) {
      const p = attractOrbitPose(t, centerX, centerZ, radius, height, 8, 0.1)
      const d = Math.hypot(p.x - centerX, p.z - centerZ)
      expect(d).toBeCloseTo(radius, 6)
      expect(p.y).toBe(height)
    }
  })

  it('always looks at the same point above the centre', () => {
    for (let t = 0; t < 20; t += 1.1) {
      const p = attractOrbitPose(t, 5, 5, 20, 15, 9, 0.2)
      expect(p.lookX).toBe(5)
      expect(p.lookZ).toBe(5)
      expect(p.lookY).toBe(9)
    }
  })

  it('is periodic: one full turn returns to the same position', () => {
    const angularSpeed = 0.15
    const period = (2 * Math.PI) / angularSpeed
    const a = attractOrbitPose(3, 0, 0, 20, 15, 9, angularSpeed)
    const b = attractOrbitPose(3 + period, 0, 0, 20, 15, 9, angularSpeed)
    expect(a.x).toBeCloseTo(b.x, 6)
    expect(a.z).toBeCloseTo(b.z, 6)
  })

  it('is deterministic for the same t', () => {
    const a = attractOrbitPose(4.2, 1, 2, 20, 15, 9, 0.12)
    const b = attractOrbitPose(4.2, 1, 2, 20, 15, 9, 0.12)
    expect(a).toEqual(b)
  })
})
