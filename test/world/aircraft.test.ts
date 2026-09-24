import * as THREE from 'three'
import { createAircraft, AIRCRAFT_PROFILES, AIRCRAFT_SPAN } from '../../src/world/aircraft'
import { mulberry32 } from '../../src/util/rng'

/** Every userData tag of one kind found under an object, itself included. */
function tags(o: THREE.Object3D, key: 'rotor' | 'navLight'): THREE.Object3D[] {
  const out: THREE.Object3D[] = []
  o.traverse((c) => {
    if ((c.userData as Record<string, unknown>)[key]) out.push(c)
  })
  return out
}

const visibleFrame = (g: THREE.Group) => g.children.find((f) => f.visible)

describe('aircraft', () => {
  it('builds a helicopter that still exposes a spinnable main and tail rotor', () => {
    const a = createAircraft(new THREE.Scene(), mulberry32(1))
    const heli = a.group.children.find((f) => {
      const r = tags(f, 'rotor').map((o) => o.userData.rotor)
      return r.includes('main') && r.includes('tail')
    })
    expect(heli).toBeDefined()
  })

  it('sends something over within a couple of minutes, and spins its rotors or props', () => {
    const a = createAircraft(new THREE.Scene(), mulberry32(3))
    for (let i = 0; i < 120 && !visibleFrame(a.group); i++) a.update(1, 0, 0, 0, false)
    const f = visibleFrame(a.group)
    expect(f).toBeDefined()
    const spinning = tags(f!, 'rotor')
    const before = spinning.map((o) => o.rotation.x + o.rotation.y)
    a.update(0.1, 0, 0, 0, false)
    spinning.forEach((o, i) => expect(o.rotation.x + o.rotation.y).not.toBe(before[i]))
  })

  it('is deterministic: one seed, one sky', () => {
    const run = () => {
      const a = createAircraft(new THREE.Scene(), mulberry32(9))
      const seen: string[] = []
      for (let i = 0; i < 600; i++) {
        a.update(1, 0, 0, 0, false)
        const f = visibleFrame(a.group)
        if (f) seen.push(`${f.position.x.toFixed(1)},${f.position.z.toFixed(1)}`)
      }
      return seen
    }
    expect(run()).toEqual(run())
  })

  it('stays inside the sky dome (1500 m) the whole way across', () => {
    for (const p of Object.values(AIRCRAFT_PROFILES)) {
      const far = Math.hypot(AIRCRAFT_SPAN / 2, 900 / 2, p.alt + 8)
      expect(far).toBeLessThan(1500)
    }
  })

  it('flies above the trees, and the low fliers under the clouds (70 m up)', () => {
    for (const p of Object.values(AIRCRAFT_PROFILES)) expect(p.alt).toBeGreaterThan(40)
    for (const k of ['helicopter', 'biplane', 'balloon'] as const) expect(AIRCRAFT_PROFILES[k].alt).toBeLessThan(62)
  })

  it('measures its height from the ground under the camera', () => {
    const a = createAircraft(new THREE.Scene(), mulberry32(3))
    a.summon('airliner', 0, 0)
    a.update(0.1, 0, 0, 0, false, 200)
    expect(visibleFrame(a.group)!.position.y).toBeCloseTo(200 + AIRCRAFT_PROFILES.airliner.alt, 3)
  })

  it('shows nothing in fog, but keeps flying out of sight', () => {
    const a = createAircraft(new THREE.Scene(), mulberry32(3))
    for (let i = 0; i < 120 && !visibleFrame(a.group); i++) a.update(1, 0, 0, 0, false)
    const f = visibleFrame(a.group)!
    const x0 = f.position.x
    a.update(1, 0, 0, 0, true)
    expect(visibleFrame(a.group)).toBeUndefined()
    expect(f.position.x).not.toBe(x0)
  })

  it('lights its navigation lights at night only', () => {
    const a = createAircraft(new THREE.Scene(), mulberry32(3))
    for (let i = 0; i < 120 && !visibleFrame(a.group); i++) a.update(1, 0, 0, 0, false)
    const f = visibleFrame(a.group)!
    const lights = tags(f, 'navLight')
    expect(lights.length).toBeGreaterThan(0)
    expect(lights.some((l) => l.visible)).toBe(false)
    let lit = false
    for (let i = 0; i < 20; i++) {
      a.update(0.07, 0, 0, 1, false)
      if (lights.some((l) => l.visible)) lit = true
    }
    expect(lit).toBe(true)
  })
})
