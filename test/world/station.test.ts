import * as THREE from 'three'
import { placeRailLine, createTrain, stationsFor, stationOccupies, RAIL_GAUGE } from '../../src/world/railway'
import { buildStationMesh, STATION_PLATFORM_HEIGHT, STATION_PLATFORM_WIDTH } from '../../src/world/station'
import { proceduralTerrain } from '../../src/terrain/procedural'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 0 }
const bumpy = proceduralTerrain(4)

describe('stationsFor', () => {
  it('gives one station at each end of the line, deterministically', () => {
    const line = placeRailLine(flat, 90, 3)
    const st = stationsFor(line)
    expect(st).toHaveLength(2)
    expect(stationsFor(line)).toEqual(st)
    const [a, b] = st
    expect(a.x1).toBeLessThan(b.x0) // west one entirely before the east one
    expect(a.x0).toBeGreaterThanOrEqual(line.points[0].x)
    expect(b.x1).toBeLessThanOrEqual(line.points[line.points.length - 1].x)
  })

  it('puts the platform on the side of the track that faces the middle of the wood', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const line = placeRailLine(flat, 90, seed)
      for (const s of stationsFor(line)) expect(Math.sign(-s.z) || 1).toBe(s.side)
    }
  })

  it('is long enough for the whole train, with room to spare', () => {
    const line = placeRailLine(flat, 90, 3)
    for (const s of stationsFor(line)) expect(s.x1 - s.x0).toBeGreaterThan(8)
  })
})

describe('the train stops alongside its platform', () => {
  // The train dwells at each end of the line (see createTrain); every car, front
  // to back, must then be inside that station's length — or the platform means
  // nothing (a live request, 2026-09-21: "the stops - platforms - are nowhere").
  for (const seed of [3, 7, 9, 12]) {
    it(`at both ends, on every car (seed ${seed})`, () => {
      const scene = new THREE.Scene()
      const line = placeRailLine(flat, 90, seed)
      const train = createTrain(scene, line, seed)
      const cars = scene.getObjectByName('train')!.children
      const stations = stationsFor(line)
      const stoppedAt = new Set<number>()
      let prev = cars.map((c) => c.position.x)
      for (let i = 0; i < 1400; i++) {
        train.update(1)
        const now = cars.map((c) => c.position.x)
        const stopped = now.every((x, k) => x === prev[k])
        prev = now
        if (!stopped) continue
        const st = stations.findIndex((s) => now.every((x) => x - 1 >= s.x0 - 1e-6 && x + 1 <= s.x1 + 1e-6))
        expect(st, `stopped at ${now.map((x) => x.toFixed(1))} outside every platform`).toBeGreaterThanOrEqual(0)
        stoppedAt.add(st)
      }
      expect([...stoppedAt].sort()).toEqual([0, 1]) // it really did stop at both
    })
  }
})

describe('stationOccupies', () => {
  const line = placeRailLine(flat, 90, 3)
  const [a] = stationsFor(line)
  it('covers the platform, the track beside it and a margin around', () => {
    const mid = (a.x0 + a.x1) / 2
    expect(stationOccupies([a], mid, a.z)).toBe(true)
    expect(stationOccupies([a], mid, a.z + a.side * 2)).toBe(true)
    expect(stationOccupies([a], mid, a.z + a.side * 12)).toBe(false)
    expect(stationOccupies([a], mid, a.z + a.side * 12, 10)).toBe(true)
    expect(stationOccupies([a], a.x0 - 30, a.z)).toBe(false)
  })
})

describe('buildStationMesh', () => {
  const line = placeRailLine(bumpy, 90, 5)
  const stations = stationsFor(line)

  it('builds one named platform per station, following the ground', () => {
    const { group } = buildStationMesh(line, stations, bumpy)
    const platforms = group.children.filter((c) => c.name === 'station')
    expect(platforms).toHaveLength(2)
    group.updateMatrixWorld(true)
    for (const [i, p] of platforms.entries()) {
      const slab = p.getObjectByName('platform')!
      const box = new THREE.Box3().setFromObject(slab)
      const s = stations[i]
      expect(box.min.x).toBeCloseTo(s.x0, 1)
      expect(box.max.x).toBeCloseTo(s.x1, 1)
      // its top stands a step above the ground all along its length
      for (let x = s.x0 + 0.5; x < s.x1; x += 1) {
        const zMid = s.z + s.side * (RAIL_GAUGE / 2 + 0.55 + STATION_PLATFORM_WIDTH / 2)
        const top = bumpy.heightAt(x, s.z) + STATION_PLATFORM_HEIGHT
        const ray = new THREE.Raycaster(new THREE.Vector3(x, top + 5, zMid), new THREE.Vector3(0, -1, 0))
        const hit = ray.intersectObject(slab, true)[0]
        expect(hit, `no platform under x=${x}`).toBeDefined()
        expect(Math.abs(hit.point.y - top)).toBeLessThan(0.12) // follows the rail's own profile
      }
    }
  })

  it('lies beside the track, not on it, and on the wood side', () => {
    const { group } = buildStationMesh(line, stations, bumpy)
    group.updateMatrixWorld(true)
    for (const [i, p] of group.children.filter((c) => c.name === 'station').entries()) {
      const s = stations[i]
      const box = new THREE.Box3().setFromObject(p.getObjectByName('platform')!)
      const near = s.side > 0 ? box.min.z - s.z : s.z - box.max.z // gap from the track centre to the platform edge
      expect(near).toBeGreaterThan(RAIL_GAUGE / 2 + 0.3)
      expect(near).toBeLessThan(1.5)
    }
  })

  it('has a roof on posts and a bench, and the posts are solid', () => {
    const { group, obstacles } = buildStationMesh(line, stations, bumpy)
    for (const p of group.children.filter((c) => c.name === 'station')) {
      expect(p.getObjectByName('canopy')).toBeDefined()
      expect(p.getObjectByName('bench')).toBeDefined()
    }
    expect(obstacles.length).toBeGreaterThanOrEqual(stations.length * 4)
    for (const o of obstacles) {
      expect(o.radius).toBeGreaterThan(0)
      expect(o.radius).toBeLessThan(0.5)
    }
  })

  it('lights its lamp after dark and not by day', () => {
    const { group, setNight } = buildStationMesh(line, stations, bumpy)
    const lamp = group.getObjectByName('lamp') as THREE.Mesh
    const mat = lamp.material as THREE.MeshStandardMaterial
    setNight(0)
    expect(mat.emissiveIntensity).toBe(0)
    setNight(1)
    expect(mat.emissiveIntensity).toBeGreaterThan(0)
  })

  it('disposes without throwing', () => {
    const { group, dispose } = buildStationMesh(line, stations, bumpy)
    expect(() => dispose()).not.toThrow()
    expect(group).toBeDefined()
  })
})
