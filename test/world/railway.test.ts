import * as THREE from 'three'
import { placeRailLine, railHeightAt, stepTrainT, createTrain, buildRailMesh } from '../../src/world/railway'
import { proceduralTerrain } from '../../src/terrain/procedural'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 0 }

describe('placeRailLine', () => {
  it('is deterministic for the same seed', () => {
    expect(placeRailLine(flat, 90, 5)).toEqual(placeRailLine(flat, 90, 5))
  })

  it('gives a different line for a different seed', () => {
    const a = placeRailLine(flat, 90, 1)
    const b = placeRailLine(flat, 90, 2)
    expect(a.points[0].z).not.toBe(b.points[0].z)
  })

  it('spans most of the plot, well within its bounds', () => {
    const line = placeRailLine(flat, 90, 3)
    const xs = line.points.map((p) => p.x)
    expect(Math.min(...xs)).toBeGreaterThan(-90)
    expect(Math.max(...xs)).toBeLessThan(90)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(90) // more than half the plot's own width
  })

  it('runs at a fixed offset from the centre, not through it', () => {
    const line = placeRailLine(flat, 90, 3)
    const z = line.points[0].z
    expect(Math.abs(z)).toBeGreaterThan(90 * 0.4)
    for (const p of line.points) expect(p.z).toBe(z)
  })

  it('follows the real ground height at each point along it', () => {
    const slope: ElevationProvider = { heightAt: (x) => x * 0.1 }
    const line = placeRailLine(slope, 90, 3)
    for (const p of line.points) expect(p.y).toBeCloseTo(slope.heightAt(p.x, p.z), 5)
  })

  it('samples densely enough that the interpolated line never strays far from ' +
     'the real ground between two sample points — a live report found rails ' +
     'visibly sagging or floating on real, bumpy procedural terrain', () => {
    // Several seeds/sizes, not just one — a single lucky seed could hide a
    // sampling gap that a bumpier terrain or a longer line exposes.
    for (const seed of [3, 7, 11, 19]) {
      for (const halfSize of [60, 90, 150]) {
        const ground = proceduralTerrain(seed)
        const line = placeRailLine(ground, halfSize, seed)
        const x0 = line.points[0].x
        const x1 = line.points[line.points.length - 1].x
        const z = line.points[0].z
        // Probe far more finely than the line's own samples — this is exactly
        // the gap a sparse line hides (railHeightAt only ever gets checked
        // exactly at its own sample points otherwise).
        for (let x = x0; x <= x1; x += 0.5) {
          const err = Math.abs(railHeightAt(line, x) - ground.heightAt(x, z))
          // A rail sitting 8cm above the sleepers (RAIL_HEIGHT) already reads
          // as floating or sunk well before this — a generous ceiling, not a
          // tight tolerance, but well below what 12 fixed samples over a
          // 100-270m line actually produced (measured up to ~0.9m).
          expect(err).toBeLessThan(0.2)
        }
      }
    }
  })
})

describe('railHeightAt', () => {
  it('matches an endpoint exactly', () => {
    const line = placeRailLine(flat, 90, 3)
    const first = line.points[0]
    expect(railHeightAt(line, first.x)).toBeCloseTo(first.y, 5)
  })

  it('interpolates between two points on a slope', () => {
    const slope: ElevationProvider = { heightAt: (x) => x * 0.2 }
    const line = placeRailLine(slope, 90, 3)
    const mid = (line.points[0].x + line.points[1].x) / 2
    expect(railHeightAt(line, mid)).toBeCloseTo(slope.heightAt(mid, line.points[0].z), 2)
  })
})

describe('stepTrainT', () => {
  it('advances t forward while heading the same direction', () => {
    const { t } = stepTrainT(0.5, 1, 1, 2, 100)
    expect(t).toBeGreaterThan(0.5)
  })

  it('bounces off the far end instead of running past it', () => {
    const { t, dir } = stepTrainT(0.99, 1, 1, 2, 10)
    expect(t).toBeLessThanOrEqual(1)
    expect(dir).toBe(-1)
  })

  it('bounces off the near end the same way', () => {
    const { t, dir } = stepTrainT(0.01, -1, 1, 2, 10)
    expect(t).toBeGreaterThanOrEqual(0)
    expect(dir).toBe(1)
  })
})

