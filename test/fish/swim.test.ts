import { swimPose, SWIM_MAX_ROAM } from '../../src/fish/swim'

const home = { x: 10, z: -4, roam: 1, seed: 1234 }

describe('swimPose', () => {
  it('is deterministic: one fish, one moment, one pose', () => {
    expect(swimPose(home, 12.5)).toEqual(swimPose(home, 12.5))
  })

  it('never leaves the circle it was given', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (let t = 0; t < 120; t += 0.37) {
        const p = swimPose({ ...home, seed }, t)
        expect(Math.hypot(p.x - home.x, p.z - home.z)).toBeLessThanOrEqual(home.roam + 1e-9)
      }
    }
  })

  it('actually swims: it covers real ground over a few seconds', () => {
    for (let seed = 0; seed < 10; seed++) {
      let far = 0
      const start = swimPose({ ...home, seed }, 0)
      for (let t = 0; t < 20; t += 0.5) {
        const p = swimPose({ ...home, seed }, t)
        far = Math.max(far, Math.hypot(p.x - start.x, p.z - start.z))
      }
      expect(far).toBeGreaterThan(home.roam * 0.5)
    }
  })

  it('goes head first: its head (local −x, turned by heading) points the way it moves', () => {
    let agree = 0
    let total = 0
    for (let t = 0; t < 30; t += 0.9) {
      const a = swimPose(home, t)
      const b = swimPose(home, t + 0.02)
      const vx = b.x - a.x
      const vz = b.z - a.z
      if (Math.hypot(vx, vz) < 1e-5) continue
      // THREE's rotation about +y takes local (−1, 0, 0) to (−cos h, 0, sin h).
      const hx = -Math.cos(a.heading)
      const hz = Math.sin(a.heading)
      if ((hx * vx + hz * vz) / Math.hypot(vx, vz) > 0.8) agree++
      total++
    }
    expect(agree / total).toBeGreaterThan(0.9)
  })

  it('stays put, only turning a little, with no room to swim', () => {
    const p0 = swimPose({ ...home, roam: 0 }, 0)
    const p1 = swimPose({ ...home, roam: 0 }, 7)
    expect(p1.x).toBe(home.x)
    expect(p1.z).toBe(home.z)
    expect(Number.isFinite(p0.heading + p1.heading)).toBe(true)
  })

  it('has a sensible cap on how far any fish roams', () => {
    expect(SWIM_MAX_ROAM).toBeGreaterThan(0.5)
    expect(SWIM_MAX_ROAM).toBeLessThan(3)
  })
})
