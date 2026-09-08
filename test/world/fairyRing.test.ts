import { buildFairyRingMesh } from '../../src/world/fairyRing'
import { proceduralTerrain } from '../../src/terrain/procedural'

const ground = proceduralTerrain(5)

describe('buildFairyRingMesh', () => {
  it('sits at the ring centre, flat on the ground', () => {
    const mesh = buildFairyRingMesh({ x: 4, z: -2, radius: 2.2 }, ground)
    expect(mesh.position.x).toBe(4)
    expect(mesh.position.z).toBe(-2)
  })

  it('follows the terrain height under it rather than sitting at y=0', () => {
    const mesh = buildFairyRingMesh({ x: 4, z: -2, radius: 2.2 }, ground)
    const pos = mesh.geometry.getAttribute('position')
    let sawNonZero = false
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getY(i)) > 1e-6) sawNonZero = true
    }
    expect(sawNonZero).toBe(true)
  })

  it('is named so it is easy to find in the scene graph', () => {
    expect(buildFairyRingMesh({ x: 0, z: 0, radius: 2 }, ground).name).toBe('fairyRing')
  })
})
