import {
  launchDrone, stepDrone, treeObstacles, droneReadout, DRONE, type DroneInput, type DroneState, type DroneEnv, type DroneObstacle,
} from '../../src/game/drone'
import type { Tree } from '../../src/world/trees'

const flat = { heightAt: () => 0 }
const pilot = { x: 0, z: 0, yaw: 0 }
const env = (over: Partial<DroneEnv> = {}): DroneEnv => ({ ground: flat, obstacles: [], pilot: { x: 0, z: 0 }, ...over })
const idle: DroneInput = { forward: 0, strafe: 0, lift: 0, dYaw: 0, dPitch: 0, returnHome: false }
const run = (s: DroneState, input: Partial<DroneInput>, seconds: number, e = env(), dt = 1 / 30): DroneState => {
  for (let t = 0; t < seconds; t += dt) s = stepDrone(s, { ...idle, ...input }, e, dt)
  return s
}

describe('launchDrone', () => {
  it('starts hovering just above the pilot, facing the way the pilot faces, with the battery it was given', () => {
    const s = launchDrone({ x: 5, z: 7, yaw: 1.2 }, flat, 0.8)
    expect(s.x).toBe(5)
    expect(s.z).toBe(7)
    expect(s.y).toBeGreaterThan(1)
    expect(s.y).toBeLessThan(3)
    expect(s.yaw).toBe(1.2)
    expect(s.battery).toBe(0.8)
    expect(s.returning).toBe(false)
    expect(s.landed).toBe(false)
  })

  it('starts over the ground where the pilot stands, not at sea level', () => {
    const hill = { heightAt: () => 12 }
    expect(launchDrone(pilot, hill, 1).y).toBeGreaterThan(12)
  })
})

describe('flying', () => {
  const start = launchDrone(pilot, flat, 1)

  it('goes the way it looks: forward is along its yaw (yaw 0 looks down -z)', () => {
    const s = run(start, { forward: 1 }, 2)
    expect(s.z).toBeLessThan(-5)
    expect(Math.abs(s.x)).toBeLessThan(0.01)
    const turned = run({ ...start, yaw: Math.PI / 2 }, { forward: 1 }, 2)
    expect(turned.x).toBeLessThan(-5) // yaw +90 degrees looks toward -x
  })

  it('strafes right of where it looks, and back when asked', () => {
    expect(run(start, { strafe: 1 }, 2).x).toBeGreaterThan(5)
    expect(run(start, { forward: -1 }, 2).z).toBeGreaterThan(5)
  })

  it('eases into its speed rather than jumping to it, and never exceeds the top speed', () => {
    const early = stepDrone(start, { ...idle, forward: 1 }, env(), 1 / 30)
    expect(Math.hypot(early.vx, early.vz)).toBeLessThan(DRONE.maxSpeed * 0.3)
    let s = start
    for (let i = 0; i < 300; i++) {
      s = stepDrone(s, { ...idle, forward: 1, strafe: 1 }, env(), 1 / 30) // diagonal is not faster
      expect(Math.hypot(s.vx, s.vz)).toBeLessThanOrEqual(DRONE.maxSpeed * 1.001)
    }
    expect(Math.hypot(s.vx, s.vz)).toBeGreaterThan(DRONE.maxSpeed * 0.95)
  })

  it('stops after a moment when nothing is pressed', () => {
    const moving = run(start, { forward: 1 }, 2)
    const after = run(moving, {}, 3)
    expect(Math.hypot(after.vx, after.vz)).toBeLessThan(0.05)
  })

  it('climbs and descends, but stays above the ground', () => {
    const up = run(start, { lift: 1 }, 2)
    expect(up.y).toBeGreaterThan(start.y + 3)
    const down = run(up, { lift: -1 }, 20)
    expect(down.y).toBeGreaterThanOrEqual(DRONE.minClearance - 1e-6)
    expect(down.y).toBeLessThan(DRONE.minClearance + 0.3)
  })

  it('cannot climb past its ceiling above the ground below it, on flat ground or over a hill', () => {
    expect(run(start, { lift: 1 }, 30).y).toBeLessThanOrEqual(DRONE.maxHeight + 1e-6)
    const hill = { heightAt: (x: number) => (x < 0 ? 0 : 25) }
    let s = launchDrone({ x: -10, z: 0, yaw: 0 }, hill, 1)
    s = run(s, { lift: 1 }, 30, env({ ground: hill }))
    expect(s.y).toBeLessThanOrEqual(DRONE.maxHeight + 1e-6)
    s = run(s, { strafe: 1, lift: 1 }, 6, env({ ground: hill })) // over the hill: the ceiling rises with the ground
    expect(s.y).toBeGreaterThan(DRONE.maxHeight)
    expect(s.y).toBeLessThanOrEqual(25 + DRONE.maxHeight + 1e-6)
  })

  it('turns and tilts the camera from the mouse, with the tilt held to sensible limits', () => {
    const s = stepDrone(start, { ...idle, dYaw: 0.4, dPitch: -0.2 }, env(), 1 / 30)
    expect(s.yaw).toBeCloseTo(0.4)
    expect(s.pitch).toBeCloseTo(-0.2)
    let p = start
    for (let i = 0; i < 20; i++) p = stepDrone(p, { ...idle, dPitch: 1 }, env(), 1 / 30)
    expect(p.pitch).toBeLessThanOrEqual(DRONE.maxPitch)
    for (let i = 0; i < 40; i++) p = stepDrone(p, { ...idle, dPitch: -1 }, env(), 1 / 30)
    expect(p.pitch).toBeGreaterThanOrEqual(DRONE.minPitch)
  })

  it('leans into a sideways move, and levels out again', () => {
    const banking = run(start, { strafe: 1 }, 1)
    expect(Math.abs(banking.roll)).toBeGreaterThan(0.05)
    const level = run(banking, {}, 3)
    expect(Math.abs(level.roll)).toBeLessThan(0.02)
  })

  it('is deterministic', () => {
    expect(run(start, { forward: 1, strafe: 0.5, lift: 0.3 }, 3)).toEqual(run(start, { forward: 1, strafe: 0.5, lift: 0.3 }, 3))
  })

  it('goes about as far in a second at any frame rate', () => {
    const a = run(start, { forward: 1 }, 2, env(), 1 / 60)
    const b = run(start, { forward: 1 }, 2, env(), 1 / 20)
    expect(Math.abs(a.z - b.z)).toBeLessThan(Math.abs(a.z) * 0.06)
  })
})

