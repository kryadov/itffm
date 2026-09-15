import { regionToOffscreen, headingFromYaw, markerScreenPos } from '../../src/ui/minimap'

describe('regionToOffscreen', () => {
  it('maps the plot centre to the offscreen canvas centre', () => {
    const p = regionToOffscreen({ x: 0, z: 0 }, 90)
    expect(p.x).toBeCloseTo(90 * 0.5)
    expect(p.y).toBeCloseTo(90 * 0.5)
  })

  it('maps the north-west corner to the canvas origin', () => {
    const p = regionToOffscreen({ x: -90, z: -90 }, 90)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(0)
  })

  it('scales linearly with world distance', () => {
    const a = regionToOffscreen({ x: 10, z: 0 }, 90)
    const b = regionToOffscreen({ x: 20, z: 0 }, 90)
    expect(b.x - a.x).toBeCloseTo(10 * 0.5)
  })
})

describe('markerScreenPos', () => {
  const half = 86
  const viewRadius = 130

  it('places a marker straight ahead of the player above centre', () => {
    const player = { x: 0, z: 0, heading: 0 }
    const p = markerScreenPos({ x: 5, z: 0 }, player, half, viewRadius)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeLessThan(0)
  })

  it('places a marker directly behind the player below centre', () => {
    const player = { x: 0, z: 0, heading: 0 }
    const p = markerScreenPos({ x: -5, z: 0 }, player, half, viewRadius)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeGreaterThan(0)
  })

  it('clamps a marker farther than the view radius to the edge', () => {
    const player = { x: 0, z: 0, heading: 0 }
    const p = markerScreenPos({ x: 1000, z: 0 }, player, half, viewRadius)
    const edge = half - 10
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(edge)
  })

  it('does not clamp a marker within the view radius', () => {
    const player = { x: 0, z: 0, heading: 0 }
    const p = markerScreenPos({ x: 5, z: 0 }, player, half, viewRadius)
    const disp = half / viewRadius
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(5 * disp)
  })
})

describe('headingFromYaw', () => {
  // These are the same four cardinal cases game/player.ts's own stepPlayer
  // produces for forward=1 at each yaw — see the derivation in the doc
  // comment: facing north (yaw 0, direction (0,-1)) must map to a heading
  // whose canvas rotation puts "forward" pointing straight up.
  it('faces up (north) at yaw 0', () => {
    expect(headingFromYaw(0)).toBeCloseTo(-Math.PI / 2)
  })

  it('turning right (larger yaw) turns the heading toward west, matching the compass', () => {
    // ui/compass.ts: "turning right (larger yaw) turns the view west". ±π are
    // the same angle (atan2's branch cut), so compare via sin/cos, not the
    // raw radian value.
    const h = headingFromYaw(Math.PI / 2)
    expect(Math.cos(h)).toBeCloseTo(Math.cos(Math.PI))
    expect(Math.sin(h)).toBeCloseTo(Math.sin(Math.PI))
  })

  it('is periodic with yaw', () => {
    expect(headingFromYaw(0.7)).toBeCloseTo(headingFromYaw(0.7 + Math.PI * 2))
  })
})
