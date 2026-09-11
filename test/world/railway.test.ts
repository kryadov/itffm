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

  it('is deterministic: the same seed gives the same car colour', () => {
    const a = build(4)
    const b = build(4)
    const carA = a.scene.getObjectByName('train')!.children[0] as THREE.Mesh
    const carB = b.scene.getObjectByName('train')!.children[0] as THREE.Mesh
    expect((carA.material as THREE.MeshStandardMaterial).color.getHex())
      .toBe((carB.material as THREE.MeshStandardMaterial).color.getHex())
  })

  it('disposes cleanly', () => {
    const { scene, train } = build(5)
    train.dispose()
    expect(scene.getObjectByName('train')).toBeUndefined()
  })
})