describe('radio range', () => {
  const start = launchDrone(pilot, flat, 1)
  it('never lets it stray further than the range from the pilot, and loses the signal there', () => {
    let s = start
    for (let i = 0; i < 30 * 40; i++) {
      s = stepDrone(s, { ...idle, forward: 1 }, env(), 1 / 30)
      expect(Math.hypot(s.x, s.z)).toBeLessThanOrEqual(DRONE.range + 1e-6)
    }
    expect(s.signal).toBeLessThan(0.05)
    expect(Math.hypot(s.x, s.z)).toBeGreaterThan(DRONE.range - 1)
  })

  it('is full signal near the pilot and fades toward the edge', () => {
    expect(start.signal).toBe(1)
    const mid = stepDrone({ ...start, x: 0, z: -(DRONE.weakSignalFrom + DRONE.range) / 2 }, idle, env(), 1 / 30)
    expect(mid.signal).toBeGreaterThan(0.1)
    expect(mid.signal).toBeLessThan(0.9)
  })

  it('is measured from wherever the pilot is', () => {
    const away = { x: 500, z: 500 }
    let s = launchDrone({ ...away, yaw: 0 }, flat, 1)
    s = run(s, { forward: 1 }, 5, env({ pilot: away }))
    expect(Math.hypot(s.x - away.x, s.z - away.z)).toBeLessThan(DRONE.range)
    expect(s.z).toBeLessThan(500)
  })
})

describe('battery', () => {
  it('drains while flying, and only while flying', () => {
    const s = run(launchDrone(pilot, flat, 1), {}, 30)
    expect(s.battery).toBeCloseTo(1 - 30 / DRONE.batterySeconds, 2)
  })

  it('brings it home by itself when it runs out', () => {
    let s = launchDrone(pilot, flat, 0.02)
    s = run(s, { forward: 1 }, 1)
    expect(s.returning).toBe(false)
    s = run(s, { forward: 1 }, 5)
    expect(s.returning).toBe(true)
    expect(s.battery).toBe(0)
    s = run(s, { forward: 1 }, 60) // the pilot's input no longer steers it
    expect(s.landed).toBe(true)
  })
})

