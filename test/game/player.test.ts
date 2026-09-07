import { stepPlayer, eyeHeight, type PlayerState, type PlayerInput } from '../../src/game/player'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 0 }
const start: PlayerState = { x: 0, z: 0, yaw: 0, pitch: 0, crouch: 0 }
const idle: PlayerInput = { forward: 0, strafe: 0, dYaw: 0, dPitch: 0, crouching: false, dt: 1 / 60 }

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
})
