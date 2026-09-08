import { chooseStartPose } from '../../src/game/startPose'
import type { Obstacle } from '../../src/game/player'

describe('chooseStartPose', () => {
  it('starts at the centre when it is already clear', () => {
    const far: Obstacle[] = [{ x: 40, z: 40, radius: 0.3 }]
    expect(chooseStartPose(far, 90)).toEqual({ x: 0, z: 0 })
  })

  it('moves away from a tree standing on the centre', () => {
    const onCentre: Obstacle[] = [{ x: 0, z: 0, radius: 0.3 }]
    const pose = chooseStartPose(onCentre, 90)
    expect(Math.hypot(pose.x, pose.z)).toBeGreaterThan(0.3)
  })

  it('never returns a point closer to any tree than its own radius', () => {
    const trees: Obstacle[] = [
      { x: 0, z: 0, radius: 0.3 },
      { x: 1, z: 0, radius: 0.3 },
      { x: -1, z: 0, radius: 0.3 },
      { x: 0, z: 1, radius: 0.3 },
      { x: 0, z: -1, radius: 0.3 },
    ]
    const pose = chooseStartPose(trees, 90)
    for (const t of trees) {
      expect(Math.hypot(pose.x - t.x, pose.z - t.z)).toBeGreaterThanOrEqual(t.radius)
    }
  })

  it('stays within the plot', () => {
    const trees: Obstacle[] = [{ x: 0, z: 0, radius: 0.3 }]
    const pose = chooseStartPose(trees, 5)
    expect(Math.abs(pose.x)).toBeLessThanOrEqual(5)
    expect(Math.abs(pose.z)).toBeLessThanOrEqual(5)
  })

  it('is deterministic', () => {
    const trees: Obstacle[] = [{ x: 0, z: 0, radius: 0.3 }, { x: 0.5, z: 0.5, radius: 0.3 }]
    expect(chooseStartPose(trees, 90)).toEqual(chooseStartPose(trees, 90))
  })

  it('falls back to the centre rather than throwing when nowhere is clear', () => {
    // A dense wall of huge obstacles covering the whole searchable plot.
    const wall: Obstacle[] = []
    for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) wall.push({ x, z, radius: 5 })
    expect(chooseStartPose(wall, 5)).toEqual({ x: 0, z: 0 })
  })
})
