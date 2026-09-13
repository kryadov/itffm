import { buildScrubMesh, buildScrubMeshes } from '../../src/world/scrub'
import type { QuestObstacle } from '../../src/quest/placement'

const flatGround = { heightAt: () => 5 }

describe('buildScrubMesh', () => {
  it('tags the mesh with the same id as the obstacle', () => {
    const o: QuestObstacle = { x: 1, z: 2, radius: 0.6, id: 'axe-scrub-3' }
    const mesh = buildScrubMesh(o, flatGround)
    expect(mesh.userData.scrubId).toBe('axe-scrub-3')
  })

  it('positions the mesh at the obstacle, on the ground', () => {
    const o: QuestObstacle = { x: 4, z: -2, radius: 0.5, id: 'lamp-scrub-0' }
    const mesh = buildScrubMesh(o, flatGround)
    expect(mesh.position.x).toBe(4)
    expect(mesh.position.z).toBe(-2)
    expect(mesh.position.y).toBeGreaterThan(5)
  })

  it('is deterministic for the same obstacle', () => {
    const o: QuestObstacle = { x: 0, z: 0, radius: 0.7, id: 'rod-scrub-2' }
    const a = buildScrubMesh(o, flatGround)
    const b = buildScrubMesh(o, flatGround)
    expect(a.geometry.attributes.position.array).toEqual(b.geometry.attributes.position.array)
  })
})

describe('buildScrubMeshes', () => {
  it('builds one mesh per obstacle, sharing its id', () => {
    const obstacles: QuestObstacle[] = [
      { x: 0, z: 0, radius: 0.5, id: 'axe-scrub-0' },
      { x: 1, z: 1, radius: 0.6, id: 'axe-scrub-1' },
    ]
    const meshes = buildScrubMeshes(obstacles, flatGround)
    expect(meshes).toHaveLength(2)
    expect(meshes.map((m) => m.userData.scrubId)).toEqual(['axe-scrub-0', 'axe-scrub-1'])
  })
})
