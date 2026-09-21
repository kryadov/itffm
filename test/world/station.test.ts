import * as THREE from 'three'
import {
  placeRailLine, stationsFor, stationOccupies, stationToWorld, lineLength, pointAt, RAIL_GAUGE, TRAIN_TOTAL, PLATFORM_LENGTH,
} from '../../src/world/railway'
import { buildStationMesh, stationCrateSpot, STATION_PLATFORM_HEIGHT, STATION_PLATFORM_WIDTH } from '../../src/world/station'
import { buildDroneCrate } from '../../src/world/droneCrate'
import { proceduralTerrain } from '../../src/terrain/procedural'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 0 }
const bumpy = proceduralTerrain(4)

/** Which side of the track (+1 left of the direction of travel, -1 right) the wood's middle is on. */
function sideToward(s: { cx: number; cz: number; tx: number; tz: number }): 1 | -1 {
  return -(s.cx * -s.tz + s.cz * s.tx) >= 0 ? 1 : -1
}

describe('stationsFor', () => {
  it('gives one station at each end of the line, deterministically', () => {
    const line = placeRailLine(flat, 90, 3)
    const st = stationsFor(line)
    expect(st).toHaveLength(2)
    expect(stationsFor(line)).toEqual(st)
    const [a, b] = st
    expect(a.end).toBe(0)
    expect(b.end).toBe(1)
    expect(a.s1).toBeLessThan(b.s0) // the first one entirely before the second
    expect(a.s0).toBeGreaterThan(0)
    expect(b.s1).toBeLessThan(lineLength(line))
  })

  it('puts the platform on the side of the track that faces the middle of the wood', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const line = placeRailLine(flat, 90, seed)
      for (const s of stationsFor(line)) expect(s.side).toBe(sideToward(s))
    }
  })

  it('is long enough for the whole train, with room to spare, and lies on straight track', () => {
    const line = placeRailLine(flat, 90, 3)
    for (const s of stationsFor(line)) {
      expect(s.s1 - s.s0).toBeCloseTo(PLATFORM_LENGTH, 6)
      expect(s.s1 - s.s0).toBeGreaterThan(TRAIN_TOTAL + 2)
      const t0 = pointAt(line, s.s0)
      const t1 = pointAt(line, s.s1)
      expect(Math.hypot(t0.tx - t1.tx, t0.tz - t1.tz)).toBeLessThan(0.02)
      const mid = pointAt(line, (s.s0 + s.s1) / 2)
      expect(mid.x).toBeCloseTo(s.cx, 6)
      expect(mid.z).toBeCloseTo(s.cz, 6)
    }
  })
})

describe('stationOccupies', () => {
  const line = placeRailLine(flat, 90, 3)
  const [a] = stationsFor(line)
  it('covers the platform, the track beside it and a margin around', () => {
    const at = (u: number, v: number) => stationToWorld(a, u, v)
    const on = at(0, 0)
    expect(stationOccupies([a], on.x, on.z)).toBe(true)
    const beside = at(0, 2)
    expect(stationOccupies([a], beside.x, beside.z)).toBe(true)
    const far = at(0, 12)
    expect(stationOccupies([a], far.x, far.z)).toBe(false)
    expect(stationOccupies([a], far.x, far.z, 10)).toBe(true)
    const beyond = at(a.half + 30, 0)
    expect(stationOccupies([a], beyond.x, beyond.z)).toBe(false)
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
      const s = stations[i]
      const box = new THREE.Box3().setFromObject(slab)
      expect(box.max.y - box.min.y).toBeGreaterThan(0.5)
      // its top stands a step above the ground all along its length, wherever the track bends
      for (let u = -s.half + 0.5; u < s.half; u += 1) {
        const w = stationToWorld(s, u, RAIL_GAUGE / 2 + 0.55 + STATION_PLATFORM_WIDTH / 2)
        const s0 = (s.s0 + s.s1) / 2 + u
        const top = pointAt(line, s0).y + STATION_PLATFORM_HEIGHT
        const ray = new THREE.Raycaster(new THREE.Vector3(w.x, top + 5, w.z), new THREE.Vector3(0, -1, 0))
        const hit = ray.intersectObject(slab, true)[0]
        expect(hit, `no platform under u=${u}`).toBeDefined()
        expect(Math.abs(hit.point.y - top)).toBeLessThan(0.12)
      }
    }
  })

  it('lies beside the track, not on it, and on the wood side', () => {
    const { group } = buildStationMesh(line, stations, bumpy)
    group.updateMatrixWorld(true)
    for (const [i, p] of group.children.filter((c) => c.name === 'station').entries()) {
      const s = stations[i]
      const box = new THREE.Box3().setFromObject(p.getObjectByName('platform')!)
      const centre = box.getCenter(new THREE.Vector3())
      // the slab's middle is on the platform side of the track, not across it
      const across = ((centre.x - s.cx) * -s.tz + (centre.z - s.cz) * s.tx) * s.side
      expect(across).toBeGreaterThan(RAIL_GAUGE / 2 + 0.3)
      expect(across).toBeLessThan(RAIL_GAUGE / 2 + 0.3 + STATION_PLATFORM_WIDTH)
    }
  })

  it('has a roof on posts and a bench, and the posts are solid', () => {
    const { group, obstacles } = buildStationMesh(line, stations, bumpy)
    for (const p of group.children.filter((c) => c.name === 'station')) {
      expect(p.getObjectByName('canopy')).toBeDefined()
      expect(p.getObjectByName('bench')).toBeDefined()
    }
    expect(obstacles.length).toBeGreaterThanOrEqual(stations.length * 6)
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

describe('the crate the train leaves on a platform', () => {
  const line = placeRailLine(bumpy, 90, 5)
  const stations = stationsFor(line)

  it('has a spot on each platform: on the slab, at its top, clear of the shelter', () => {
    const { obstacles } = buildStationMesh(line, stations, bumpy)
    for (const s of stations) {
      const c = stationCrateSpot(line, s)
      expect(stationOccupies([s], c.x, c.z)).toBe(true)
      const across = ((c.x - s.cx) * -s.tz + (c.z - s.cz) * s.tx) * s.side
      expect(across).toBeGreaterThan(RAIL_GAUGE / 2 + 0.3)
      expect(across).toBeLessThan(RAIL_GAUGE / 2 + 0.3 + STATION_PLATFORM_WIDTH + 0.3)
      expect(c.y).toBeGreaterThan(bumpy.heightAt(c.x, c.z) - 0.5)
      // not inside a post, the bench or a lamp post
      for (const o of obstacles) expect(Math.hypot(o.x - c.x, o.z - c.z)).toBeGreaterThan(o.radius + 0.4)
    }
  })

  it('is a wooden crate a person could lift, standing on the ground', () => {
    const crate = buildDroneCrate()
    const box = new THREE.Box3().setFromObject(crate)
    const size = box.getSize(new THREE.Vector3())
    expect(box.min.y).toBeCloseTo(0, 2)
    expect(size.x).toBeGreaterThan(0.4)
    expect(size.x).toBeLessThan(1.2)
    expect(size.y).toBeGreaterThan(0.25)
    expect(size.y).toBeLessThan(0.8)
    expect(crate.name).toBe('droneCrate')
  })
})