describe('buildRailMesh', () => {
  it('follows a real slope at both ends, not just at its own midpoint', () => {
    // Live report: the rails read as detached from their sleepers and the
    // ground. Root cause was a single rigid box per rail, spanning the
    // whole line at ONE height sampled at the midpoint — dead flat on any
    // real slope. Each rail is now a chain of segments; check both ends
    // actually sit near the real ground there, not near the midpoint's own
    // height.
    const slope: ElevationProvider = { heightAt: (x) => x * 0.3 }
    const line = placeRailLine(slope, 90, 3)
    const group = buildRailMesh(line)
    const rail = group.children.find((c) => c instanceof THREE.Mesh && (c as THREE.Mesh).geometry.type !== 'BoxGeometry') as THREE.Mesh
    expect(rail).toBeTruthy()
    const box = new THREE.Box3().setFromObject(rail)
    const x0 = line.points[0].x
    const x1 = line.points[line.points.length - 1].x
    const groundAtStart = slope.heightAt(x0, line.points[0].z)
    const groundAtEnd = slope.heightAt(x1, line.points[0].z)
    // The whole-line box bug would have put EVERY vertex near the midpoint's
    // height, off by roughly half the slope's total rise across the line —
    // several metres here. A ground-following rail keeps its overall
    // vertical span close to the real rise, not flattened to nothing.
    expect(box.max.y - box.min.y).toBeGreaterThan(Math.abs(groundAtEnd - groundAtStart) * 0.8)
  })
})

