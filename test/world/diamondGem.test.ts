import * as THREE from 'three'
import { jitterDiamondGeometry, DIAMOND_GEM_SEED } from '../../src/world/diamondGem'

describe('jitterDiamondGeometry', () => {
  it('has more faces than a plain octahedron', () => {
    const geom = jitterDiamondGeometry(DIAMOND_GEM_SEED)
    const faceCount = (geom.getIndex()?.count ?? geom.getAttribute('position').count) / 3
    expect(faceCount).toBeGreaterThan(8)
  })

  it('is not perfectly symmetric — vertices at the same base radius end up at different actual radii', () => {
    const geom = jitterDiamondGeometry(DIAMOND_GEM_SEED)
    const pos = geom.getAttribute('position')
    const radii = new Set<number>()
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i)
      radii.add(Math.round(v.length() * 1000))
    }
    expect(radii.size).toBeGreaterThan(1)
  })

  it('is deterministic for the same seed', () => {
    const a = jitterDiamondGeometry(DIAMOND_GEM_SEED)
    const b = jitterDiamondGeometry(DIAMOND_GEM_SEED)
    expect(Array.from(a.getAttribute('position').array)).toEqual(Array.from(b.getAttribute('position').array))
  })
})