describe('returning home', () => {
  it('flies back to the pilot and lands, from far and high, whatever is pressed', () => {
    let s = launchDrone(pilot, flat, 1)
    s = run(s, { forward: 1, lift: 0.5 }, 12)
    expect(Math.hypot(s.x, s.z)).toBeGreaterThan(60)
    s = stepDrone(s, { ...idle, returnHome: true }, env(), 1 / 30)
    expect(s.returning).toBe(true)
    s = run(s, { forward: 1 }, 60)
    expect(s.landed).toBe(true)
    expect(Math.hypot(s.x, s.z)).toBeLessThan(3)
    expect(s.y).toBeLessThan(3)
  })

  it('goes over the tops of the trees on the way, not into them', () => {
    // A tall trunk right on the straight line home.
    const wall: DroneObstacle[] = [{ x: 0, z: -40, radius: 1, y0: 0, y1: 26 }]
    const e = env({ obstacles: wall })
    let s: DroneState = { ...launchDrone(pilot, flat, 1), z: -80, y: 3 }
    s = stepDrone(s, { ...idle, returnHome: true }, e, 1 / 30)
    for (let i = 0; i < 30 * 90 && !s.landed; i++) {
      s = stepDrone(s, idle, e, 1 / 30)
      const inside = Math.hypot(s.x - 0, s.z + 40) < 1.3 && s.y < 26
      expect(inside, `inside the trunk at (${s.x.toFixed(1)}, ${s.y.toFixed(1)}, ${s.z.toFixed(1)})`).toBe(false)
    }
    expect(s.landed).toBe(true)
  })

  it('does not fight the pilot once landed', () => {
    let s = launchDrone(pilot, flat, 1)
    s = stepDrone(s, { ...idle, returnHome: true }, env(), 1 / 30)
    s = run(s, {}, 20)
    expect(s.landed).toBe(true)
    const again = stepDrone(s, { ...idle, forward: 1 }, env(), 1 / 30)
    expect(again.landed).toBe(true)
    expect(again).toEqual(s)
  })
})

describe('obstacles', () => {
  const trunk: DroneObstacle = { x: 0, z: -10, radius: 0.5, y0: 0, y1: 20 }
  const start = { ...launchDrone(pilot, flat, 1), y: 5 }
  const e = env({ obstacles: [trunk] })

  it('never ends up inside a trunk it flies into, and does not stick to it', () => {
    let s = start
    let minDist = Infinity
    for (let i = 0; i < 30 * 8; i++) {
      s = stepDrone(s, { ...idle, forward: 1 }, e, 1 / 30)
      minDist = Math.min(minDist, Math.hypot(s.x, s.z + 10))
    }
    expect(minDist).toBeGreaterThanOrEqual(trunk.radius + DRONE.radius - 1e-6)
    // slid off sideways or stopped, but it is still under control
    const free = run(s, { strafe: 1 }, 3, e)
    expect(Math.abs(free.x - s.x)).toBeGreaterThan(5)
  })

  it('flies over the top of it', () => {
    let s = { ...start, y: 22 }
    for (let i = 0; i < 30 * 6; i++) s = stepDrone(s, { ...idle, forward: 1 }, e, 1 / 30)
    expect(s.z).toBeLessThan(-14)
  })

  it('flies under a crown that starts above it', () => {
    const crown: DroneObstacle = { x: 0, z: -10, radius: 3, y0: 12, y1: 20 }
    let s = { ...start, y: 3 }
    for (let i = 0; i < 30 * 6; i++) s = stepDrone(s, { ...idle, forward: 1 }, env({ obstacles: [crown] }), 1 / 30)
    expect(s.z).toBeLessThan(-14)
  })
})