describe('createTrain', () => {
  function build(seed: number) {
    const scene = new THREE.Scene()
    const line = placeRailLine(flat, 90, seed)
    const train = createTrain(scene, line, seed)
    return { scene, train }
  }

  it('adds one named group to the scene', () => {
    const { scene } = build(1)
    expect(scene.getObjectByName('train')).toBeDefined()
  })

  it('keeps every car at a finite position after a long run', () => {
    const { scene, train } = build(2)
    for (let i = 0; i < 3000; i++) train.update(1 / 20)
    const group = scene.getObjectByName('train')!
    for (const car of group.children) {
      expect(Number.isFinite(car.position.x)).toBe(true)
      expect(Number.isFinite(car.position.y)).toBe(true)
      expect(Number.isFinite(car.position.z)).toBe(true)
    }
  })

  it('never carries a car past either end of the line', () => {
    const { scene, train } = build(3)
    const line = placeRailLine(flat, 90, 3)
    const xs = line.points.map((p) => p.x)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    for (let i = 0; i < 3000; i++) {
      train.update(1 / 20)
      const group = scene.getObjectByName('train')!
      for (const car of group.children) {
        expect(car.position.x).toBeGreaterThanOrEqual(minX - 1)
        expect(car.position.x).toBeLessThanOrEqual(maxX + 1)
      }
    }
  })

  it('is deterministic: the same seed gives the same wagon colours', () => {
    const a = build(4)
    const b = build(4)
    const wagonA = a.scene.getObjectByName('train')!.children[1].getObjectByName('body') as THREE.Mesh
    const wagonB = b.scene.getObjectByName('train')!.children[1].getObjectByName('body') as THREE.Mesh
    expect((wagonA.material as THREE.MeshStandardMaterial).color.getHex())
      .toBe((wagonB.material as THREE.MeshStandardMaterial).color.getHex())
  })

  it('sits still at the station for a while after reaching the end of the line, instead of bouncing straight back', () => {
    const { scene, train } = build(9)
    const group = scene.getObjectByName('train')!
    const headX = () => group.children[0].position.x
    // Run until the head actually reaches an end (stops changing frame to
    // frame) — worst case one full one-way trip, comfortably inside 200s.
    let prev = headX()
    let arrivedAt = -1
    for (let i = 0; i < 200; i++) {
      train.update(1)
      const now = headX()
      if (now === prev) {
        arrivedAt = i
        break
      }
      prev = now
    }
    expect(arrivedAt).toBeGreaterThanOrEqual(0)
    // Held there for a real stretch, not released the very next frame — the
    // shortest roll in STATION_DWELL_RANGE is 60s.
    for (let i = 0; i < 50; i++) {
      train.update(1)
      expect(headX()).toBe(prev)
    }
  })

  it('leads with a locomotive, distinct from the wagons behind it', () => {
    const { scene } = build(6)
    const group = scene.getObjectByName('train')!
    expect(group.children[0].name).toBe('locomotive')
    for (let i = 1; i < group.children.length; i++) expect(group.children[i].name).toBe('wagon')
  })

  it('keeps the locomotive always in the lead, whichever way the train is heading', () => {
    const { scene, train } = build(7)
    const group = scene.getObjectByName('train')!
    const headX = () => group.children[0].position.x
    let prevHead = headX()
    let prevDelta = 0
    // Which way the head last actually moved: a train stopped at a station
    // keeps the formation it arrived in, and turns round only as it leaves.
    let heading = 0
    let sawReverse = false
    // A big-ish dt and enough iterations to comfortably clear a full one-way
    // trip plus the train's own station dwell at the far end (up to 120s,
    // see STATION_DWELL_RANGE) and still see it head back the other way —
    // the invariant below holds at any step size, since pose() always
    // recomputes every car's position fresh from the current t/dir.
    for (let i = 0; i < 400; i++) {
      train.update(1)
      const nowHead = headX()
      const delta = nowHead - prevHead
      if (delta !== 0) heading = Math.sign(delta)
      // Whichever way the head last moved, it stays ahead of every wagon.
      for (let c = 1; c < group.children.length; c++) {
        const wagonX = group.children[c].position.x
        if (heading >= 0) expect(wagonX).toBeLessThanOrEqual(nowHead + 1e-6)
        else expect(wagonX).toBeGreaterThanOrEqual(nowHead - 1e-6)
      }
      if (prevDelta !== 0 && delta !== 0 && Math.sign(delta) !== Math.sign(prevDelta)) sawReverse = true
      if (delta !== 0) prevDelta = delta
      prevHead = nowHead
    }
    expect(sawReverse).toBe(true)
  })

  it('keeps every car on the line, and never lets two of them overlap, at either end', () => {
    // A live report (2026-09-19): at the end of the line the wagons piled onto
    // one spot and the train "merged into one car". Big steps so both ends and
    // several turn-arounds are covered.
    for (const seed of [3, 7, 9]) {
      const { scene, train } = build(seed)
      const line = placeRailLine(flat, 90, seed)
      const minX = line.points[0].x
      const maxX = line.points[line.points.length - 1].x
      const cars = scene.getObjectByName('train')!.children
      let stops = 0
      let prevHead = cars[0].position.x
      for (let i = 0; i < 1500; i++) {
        train.update(1)
        const xs = cars.map((c) => c.position.x).sort((a, b) => a - b)
        for (const x of xs) {
          expect(x).toBeGreaterThanOrEqual(minX - 1e-6)
          expect(x).toBeLessThanOrEqual(maxX + 1e-6)
        }
        for (let k = 1; k < xs.length; k++) expect(xs[k] - xs[k - 1]).toBeGreaterThanOrEqual(2.0)
        if (cars[0].position.x === prevHead) stops++
        prevHead = cars[0].position.x
      }
      expect(stops).toBeGreaterThan(0) // it really did reach a station
    }
  })

  it('has wheels on every car, treads on the rail heads', () => {
    const { scene, train } = build(11)
    const line = placeRailLine(flat, 90, 11)
    for (let i = 0; i < 40; i++) train.update(1)
    scene.updateMatrixWorld(true)
    const cars = scene.getObjectByName('train')!.children
    for (const car of cars) {
      const wheels = car.children.filter((c) => c.name === 'wheel')
      expect(wheels.length).toBeGreaterThanOrEqual(4)
      const box = new THREE.Box3()
      for (const w of wheels) box.expandByObject(w)
      // Flat ground at 0: the rail head is RAIL_HEIGHT (0.08) up.
      expect(box.min.y).toBeCloseTo(0.08, 2)
      // One wheel on each rail: across the car's width, the gauge apart.
      const zs = wheels.map((w) => Math.round(w.getWorldPosition(new THREE.Vector3()).z * 100) / 100)
      expect(new Set(zs).size).toBe(2)
      expect(Math.abs(Math.max(...zs) - Math.min(...zs))).toBeCloseTo(0.7, 2)
      // ...and the body sits on them, not through them.
      const body = car.getObjectByName('body')!
      const bodyBottom = new THREE.Box3().setFromObject(body).min.y
      expect(bodyBottom).toBeGreaterThanOrEqual(box.max.y - 1e-6)
    }
    expect(line.points.length).toBeGreaterThan(0)
  })

  it('the locomotive carries a headlight, off by day and lit at night', () => {
    const { scene, train } = build(8)
    const loco = scene.getObjectByName('train')!.getObjectByName('locomotive')!
    let light: THREE.SpotLight | undefined
    loco.traverse((o) => {
      if (o instanceof THREE.SpotLight) light = o
    })
    expect(light).toBeDefined()
    train.setNight(0)
    expect(light!.visible).toBe(false)
    train.setNight(1)
    expect(light!.visible).toBe(true)
    expect(light!.intensity).toBeGreaterThan(0)
  })

  it('every wagon\'s windows glow at night, dark by day', () => {
    const { scene, train } = build(9)
    const group = scene.getObjectByName('train')!
    const windows = group.children
      .filter((c) => c.name === 'wagon')
      .flatMap((wagon) => wagon.children.filter((c) => c.name === 'window'))
    expect(windows.length).toBeGreaterThan(0)
    train.setNight(0)
    for (const w of windows) expect(((w as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity).toBe(0)
    train.setNight(1)
    for (const w of windows) {
      expect(((w as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0)
    }
  })

  it('puffs smoke from the locomotive\'s stack without throwing', () => {
    const { train } = build(10)
    expect(() => {
      for (let i = 0; i < 60; i++) train.update(1 / 20)
    }).not.toThrow()
  })

  it('disposes cleanly', () => {
    const { scene, train } = build(5)
    train.dispose()
    expect(scene.getObjectByName('train')).toBeUndefined()
  })
})
