import * as THREE from 'three'
import { placeTrees, treePerches, buildTreeMeshes } from '../../src/world/trees'
import { proceduralTerrain } from '../../src/terrain/procedural'

const terrain = proceduralTerrain(5)

describe('placeTrees', () => {
  it('is deterministic for one seed', () => {
    expect(placeTrees(terrain, 60, 3, ['betula', 'picea'])).toEqual(
      placeTrees(terrain, 60, 3, ['betula', 'picea']),
    )
  })

  it('gives a different wood for a different seed', () => {
    const a = placeTrees(terrain, 60, 1, ['betula'])
    const b = placeTrees(terrain, 60, 2, ['betula'])
    expect(a[0]?.x).not.toBe(b[0]?.x)
  })

  it('keeps every tree inside the plot', () => {
    for (const t of placeTrees(terrain, 60, 3, ['betula', 'picea'])) {
      expect(Math.abs(t.x)).toBeLessThanOrEqual(60)
      expect(Math.abs(t.z)).toBeLessThanOrEqual(60)
    }
  })

  it('uses only the genera it was given', () => {
    const mix = ['betula', 'picea'] as const
    for (const t of placeTrees(terrain, 60, 3, [...mix])) {
      expect(mix).toContain(t.genus)
    }
  })

  it('stands every tree on the ground', () => {
    for (const t of placeTrees(terrain, 60, 3, ['betula'])) {
      expect(t.y).toBeCloseTo(terrain.heightAt(t.x, t.z), 5)
    }
  })

  it('grows a wood that is neither empty nor endless', () => {
    const trees = placeTrees(terrain, 60, 3, ['betula', 'picea'])
    expect(trees.length).toBeGreaterThan(20)
    expect(trees.length).toBeLessThan(3000)
  })

  it('keeps every tree inside an off-centre chunk when given an origin', () => {
    const origin = { x: 1000, z: -500 }
    for (const t of placeTrees(terrain, 60, 3, ['betula', 'picea'], 0.06, origin)) {
      expect(Math.abs(t.x - origin.x)).toBeLessThanOrEqual(60)
      expect(Math.abs(t.z - origin.z)).toBeLessThanOrEqual(60)
    }
  })

  it('is deterministic for the same chunk origin', () => {
    const origin = { x: 1000, z: -500 }
    expect(placeTrees(terrain, 60, 3, ['betula'], 0.06, origin)).toEqual(
      placeTrees(terrain, 60, 3, ['betula'], 0.06, origin),
    )
  })

  it('never grows two trees inside each other', () => {
    const trees = placeTrees(terrain, 60, 3, ['betula'])
    for (let i = 0; i < trees.length; i++) {
      for (let j = i + 1; j < trees.length; j++) {
        const d = Math.hypot(trees[i].x - trees[j].x, trees[i].z - trees[j].z)
        expect(d).toBeGreaterThan(1.5)
      }
    }
  })

  it('grows more trees at a higher density', () => {
    const sparse = placeTrees(terrain, 60, 3, ['betula'], 0.02)
    const dense = placeTrees(terrain, 60, 3, ['betula'], 0.12)
    expect(dense.length).toBeGreaterThan(sparse.length)
  })

  it('clumps genera into stands rather than mixing them evenly', () => {
    // A forager looks for a corner of the wood, not for "trees in general".
    // Nearest neighbours should share a genus far more often than chance.
    const trees = placeTrees(terrain, 80, 7, ['betula', 'picea'])
    let same = 0
    for (const t of trees) {
      let best = Infinity
      let bestGenus = t.genus
      for (const o of trees) {
        if (o === t) continue
        const d = Math.hypot(o.x - t.x, o.z - t.z)
        if (d < best) {
          best = d
          bestGenus = o.genus
        }
      }
      if (bestGenus === t.genus) same++
    }
    expect(same / trees.length).toBeGreaterThan(0.6)
  })
})

describe('treePerches', () => {
  it('gives one perch per tree, at the tree’s own position', () => {
    const trees = placeTrees(terrain, 60, 3, ['betula'])
    const perches = treePerches(trees)
    expect(perches).toHaveLength(trees.length)
    for (let i = 0; i < trees.length; i++) {
      expect(perches[i].x).toBe(trees[i].x)
      expect(perches[i].z).toBe(trees[i].z)
    }
  })

  it('sits up in the crown, not on the ground or above the treetop', () => {
    const trees = placeTrees(terrain, 60, 3, ['betula', 'picea'])
    for (const p of treePerches(trees)) {
      const t = trees.find((o) => o.x === p.x && o.z === p.z)!
      expect(p.y).toBeGreaterThan(t.y)
      expect(p.y).toBeLessThan(t.y + t.height)
    }
  })
})

describe('buildTreeMeshes', () => {
  function totalInstances(group: THREE.Group): number {
    return group.children.reduce((n, c) => n + (c as THREE.InstancedMesh).count, 0)
  }

  it('casts no shadow at all by default, matching the existing wood', () => {
    const trees = placeTrees(terrain, 90, 3, ['betula', 'picea'])
    const group = buildTreeMeshes(trees)
    for (const child of group.children) expect(child.castShadow).toBe(false)
    expect(totalInstances(group)).toBe(trees.length * 2) // trunk + one crown mesh per tree's variant
  })

  it('scales a broadleaf crown by the genus’s own crown size, not a fixed small radius', () => {
    // Live report: "дерево — палка с крошечной кроной, посаженной не на
    // верхушке." Root cause: conifer crowns multiply their radius by the
    // genus's own LOOK.crown constant (2.4m for a birch, 3.4m for an oak),
    // but the broadleaf branch below never did — every broadleaf genus got
    // the same near-1-unit crown regardless of how wide its real canopy is
    // meant to be, reading as a twig-sized ball on a tall trunk.
    const crownXZScale = (genus: 'betula' | 'quercus', height: number): number => {
      const group = buildTreeMeshes([{ x: 0, z: 0, y: 0, genus, radius: 0.2, height }])
      const crownMesh = group.children[1] as THREE.InstancedMesh
      const m = new THREE.Matrix4()
      crownMesh.getMatrixAt(0, m)
      const scale = new THREE.Vector3()
      m.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale)
      return scale.x
    }
    const birch = crownXZScale('betula', 18) // LOOK.betula.crown = 2.4
    const oak = crownXZScale('quercus', 18) // LOOK.quercus.crown = 3.4
    expect(oak).toBeGreaterThan(birch * 1.2)
  })

  it('casts shadows only from trees within shadowRadius of the origin', () => {
    const trees = placeTrees(terrain, 90, 3, ['betula', 'picea'])
    const nearCount = trees.filter((t) => Math.hypot(t.x, t.z) <= 30).length
    // Only meaningful if the seed actually put some trees on each side of the line.
    expect(nearCount).toBeGreaterThan(0)
    expect(nearCount).toBeLessThan(trees.length)

    const group = buildTreeMeshes(trees, 30)
    const shadowCasters = group.children.filter((c) => c.castShadow)
    const nonCasters = group.children.filter((c) => !c.castShadow)
    expect(shadowCasters.length).toBeGreaterThan(0)
    expect(nonCasters.length).toBeGreaterThan(0)
  })

  it('never loses or duplicates a tree when splitting by shadowRadius', () => {
    const trees = placeTrees(terrain, 90, 3, ['betula', 'picea'])
    const withShadow = buildTreeMeshes(trees, 30)
    const without = buildTreeMeshes(trees, 0)
    expect(totalInstances(withShadow)).toBe(totalInstances(without))
  })
})
