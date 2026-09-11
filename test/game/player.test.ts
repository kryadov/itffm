import {
  stepPlayer,
  eyeHeight,
  cameraBob,
  biomeSpeedFactor,
  type PlayerState,
  type PlayerInput,
} from '../../src/game/player'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 0 }
const start: PlayerState = {
  x: 0, z: 0, yaw: 0, pitch: 0, crouch: 0, vy: 0, hop: 0, airborne: false, stand: 0, bobPhase: 0,
}
const idle: PlayerInput = {
  forward: 0, strafe: 0, dYaw: 0, dPitch: 0, crouching: false, jumping: false, dt: 1 / 60,
}

describe('biomeSpeedFactor', () => {
  it('slows walking on wetland', () => {
    expect(biomeSpeedFactor('wetland')).toBeLessThan(1)
  })

  it('leaves every other biome at full speed', () => {
    expect(biomeSpeedFactor('forest-mixed')).toBe(1)
    expect(biomeSpeedFactor('dunes-coast')).toBe(1)
    expect(biomeSpeedFactor('meadow-scrub')).toBe(1)
  })
})

describe('stepPlayer', () => {
  it('stands still without input', () => {
    const s = stepPlayer(start, idle, flat, [])
    expect(s.x).toBeCloseTo(0)
    expect(s.z).toBeCloseTo(0)
  })

  it('walks in the direction it is facing', () => {
    const s = stepPlayer(start, { ...idle, forward: 1, dt: 1 }, flat, [])
    expect(Math.hypot(s.x, s.z)).toBeGreaterThan(0.5)
  })

  it('scales speed by the given multiplier', () => {
    const normal = stepPlayer(start, { ...idle, forward: 1, dt: 1 }, flat, [])
    const half = stepPlayer(start, { ...idle, forward: 1, dt: 1 }, flat, [], 0.5)
    expect(Math.hypot(half.x, half.z)).toBeCloseTo(Math.hypot(normal.x, normal.z) / 2, 5)
  })

  it('turns the walking direction with the view', () => {
    const turned = { ...start, yaw: Math.PI / 2 }
    const a = stepPlayer(start, { ...idle, forward: 1, dt: 1 }, flat, [])
    const b = stepPlayer(turned, { ...idle, forward: 1, dt: 1 }, flat, [])
    expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z)).toBeGreaterThan(0.5)
  })

  it('clamps how far up and down you can look', () => {
    let s = start
    for (let i = 0; i < 200; i++) s = stepPlayer(s, { ...idle, dPitch: 0.1 }, flat, [])
    expect(s.pitch).toBeLessThanOrEqual(Math.PI / 2)
    expect(s.pitch).toBeGreaterThanOrEqual(-Math.PI / 2)
  })

  it('does not let diagonal movement outrun straight movement', () => {
    const straight = stepPlayer(start, { ...idle, forward: 1, dt: 1 }, flat, [])
    const diagonal = stepPlayer(start, { ...idle, forward: 1, strafe: 1, dt: 1 }, flat, [])
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeLessThanOrEqual(
      Math.hypot(straight.x, straight.z) + 1e-6,
    )
  })

  it('does not walk through a tree', () => {
    // At yaw 0 forward runs towards -z, so that is where the tree goes.
    const tree = { x: 0, z: -2, radius: 0.4 }
    let s = start
    for (let i = 0; i < 120; i++) {
      s = stepPlayer(s, { ...idle, forward: 1, dt: 1 / 30 }, flat, [tree])
    }
    // Tree radius plus player radius: you cannot get closer than that.
    expect(Math.hypot(s.x - tree.x, s.z - tree.z)).toBeGreaterThanOrEqual(0.69)
  })

  it('does not block movement through a zero-radius obstacle (an opened door)', () => {
    // A closed shelter door is a real obstacle (world/shelter.ts's
    // doorObstacle); `toggleDoor()` opens it by zeroing that SAME object's
    // radius rather than removing it from the obstacle list. The collision
    // loop used to add PLAYER_RADIUS to every obstacle's radius regardless,
    // so a radius-0 "open door" still blocked anyone walking dead straight
    // at its centre within PLAYER_RADIUS (0.3m) — exactly what a player
    // aiming for the middle of a doorway does. Radius 0 must mean "no
    // obstacle here" plainly, not "a point-sized obstacle".
    const openDoor = { x: 0, z: -2, radius: 0 }
    let s = start
    for (let i = 0; i < 120; i++) {
      s = stepPlayer(s, { ...idle, forward: 1, dt: 1 / 30 }, flat, [openDoor])
    }
    expect(s.z).toBeLessThan(-2)
  })

  it('lowers the eye when crouching', () => {
    let s = start
    for (let i = 0; i < 60; i++) s = stepPlayer(s, { ...idle, crouching: true }, flat, [])
    expect(eyeHeight(s)).toBeLessThan(eyeHeight(start))
  })

  it('walks slower while crouched', () => {
    const crouched = { ...start, crouch: 1 }
    const fast = stepPlayer(start, { ...idle, forward: 1, dt: 1 }, flat, [])
    const slow = stepPlayer(crouched, { ...idle, forward: 1, dt: 1 }, flat, [])
    expect(Math.hypot(slow.x, slow.z)).toBeLessThan(Math.hypot(fast.x, fast.z))
  })

  it('slides along an obstacle rather than sticking to it', () => {
    // Walking into a tree slightly off-centre should still make sideways
    // progress: getting stuck on a trunk ruins a quiet walk in the woods.
    const tree = { x: 0.3, z: -2, radius: 0.4 }
    let s = start
    for (let i = 0; i < 120; i++) {
      s = stepPlayer(s, { ...idle, forward: 1, dt: 1 / 30 }, flat, [tree])
    }
    expect(Math.abs(s.x)).toBeGreaterThan(0.1)
  })

  describe('slopes', () => {
    // At yaw 0, forward moves toward -z, so height must rise as z falls to
    // read as an uphill climb in the direction the player is walking.
    const slope = (grade: number): ElevationProvider => ({ heightAt: (_x, z) => -z * grade })

    it('does not slow a gentle slope at all', () => {
      const gentle = stepPlayer(start, { ...idle, forward: 1, dt: 1 }, slope(0.3), [])
      const flatMove = stepPlayer(start, { ...idle, forward: 1, dt: 1 }, flat, [])
      expect(Math.hypot(gentle.x, gentle.z)).toBeCloseTo(Math.hypot(flatMove.x, flatMove.z), 5)
    })

    it('slows a moderate uphill climb', () => {
      const moderate = stepPlayer(start, { ...idle, forward: 1, dt: 1 }, slope(1.0), [])
      const flatMove = stepPlayer(start, { ...idle, forward: 1, dt: 1 }, flat, [])
      const slowed = Math.hypot(moderate.x, moderate.z)
      expect(slowed).toBeGreaterThan(0)
      expect(slowed).toBeLessThan(Math.hypot(flatMove.x, flatMove.z))
    })

    it('fully blocks a cliff-steep climb', () => {
      let s = start
      for (let i = 0; i < 60; i++) s = stepPlayer(s, { ...idle, forward: 1, dt: 1 / 30 }, slope(3), [])
      expect(Math.hypot(s.x, s.z)).toBeCloseTo(0, 5)
    })

    it('never slows walking downhill, however steep', () => {
      const down = stepPlayer(start, { ...idle, forward: 1, dt: 1 }, slope(-5), [])
      const flatMove = stepPlayer(start, { ...idle, forward: 1, dt: 1 }, flat, [])
      expect(Math.hypot(down.x, down.z)).toBeCloseTo(Math.hypot(flatMove.x, flatMove.z), 5)
    })
  })

  describe('jumping', () => {
    it('leaves the ground on jump', () => {
      const s = stepPlayer(start, { ...idle, jumping: true, dt: 1 / 60 }, flat, [])
      expect(s.vy).toBeGreaterThan(0)
      expect(s.hop).toBeGreaterThan(0)
      expect(s.airborne).toBe(true)
    })

    it('rises to a peak and comes back down through a real height, not just a sign flip', () => {
      let s = start
      let peak = 0
      for (let i = 0; i < 200 && (i === 0 || s.airborne); i++) {
        s = stepPlayer(s, i === 0 ? { ...idle, jumping: true, dt: 1 / 60 } : { ...idle, dt: 1 / 60 }, flat, [])
        peak = Math.max(peak, s.hop)
      }
      expect(peak).toBeGreaterThan(0.05)
      expect(s.hop).toBe(0)
    })

    it('cannot jump again while already airborne', () => {
      let s = stepPlayer(start, { ...idle, jumping: true, dt: 1 / 60 }, flat, [])
      const vyAfterFirst = s.vy
      s = stepPlayer(s, { ...idle, jumping: true, dt: 1 / 60 }, flat, [])
      // Gravity only: a second jump command mid-air must not add more lift.
      expect(s.vy).toBeLessThan(vyAfterFirst)
    })

    it('comes back down and lands', () => {
      let s = stepPlayer(start, { ...idle, jumping: true, dt: 1 / 60 }, flat, [])
      for (let i = 0; i < 200 && s.airborne; i++) {
        s = stepPlayer(s, { ...idle, dt: 1 / 60 }, flat, [])
      }
      expect(s.airborne).toBe(false)
      expect(s.vy).toBe(0)
    })

    it('does not drift into flight: forward speed is unchanged by jumping', () => {
      const grounded = stepPlayer(start, { ...idle, forward: 1, dt: 1 }, flat, [])
      const jumped = stepPlayer(start, { ...idle, forward: 1, jumping: true, dt: 1 }, flat, [])
      expect(Math.hypot(jumped.x, jumped.z)).toBeCloseTo(Math.hypot(grounded.x, grounded.z), 5)
    })

    it('cannot jump while crouching', () => {
      const crouched: PlayerState = { ...start, crouch: 1 }
      const s = stepPlayer(crouched, { ...idle, jumping: true, dt: 1 / 60 }, flat, [])
      expect(s.airborne).toBe(false)
    })
  })

  describe('walking bob', () => {
    it('holds the bob phase still when not moving', () => {
      const s = stepPlayer(start, { ...idle, dt: 1 }, flat, [])
      expect(s.bobPhase).toBe(0)
    })

    it('advances the bob phase with distance walked', () => {
      const s = stepPlayer(start, { ...idle, forward: 1, dt: 1 }, flat, [])
      expect(s.bobPhase).toBeGreaterThan(0)
    })

    it('does not advance the bob phase while airborne', () => {
      let s = stepPlayer(start, { ...idle, jumping: true, dt: 1 / 60 }, flat, [])
      const phaseAtTakeoff = s.bobPhase
      for (let i = 0; i < 10 && s.airborne; i++) {
        s = stepPlayer(s, { ...idle, forward: 1, dt: 1 / 60 }, flat, [])
      }
      expect(s.bobPhase).toBe(phaseAtTakeoff)
    })

    it('never lifts the camera below eye height', () => {
      for (let phase = 0; phase < 20; phase++) {
        const s: PlayerState = { ...start, bobPhase: phase }
        expect(cameraBob(s).dy).toBeGreaterThanOrEqual(0)
      }
    })

    it('sways side to side, not just up and down', () => {
      const atZero = cameraBob({ ...start, bobPhase: 0 })
      const atHalfCycle = cameraBob({ ...start, bobPhase: Math.PI })
      expect(atZero.dx).not.toBeCloseTo(atHalfCycle.dx, 5)
    })
  })

  describe('climbing', () => {
    it('stands on top of a low obstacle instead of sliding around it', () => {
      // One step at this dt covers exactly WALK_SPEED * dt = 1m — right onto
      // the stump's centre, not past it.
      const stump = { x: 0, z: -1, radius: 0.3, topHeight: 0.4 }
      const s = stepPlayer(start, { ...idle, forward: 1, dt: 1 / 2.4 }, flat, [stump])
      expect(Math.hypot(s.x - stump.x, s.z - stump.z)).toBeLessThan(stump.radius)
      expect(s.stand).toBe(0.4)
    })

    it('still blocks an obstacle too tall to step up onto', () => {
      const boulder = { x: 0, z: -1, radius: 0.5, topHeight: 1.2 }
      let s = start
      for (let i = 0; i < 90; i++) {
        s = stepPlayer(s, { ...idle, forward: 1, dt: 1 / 30 }, flat, [boulder])
      }
      expect(Math.hypot(s.x - boulder.x, s.z - boulder.z)).toBeGreaterThanOrEqual(boulder.radius + 0.29)
      expect(s.stand).toBe(0)
    })

    it('comes back down to stand: 0 after stepping off', () => {
      const stump = { x: 0, z: -1, radius: 0.3, topHeight: 0.4 }
      let s = stepPlayer(start, { ...idle, forward: 1, dt: 1 / 2.4 }, flat, [stump])
      expect(s.stand).toBe(0.4)
      s = stepPlayer(s, { ...idle, forward: -1, dt: 1 }, flat, [stump])
      expect(s.stand).toBe(0)
    })
  })
})
