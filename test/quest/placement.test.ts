import { placeQuestItem, placeQuestItems, thicketObstacles } from '../../src/quest/placement'
import { QUEST_ITEM_IDS } from '../../src/quest/types'
import type { Vec2 } from '../../src/geo/types'

const shelter = { x: 0, z: 0 }
const flatHeight = (): number => 5

describe('placeQuestItem', () => {
  it('is deterministic for the same seed and inputs', () => {
    const a = placeQuestItem(7, shelter, [], flatHeight)
    const b = placeQuestItem(7, shelter, [], flatHeight)
    expect(a).toEqual(b)
  })

  it('gives a different position for a different seed', () => {
    const a = placeQuestItem(1, shelter, [], flatHeight)
    const b = placeQuestItem(2, shelter, [], flatHeight)
    expect(a.position).not.toEqual(b.position)
  })

  it('places the item 30-45m from the shelter', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { position } = placeQuestItem(seed, shelter, [], flatHeight)
      const dist = Math.hypot(position.x - shelter.x, position.z - shelter.z)
      expect(dist).toBeGreaterThanOrEqual(30)
      expect(dist).toBeLessThanOrEqual(45)
    }
  })

  it('reads the item height from the ground', () => {
    const { position } = placeQuestItem(3, shelter, [], (x, z) => 10 + x * 0 + z * 0)
    expect(position.y).toBe(10)
  })

  it('gives thicket obstacles when no water crosses the path', () => {
    const { obstacles } = placeQuestItem(3, shelter, [], flatHeight)
    expect(obstacles.length).toBeGreaterThan(0)
  })

  it('gives no obstacles when water already crosses the shelter-item segment', () => {
    // A seed whose direction we first inspect, then draw a pond straight
    // across that same line so the water margin check is guaranteed to fire.
    const { position } = placeQuestItem(3, shelter, [], flatHeight)
    const mid = { x: (shelter.x + position.x) / 2, z: (shelter.z + position.z) / 2 }
    const dx = position.x - shelter.x
    const dz = position.z - shelter.z
    const len = Math.hypot(dx, dz)
    const px = -dz / len
    const pz = dx / len
    const pond: Vec2[] = [
      { x: mid.x + px * 20, z: mid.z + pz * 20 },
      { x: mid.x - px * 20, z: mid.z - pz * 20 },
    ]
    const { obstacles } = placeQuestItem(3, shelter, [pond], flatHeight)
    expect(obstacles).toHaveLength(0)
  })
})

describe('placeQuestItems', () => {
  it('is deterministic for the same seed', () => {
    expect(placeQuestItems(7, shelter, [], flatHeight)).toEqual(placeQuestItems(7, shelter, [], flatHeight))
  })

  it('places all four items, each at a meaningfully different position', () => {
    const placed = placeQuestItems(11, shelter, [], flatHeight)
    expect(Object.keys(placed).sort()).toEqual([...QUEST_ITEM_IDS].sort())
    const positions = QUEST_ITEM_IDS.map((id) => placed[id].position)
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dist = Math.hypot(positions[i].x - positions[j].x, positions[i].z - positions[j].z)
        expect(dist).toBeGreaterThan(1)
      }
    }
  })

  it('every item still lands 30-45m from the shelter', () => {
    const placed = placeQuestItems(23, shelter, [], flatHeight)
    for (const id of QUEST_ITEM_IDS) {
      const { position } = placed[id]
      const dist = Math.hypot(position.x - shelter.x, position.z - shelter.z)
      expect(dist).toBeGreaterThanOrEqual(30)
      expect(dist).toBeLessThanOrEqual(45)
    }
  })
})

describe('thicketObstacles', () => {
  const item = { x: 0, z: 40 }

  it('is deterministic for the same seed', () => {
    expect(thicketObstacles(9, shelter, item)).toEqual(thicketObstacles(9, shelter, item))
  })

  it('blocks the middle third of the straight segment', () => {
    const obstacles = thicketObstacles(9, shelter, item)
    const midpoint = { x: 0, z: 20 } // t = 0.5 along the segment
    const nearest = Math.min(
      ...obstacles.map((o) => Math.hypot(o.x - midpoint.x, o.z - midpoint.z) - o.radius),
    )
    expect(nearest).toBeLessThan(3)
  })

  it('leaves the first and last sixth of the segment clear', () => {
    const obstacles = thicketObstacles(9, shelter, item)
    const nearShelter = { x: 0, z: 3 } // t ≈ 1/13, well inside the first sixth
    const nearItem = { x: 0, z: 37 } // well inside the last sixth
    for (const p of [nearShelter, nearItem]) {
      const nearest = Math.min(...obstacles.map((o) => Math.hypot(o.x - p.x, o.z - p.z) - o.radius))
      expect(nearest).toBeGreaterThan(1.5)
    }
  })

  it('gives obstacle radii in the bush range', () => {
    for (const o of thicketObstacles(9, shelter, item)) {
      expect(o.radius).toBeGreaterThanOrEqual(0.5)
      expect(o.radius).toBeLessThanOrEqual(0.8)
    }
  })

  it('gives every obstacle a stable, unique id scoped by its owner', () => {
    const obstacles = thicketObstacles(9, shelter, item, 'axe')
    const ids = obstacles.map((o) => o.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id.startsWith('axe-scrub-')).toBe(true)
  })

  it('never collides ids between two different owners', () => {
    const a = thicketObstacles(9, shelter, item, 'axe')
    const b = thicketObstacles(9, shelter, item, 'lamp')
    const aIds = new Set(a.map((o) => o.id))
    for (const o of b) expect(aIds.has(o.id)).toBe(false)
  })
})
