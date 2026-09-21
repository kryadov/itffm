import * as THREE from 'three'
import { placeRailLine, stationsFor, lineLength, pointAt, TRAIN_CARS, PORTAL_MOUTH, type RailLine } from '../../src/world/railway'
import { createTrain } from '../../src/world/train'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 0 }

function build(seed: number, ground: ElevationProvider = flat) {
  const scene = new THREE.Scene()
  const line = placeRailLine(ground, 90, seed)
  const train = createTrain(scene, line, seed)
  const cars = scene.getObjectByName('train')!.children.slice(0, TRAIN_CARS)
  return { scene, line, train, cars }
}

/** Arc distance of a point along the line, nearest sample. */
function along(line: RailLine, x: number, z: number): number {
  const len = lineLength(line)
  let best = 0
  let bestD = Infinity
  for (let s = -5; s <= len + 5; s += 0.25) {
    const p = pointAt(line, s)
    const d = Math.hypot(p.x - x, p.z - z)
    if (d < bestD) { bestD = d; best = s }
  }
  return best
}

describe('createTrain', () => {
  it('adds one named group to the scene, with a locomotive and five wagons', () => {
    const { scene, cars } = build(1)
    expect(scene.getObjectByName('train')).toBeDefined()
    expect(cars).toHaveLength(6)
    expect(cars[0].name).toBe('locomotive')
    for (const c of cars.slice(1)) expect(c.name).toBe('wagon')
  })

  it('is deterministic: the same seed gives the same wagon colours and the same start', () => {
    const a = build(4)
    const b = build(4)
    const colours = (cars: THREE.Object3D[]) =>
      cars.slice(1).map((c) => {
        const body = c.getObjectByName('body') as THREE.Mesh
        return (body.material as THREE.MeshStandardMaterial).color.getHex()
      })
    expect(colours(a.cars)).toEqual(colours(b.cars))
    for (let i = 0; i < a.cars.length; i++) expect(a.cars[i].position.toArray()).toEqual(b.cars[i].position.toArray())
  })

  it('keeps every car at a finite position after a long run', () => {
    const { train, cars } = build(2)
    for (let i = 0; i < 4000; i++) train.update(0.5)
    for (const c of cars) {
      expect(Number.isFinite(c.position.x)).toBe(true)
      expect(Number.isFinite(c.position.y)).toBe(true)
      expect(Number.isFinite(c.position.z)).toBe(true)
    }
  })

  it('runs through both tunnels and out of sight, and back', () => {
    const { train, cars } = build(3)
    let hiddenSpells = 0
    let wasHidden = false
    let sawAllVisible = false
    for (let i = 0; i < 6000; i++) {
      train.update(0.5)
      const anyVisible = cars.some((c) => c.visible)
      if (!anyVisible && !wasHidden) hiddenSpells++
      wasHidden = !anyVisible
      if (cars.every((c) => c.visible)) sawAllVisible = true
    }
    expect(hiddenSpells).toBeGreaterThanOrEqual(2) // in at one end, in at the other
    expect(sawAllVisible).toBe(true)
  })

  it('stays out of sight only while it is in a tunnel: a visible car is never far past a mouth', () => {
    const { line, train, cars } = build(5)
    const len = lineLength(line)
    for (let i = 0; i < 2000; i++) {
      train.update(0.5)
      for (const c of cars) {
        if (!c.visible) continue
        const s = along(line, c.position.x, c.position.z)
        expect(s).toBeGreaterThan(PORTAL_MOUTH - 3)
        expect(s).toBeLessThan(len - PORTAL_MOUTH + 3)
      }
    }
  }, 60000)

  it('follows the line: cars sit on the rails, round the bends', () => {
    const { line, train, cars } = build(6)
    for (let i = 0; i < 1000; i++) {
      train.update(0.5)
      for (const c of cars) {
        if (!c.visible) continue
        const p = pointAt(line, along(line, c.position.x, c.position.z))
        expect(Math.hypot(p.x - c.position.x, p.z - c.position.z)).toBeLessThan(0.5)
      }
    }
  }, 60000)

  it('keeps the locomotive in the lead, whichever way it runs', () => {
    const { line, train, cars } = build(7)
    let ahead = 0
    let behind = 0
    let prev = along(line, cars[0].position.x, cars[0].position.z)
    for (let i = 0; i < 1500; i++) {
      train.update(0.5)
      if (!cars.every((c) => c.visible)) continue
      const s0 = along(line, cars[0].position.x, cars[0].position.z)
      const sLast = along(line, cars[5].position.x, cars[5].position.z)
      const moving = s0 - prev
      prev = s0
      if (Math.abs(moving) < 0.5) continue
      if ((s0 - sLast) * moving > 0) ahead++
      else behind++
    }
    expect(ahead).toBeGreaterThan(0)
    expect(behind).toBe(0)
  }, 60000)

  it('never lets two cars overlap', () => {
    const { train, cars } = build(8)
    for (let i = 0; i < 2000; i++) {
      train.update(0.5)
      if (!cars.every((c) => c.visible)) continue
      for (let k = 1; k < cars.length; k++) {
        expect(cars[k].position.distanceTo(cars[k - 1].position)).toBeGreaterThan(2.0)
      }
    }
  })

  it('has wheels on every car, and they turn as the train moves', () => {
    const { train, cars } = build(3)
    for (const car of cars) expect(car.children.filter((c) => c.name === 'wheel')).toHaveLength(4)
    const wheel = cars[0].children.find((c) => c.name === 'wheel')!
    let moved = false
    let last = wheel.rotation.z
    for (let i = 0; i < 400; i++) {
      train.update(0.25)
      if (wheel.rotation.z !== last) moved = true
      last = wheel.rotation.z
    }
    expect(moved).toBe(true)
  })

  it('leans into a bend, and stays level on the straight', () => {
    const { line, train, cars } = build(2)
    const len = lineLength(line)
    let maxRoll = 0
    let straightRoll = 0
    for (let i = 0; i < 3000; i++) {
      train.update(0.25)
      if (!cars[2].visible) continue
      const s = along(line, cars[2].position.x, cars[2].position.z)
      const roll = Math.abs(cars[2].rotation.x)
      maxRoll = Math.max(maxRoll, roll)
      if (s < 30 || s > len - 30) straightRoll = Math.max(straightRoll, roll)
    }
    expect(maxRoll).toBeGreaterThan(0.01) // a visible lean...
    expect(maxRoll).toBeLessThan(0.1) // ...not a capsize
    expect(straightRoll).toBeLessThan(0.005)
  }, 60000)

  it('follows the slope: the nose is up on a climb', () => {
    const slope: ElevationProvider = { heightAt: (x, z) => 0.08 * (x + z) }
    const { train, cars } = build(3, slope)
    let checked = 0
    for (let i = 0; i < 1000; i++) {
      train.update(0.5)
      if (!cars[0].visible) continue
      const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(cars[0].quaternion)
      const flatLen = Math.hypot(forward.x, forward.z)
      const expected = (0.08 * (forward.x + forward.z)) / flatLen
      expect(forward.y / flatLen).toBeCloseTo(expected, 1)
      checked++
    }
    expect(checked).toBeGreaterThan(100)
  })

  it('the locomotive has windows, a bumper and a headlight, and is not a plain box', () => {
    const { cars } = build(1)
    const loco = cars[0]
    expect(loco.children.filter((c) => c.name === 'window').length).toBeGreaterThanOrEqual(4)
    expect(loco.getObjectByName('bumper')).toBeDefined()
    expect(loco.getObjectByName('headlightGlow')).toBeDefined()
    // taller at the back (the cab) than at the front (the bonnet)
    loco.updateMatrixWorld(true)
    const cab = new THREE.Box3().setFromObject(loco.getObjectByName('cab')!)
    const bonnet = new THREE.Box3().setFromObject(loco.getObjectByName('bonnet')!)
    expect(cab.max.y).toBeGreaterThan(bonnet.max.y + 0.4)
    expect(bonnet.max.x).toBeGreaterThan(cab.max.x)
  })

  it('has windows that glow at night, dark by day, and a headlight that lights at night', () => {
    const { scene, train } = build(3)
    const windows: THREE.Mesh[] = []
    scene.traverse((o) => { if (o.name === 'window') windows.push(o as THREE.Mesh) })
    expect(windows.length).toBeGreaterThanOrEqual(10)
    const mat = windows[0].material as THREE.MeshStandardMaterial
    train.setNight(0)
    expect(mat.emissiveIntensity).toBe(0)
    train.setNight(1)
    expect(mat.emissiveIntensity).toBeGreaterThan(0)
    const lights: THREE.SpotLight[] = []
    scene.traverse((o) => { if (o instanceof THREE.SpotLight) lights.push(o) })
    expect(lights[0].visible).toBe(true)
    train.setNight(0)
    expect(lights[0].visible).toBe(false)
  })

  it('puffs smoke without throwing, and disposes cleanly', () => {
    const { scene, train } = build(1)
    expect(() => { for (let i = 0; i < 100; i++) train.update(0.1) }).not.toThrow()
    train.dispose()
    expect(scene.getObjectByName('train')).toBeUndefined()
  })

  describe('stopped()', () => {
    it('is null while the train is moving and says which end it is standing at during its dwell', () => {
      const { train } = build(3)
      const seen = new Set<number>()
      let sawMoving = false
      for (let i = 0; i < 6000; i++) {
        train.update(0.5)
        const st = train.stopped()
        if (st) seen.add(st.end)
        else sawMoving = true
      }
      expect([...seen].sort()).toEqual([0, 1])
      expect(sawMoving).toBe(true)
    })

    it('stops at each platform with every car alongside it, in either direction', () => {
      for (const seed of [3, 7, 9, 12]) {
        const { line, train } = build(seed)
        const stations = stationsFor(line)
        const stoppedAt = new Set<number>()
        for (let i = 0; i < 4000; i++) {
          train.update(0.5)
          const st = train.stopped()
          if (!st) continue
          const s = stations[st.end]
          for (const c of st.cars) {
            const a = along(line, c.x, c.z)
            expect(a - 1.05, `seed ${seed}: car at ${a.toFixed(1)}`).toBeGreaterThanOrEqual(s.s0 - 0.3)
            expect(a + 1.05).toBeLessThanOrEqual(s.s1 + 0.3)
          }
          stoppedAt.add(st.end)
        }
        expect([...stoppedAt].sort()).toEqual([0, 1])
      }
    }, 120000)

    it('reports the cars exactly where they are', () => {
      const { train, cars } = build(4)
      let checked = 0
      for (let i = 0; i < 3000 && checked < 5; i++) {
        train.update(0.5)
        const st = train.stopped()
        if (!st) continue
        expect(st.cars.map((c) => c.x)).toEqual(cars.map((c) => c.position.x))
        checked++
      }
      expect(checked).toBe(5)
    })

    it('waits a good while at a platform', () => {
      const { train } = build(3)
      let longest = 0
      let run = 0
      for (let i = 0; i < 6000; i++) {
        train.update(0.5)
        if (train.stopped()) run += 0.5
        else { longest = Math.max(longest, run); run = 0 }
      }
      expect(longest).toBeGreaterThanOrEqual(40)
    })
  })

  describe('departSoon()', () => {
    it('gets a standing train moving within a few seconds', () => {
      const { train } = build(3)
      let guard = 0
      while (!train.stopped() && guard++ < 6000) train.update(0.5)
      expect(train.stopped()).not.toBeNull()
      train.departSoon(3)
      let waited = 0
      while (train.stopped() && waited < 30) { train.update(0.5); waited += 0.5 }
      expect(train.stopped()).toBeNull()
      expect(waited).toBeLessThanOrEqual(4)
    })
  })

  describe('locomotive()', () => {
    it('gives the locomotive while it is out in the open, and null in a tunnel', () => {
      const { train, cars } = build(3)
      let inTunnel = 0
      let outside = 0
      for (let i = 0; i < 6000; i++) {
        train.update(0.5)
        const l = train.locomotive()
        if (l) {
          outside++
          expect(l.x).toBeCloseTo(cars[0].position.x, 6)
          expect(l.z).toBeCloseTo(cars[0].position.z, 6)
        } else inTunnel++
      }
      expect(inTunnel).toBeGreaterThan(0)
      expect(outside).toBeGreaterThan(0)
    })
  })
})