describe('treeObstacles', () => {
  const tree = (over: Partial<Tree> = {}): Tree => ({ x: 3, z: 4, y: 2, genus: 'picea', radius: 0.22, height: 20, ...over })

  // A live finding (2026-09-21): with the crowns solid too, a drone climbing to
  // crown height sat wedged between overlapping crowns — 43 of 120 random spots in
  // the demo wood — and the keys did nothing. Foliage is soft; trunks are not.
  it('makes one solid trunk per tree, from the ground nearly to the top, and no solid crown', () => {
    const o = treeObstacles([tree()])
    expect(o).toHaveLength(1)
    expect(o[0].radius).toBeCloseTo(0.22)
    expect(o[0].y0).toBe(2)
    expect(o[0].y1).toBeGreaterThan(2 + 20 * 0.7)
    expect(o[0].y1).toBeLessThanOrEqual(22)
  })

  it('lets a drone at crown height fly on between the trunks, from anywhere in a dense stand', () => {
    // A grid of trees 2 m apart (trees are never closer than 1.6 m in the wood).
    const trees: Tree[] = []
    for (let i = -8; i <= 8; i++) for (let j = -8; j <= 8; j++) trees.push(tree({ x: i * 2 + 1, z: j * 2 + 1, y: 0, radius: 0.3, genus: 'quercus' }))
    const env = { ground: flat, obstacles: treeObstacles(trees), pilot: { x: 0, z: 0 } }
    let s = launchDrone({ x: 0.2, z: 0.3, yaw: 0.4 }, flat, 1)
    for (let t = 0; t < 2.2; t += 1 / 20) s = stepDrone(s, { ...idle, lift: 1 }, env, 1 / 20)
    const x0 = s.x
    const z0 = s.z
    for (let t = 0; t < 3; t += 1 / 20) s = stepDrone(s, { ...idle, forward: 1 }, env, 1 / 20)
    expect(Math.hypot(s.x - x0, s.z - z0)).toBeGreaterThan(8)
  })

  it('is empty for no trees, and follows each tree\'s position', () => {
    expect(treeObstacles([])).toEqual([])
    const o = treeObstacles([tree({ x: -7, z: 9 })])
    expect(o.every((c) => c.x === -7 && c.z === 9)).toBe(true)
  })
})

describe('droneReadout', () => {
  const at = (x: number, z: number, yaw = 0) => ({ ...launchDrone({ x, z, yaw }, flat, 0.5), x, z, y: 20, yaw })

  it('reads height above the ground beneath it, distance from the pilot, speed and the battery and signal as percentages', () => {
    const hill = { heightAt: (x: number) => (x > 10 ? 6 : 0) }
    const s = { ...at(30, 40), vx: 3, vz: 4, battery: 0.666, signal: 0.5, y: 26 }
    const r = droneReadout(s, { ground: hill, obstacles: [], pilot: { x: 0, z: 0 } })
    expect(r.altitude).toBeCloseTo(20) // 26 above ground that stands 6 up
    expect(r.distance).toBeCloseTo(50)
    expect(r.speed).toBeCloseTo(5)
    expect(r.batteryPercent).toBe(67)
    expect(r.signalPercent).toBe(50)
  })

  it('never reads a negative height', () => {
    const r = droneReadout({ ...at(0, 0), y: -3 }, env())
    expect(r.altitude).toBe(0)
  })

  it('points the way home relative to where the camera looks: 0 ahead, positive to the right', () => {
    // Facing -z (yaw 0), pilot at the origin.
    expect(droneReadout(at(0, 50), env()).homeAngle).toBeCloseTo(0) // pilot is ahead (-z)
    expect(Math.abs(droneReadout(at(0, -50), env()).homeAngle)).toBeCloseTo(Math.PI) // behind
    expect(droneReadout(at(-50, 0), env()).homeAngle).toBeCloseTo(Math.PI / 2) // pilot is to the right (+x)
    expect(droneReadout(at(50, 0), env()).homeAngle).toBeCloseTo(-Math.PI / 2) // to the left
    // Turn the drone right (yaw -90 deg looks +x): a pilot that was to the right is now behind... and ahead when it faces them.
    expect(droneReadout(at(-50, 0, -Math.PI / 2), env()).homeAngle).toBeCloseTo(0) // yaw -90 looks +x, toward the pilot
  })
})
