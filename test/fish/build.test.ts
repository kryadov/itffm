import * as THREE from 'three'
import { buildFish } from '../../src/fish/build'
import type { FishMorphology } from '../../src/species/schema'

const perch: FishMorphology = {
  bodyColor: '#4a6b3a',
  bellyColor: '#d8d0a0',
  finColor: '#8a2f2f',
  length: [150, 350],
  bodyDepth: 0.3,
  pattern: 'bars',
  patternColor: '#2a3a1a',
  eyeColor: '#e0a030',
  lowerFinColor: '#d0542a',
  dorsalFins: 2,
  dorsalAt: 0.4,
}
const plain: FishMorphology = { ...perch, pattern: 'plain', dorsalFins: 1, dorsalAt: 0.5 }

describe('buildFish', () => {
  it('gives the same fish for the same seed', () => {
    const a = buildFish(perch, 5, 0.8)
    const b = buildFish(perch, 5, 0.8)
    const bodyA = (a.getObjectByName('body') as THREE.Mesh).scale
    const bodyB = (b.getObjectByName('body') as THREE.Mesh).scale
    expect(bodyA).toEqual(bodyB)
  })

  it('gives a different fish for a different seed', () => {
    const a = buildFish(perch, 1, 0.8)
    const b = buildFish(perch, 2, 0.8)
    const bodyA = (a.getObjectByName('body') as THREE.Mesh).scale
    const bodyB = (b.getObjectByName('body') as THREE.Mesh).scale
    expect(bodyA).not.toEqual(bodyB)
  })

  it('builds a body, a tail and a dorsal fin', () => {
    const g = buildFish(perch, 3, 1)
    expect(g.getObjectByName('body')).toBeDefined()
    expect(g.getObjectByName('tail')).toBeDefined()
    expect(g.getObjectByName('dorsal')).toBeDefined()
  })

  it('keeps sane, non-chimeric proportions — longer than it is tall or wide', () => {
    for (let seed = 0; seed < 20; seed++) {
      const body = buildFish(perch, seed, 0.7).getObjectByName('body') as THREE.Mesh
      expect(body.scale.x).toBeGreaterThan(body.scale.y)
      expect(body.scale.x).toBeGreaterThan(body.scale.z)
    }
  })

  it('grows longer as it matures', () => {
    let youngTotal = 0
    let grownTotal = 0
    for (let seed = 0; seed < 20; seed++) {
      youngTotal += (buildFish(perch, seed, 0).getObjectByName('body') as THREE.Mesh).scale.x
      grownTotal += (buildFish(perch, seed, 1).getObjectByName('body') as THREE.Mesh).scale.x
    }
    expect(grownTotal).toBeGreaterThan(youngTotal)
  })

  it('stays within the species length range (in scene metres)', () => {
    const MM = 0.001
    for (let seed = 0; seed < 20; seed++) {
      const body = buildFish(perch, seed, 1).getObjectByName('body') as THREE.Mesh
      const lengthM = body.scale.x * 2
      expect(lengthM).toBeGreaterThanOrEqual(perch.length[0] * MM * 0.5)
      expect(lengthM).toBeLessThanOrEqual(perch.length[1] * MM * 1.01)
    }
  })
})

describe('buildFish fins', () => {
  // A live report (2026-09-20): a roach on the meadow showed as a small green
  // oval with huge red spikes. The tail cone was scaled by 1 (a metre) across
  // the fish, and it sat on the blunt end of the body, not the tapered one.
  const sizeOf = (seed: number, age = 0.7) => {
    const g = buildFish(perch, seed, age)
    g.updateMatrixWorld(true)
    return { g, box: new THREE.Box3().setFromObject(g) }
  }
  const lengthOf = (seed: number, age = 0.7) => (buildFish(perch, seed, age).getObjectByName('body') as THREE.Mesh).scale.x * 2

  it('stays a fish-sized thing: no fin sticks out past the body by more than a fraction of its length', () => {
    for (let seed = 0; seed < 20; seed++) {
      const { box } = sizeOf(seed)
      const size = box.getSize(new THREE.Vector3())
      const L = lengthOf(seed)
      expect(size.x, 'long axis').toBeLessThan(L * 1.4)
      expect(size.y, 'height').toBeLessThan(L * 0.6)
      expect(size.z, 'width').toBeLessThan(L * 0.3)
    }
  })

  it('has a flat tail, thin across the fish', () => {
    const tail = buildFish(perch, 3, 1).getObjectByName('tail') as THREE.Mesh
    const size = new THREE.Box3().setFromObject(tail).getSize(new THREE.Vector3())
    expect(size.z).toBeLessThan(size.y * 0.25)
  })

  it('puts the tail on the tapered end of the body, opposite the blunt head', () => {
    const g = buildFish(perch, 3, 1)
    const body = new THREE.Box3().setFromObject(g.getObjectByName('body')!)
    const tail = new THREE.Box3().setFromObject(g.getObjectByName('tail')!)
    // The body narrows toward +x (see buildFish), so that is where the tail goes.
    expect((tail.min.x + tail.max.x) / 2).toBeGreaterThan((body.min.x + body.max.x) / 2)
    expect(tail.max.x).toBeGreaterThan(body.max.x)
  })

  it('has the dorsal fin on top, over the back', () => {
    const g = buildFish(perch, 3, 1)
    const body = new THREE.Box3().setFromObject(g.getObjectByName('body')!)
    const dorsal = new THREE.Box3().setFromObject(g.getObjectByName('dorsal')!)
    expect(dorsal.max.y).toBeGreaterThan(body.max.y)
  })
})

