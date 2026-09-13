import { chopScrub } from '../../src/quest/scrub'
import type { QuestObstacle } from '../../src/quest/placement'

const obstacles: QuestObstacle[] = [
  { x: 0, z: 0, radius: 0.5, id: 'axe-scrub-0' },
  { x: 1, z: 1, radius: 0.6, id: 'axe-scrub-1' },
]

describe('chopScrub', () => {
  it('is a no-op without the axe owned', () => {
    const next = chopScrub(obstacles, 'axe-scrub-0', false)
    expect(next).toBe(obstacles)
  })

  it('removes exactly the matching obstacle once owned', () => {
    const next = chopScrub(obstacles, 'axe-scrub-0', true)
    expect(next.map((o) => o.id)).toEqual(['axe-scrub-1'])
  })

  it('is a no-op for an id that is not in the list', () => {
    const next = chopScrub(obstacles, 'lamp-scrub-9', true)
    expect(next).toBe(obstacles)
  })

  it('leaves the original array untouched', () => {
    chopScrub(obstacles, 'axe-scrub-0', true)
    expect(obstacles).toHaveLength(2)
  })
})
