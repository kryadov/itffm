import { joystickVector, isTap, screenToNdc } from '../../src/game/touchControls'

describe('joystickVector', () => {
  it('is neutral at the drag origin', () => {
    expect(joystickVector(0, 0, 40)).toEqual({ forward: 0, strafe: 0 })
  })

  it('drags up for forward', () => {
    const v = joystickVector(0, -40, 40)
    expect(v.forward).toBeCloseTo(1, 5)
    expect(v.strafe).toBeCloseTo(0, 5)
  })

  it('drags right for strafe', () => {
    const v = joystickVector(40, 0, 40)
    expect(v.forward).toBeCloseTo(0, 5)
    expect(v.strafe).toBeCloseTo(1, 5)
  })

  it('clamps to the stick radius rather than growing past it', () => {
    const v = joystickVector(0, -400, 40)
    expect(v.forward).toBeCloseTo(1, 5)
  })

  it('scales smoothly inside the radius, not just off/full', () => {
    const v = joystickVector(0, -20, 40)
    expect(v.forward).toBeCloseTo(0.5, 5)
  })

  it('gives a diagonal drag both components, not swallowing one', () => {
    const v = joystickVector(40, -40, 400)
    expect(v.forward).toBeGreaterThan(0)
    expect(v.strafe).toBeGreaterThan(0)
  })
})

describe('isTap', () => {
  it('is a tap when the finger barely moved and let go quickly', () => {
    expect(isTap(2, -1, 120)).toBe(true)
  })

  it('is not a tap once the finger drifted past the threshold', () => {
    expect(isTap(30, 0, 120)).toBe(false)
  })

  it('is not a tap once held past the duration threshold, even without moving', () => {
    expect(isTap(0, 0, 900)).toBe(false)
  })
})

describe('screenToNdc', () => {
  it('maps the screen centre to the NDC origin', () => {
    expect(screenToNdc(400, 300, 800, 600)).toEqual({ x: 0, y: 0 })
  })

  it('maps the top-left corner to (-1, 1) — NDC y grows upward, screen y grows downward', () => {
    expect(screenToNdc(0, 0, 800, 600)).toEqual({ x: -1, y: 1 })
  })

  it('maps the bottom-right corner to (1, -1)', () => {
    expect(screenToNdc(800, 600, 800, 600)).toEqual({ x: 1, y: -1 })
  })
})