describe('buildFish — how it looks', () => {
  const bodyColors = (m: FishMorphology) => {
    const body = buildFish(m, 3, 1).getObjectByName('body') as THREE.Mesh
    return { pos: body.geometry.getAttribute('position'), col: body.geometry.getAttribute('color') }
  }
  const lum = (col: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) =>
    col.getX(i) * 0.3 + col.getY(i) * 0.59 + col.getZ(i) * 0.11

  it('is darker along the back than on the belly', () => {
    const { pos, col } = bodyColors(plain)
    let back = 0, nb = 0, belly = 0, nl = 0
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 0.6) { back += lum(col, i); nb++ }
      if (pos.getY(i) < -0.6) { belly += lum(col, i); nl++ }
    }
    expect(nb).toBeGreaterThan(0)
    expect(back / nb).toBeLessThan(belly / nl)
  })

  it('draws dark bars across the flank of a barred fish, and none on a plain one', () => {
    // Along the flank's midline the brightness should swing up and down on a
    // barred perch, and stay near even on a plain fish.
    // One line along the flank: in each ring (vertices sharing an x) the vertex
    // a third of the way up that ring's own height.
    const swing = (m: FishMorphology) => {
      const { pos, col } = bodyColors(m)
      const rings = new Map<string, number[]>()
      for (let i = 0; i < pos.count; i++) {
        const key = pos.getX(i).toFixed(4)
        if (!rings.has(key)) rings.set(key, [])
        rings.get(key)!.push(i)
      }
      const flank: number[] = []
      for (const [key, idx] of rings) {
        const x = Number(key)
        if (x < -0.5 || x > 0.5) continue
        const h = Math.max(...idx.map((i) => pos.getY(i)))
        const best = idx.filter((i) => pos.getZ(i) > 0)
          .reduce((p, i) => (Math.abs(pos.getY(i) / h - 0.3) < Math.abs(pos.getY(p) / h - 0.3) ? i : p))
        flank.push(lum(col, best))
      }
      // Colours are linear, so compare as a ratio, not a difference.
      return Math.max(...flank) / Math.min(...flank)
    }
    expect(swing(perch)).toBeGreaterThan(1.5)
    expect(swing(plain)).toBeLessThan(1.15)
  })

  it('has two eyes, pectoral, pelvic and anal fins', () => {
    const g = buildFish(perch, 3, 1)
    const names: string[] = []
    g.traverse((o) => names.push(o.name))
    expect(names.filter((n) => n === 'eye')).toHaveLength(2)
    expect(names.filter((n) => n === 'pectoral')).toHaveLength(2)
    expect(names.filter((n) => n === 'pelvic')).toHaveLength(2)
    expect(names).toContain('anal')
  })

  it('has a second dorsal fin only when the species has one', () => {
    expect(buildFish(perch, 3, 1).getObjectByName('dorsal2')).toBeDefined()
    expect(buildFish(plain, 3, 1).getObjectByName('dorsal2')).toBeUndefined()
  })

  it('puts the eyes near the head end, on either side', () => {
    const g = buildFish(perch, 3, 1)
    g.updateMatrixWorld(true)
    const body = new THREE.Box3().setFromObject(g.getObjectByName('body')!)
    const eyes: THREE.Vector3[] = []
    g.traverse((o) => { if (o.name === 'eye') eyes.push(o.getWorldPosition(new THREE.Vector3())) })
    for (const e of eyes) expect(e.x).toBeLessThan(body.min.x + (body.max.x - body.min.x) * 0.2)
    expect(Math.sign(eyes[0].z)).toBe(-Math.sign(eyes[1].z))
  })

  it('has a forked tail: its middle stops short of its two lobes', () => {
    const tail = buildFish(perch, 3, 1).getObjectByName('tail') as THREE.Mesh
    tail.updateMatrixWorld(true)
    const pos = tail.geometry.getAttribute('position')
    const box = new THREE.Box3().setFromObject(tail)
    const h = box.max.y - box.min.y
    const mid = (box.max.y + box.min.y) / 2
    let midMax = -Infinity, lobeMax = -Infinity
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(tail.matrixWorld)
      if (Math.abs(v.y - mid) < h * 0.1) midMax = Math.max(midMax, v.x)
      else lobeMax = Math.max(lobeMax, v.x)
    }
    expect(midMax).toBeLessThan(lobeMax - h * 0.15)
  })

  it('is deeper-bodied when its species is', () => {
    const height = (m: FishMorphology) =>
      new THREE.Box3().setFromObject(buildFish(m, 3, 1).getObjectByName('body')!).getSize(new THREE.Vector3()).y
    expect(height({ ...plain, bodyDepth: 0.4 })).toBeGreaterThan(height({ ...plain, bodyDepth: 0.18 }) * 1.8)
  })
})

describe('buildFish in the wood', () => {
  it('flattens into one world mesh, keeping its baked colours', async () => {
    const { toWorldMesh } = await import('../../src/collectible/worldMesh')
    const mesh = toWorldMesh(buildFish(perch, 3, 1))
    const col = mesh.geometry.getAttribute('color')
    expect(col.count).toBeGreaterThan(1000)
    const shades = new Set<string>()
    for (let i = 0; i < col.count; i += 7) shades.add(col.getX(i).toFixed(3))
    expect(shades.size).toBeGreaterThan(10)
  })
})
