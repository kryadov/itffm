import * as THREE from 'three'
import { placeHive, hiveObstacle, buildHiveMesh } from '../../src/world/hive'
import type { Tree } from '../../src/world/trees'

function tree(x: number, z: number): Tree {
  return { x, z, y: 0, genus: 'quercus', radius: 0.4, height: 14 }
}

const trees: Tree[] = [tree(10, 10), tree(-20, 5), tree(30, -30)]

describe('placeHive', () => {
  it('returns null when the wood has no trees', () => {
    expect(placeHive([], 3)).toBeNull()
  })

  it('is deterministic for the same seed', () => {
    expect(placeHive(trees, 3)).toEqual(placeHive(trees, 3))
  })

  it('sits against one of the wood\'s own trees, up the trunk', () => {
    const hive = placeHive(trees, 3)!
    const nearest = trees.reduce((best, t) => {
      const d = Math.hypot(t.x - hive.x, t.z - hive.z)
      const bestD = Math.hypot(best.x - hive.x, best.z - hive.z)
      return d < bestD ? t : best
    })
    const d = Math.hypot(nearest.x - hive.x, nearest.z - hive.z)
    expect(d).toBeGreaterThanOrEqual(nearest.radius)
    expect(d).toBeLessThan(nearest.radius + 0.5)
    expect(hive.y).toBeGreaterThan(nearest.y)
    expect(hive.y).toBeLessThan(nearest.y + nearest.height)
  })
})

describe('hiveObstacle', () => {
  it('is a small circle at the hive position', () => {
    const hive = { x: 4, y: 5, z: -2, rotationY: 0.3 }
    const o = hiveObstacle(hive)
    expect(o.x).toBe(4)
    expect(o.z).toBe(-2)
    expect(o.radius).toBeGreaterThan(0)
    expect(o.radius).toBeLessThan(1)
  })
})

describe('buildHiveMesh', () => {
  it('places the group at the hive position', () => {
    const hive = { x: 4, y: 5, z: -2, rotationY: 0.3 }
    const group = buildHiveMesh(hive)
    expect(group.position.x).toBe(4)
    expect(group.position.y).toBe(5)
    expect(group.position.z).toBe(-2)
  })
})

describe('buildHiveMesh — a skep that reads as a beehive', () => {
  // A live request (2026-09-24): the hive was a plain straw cone on a board.
  const hive = { x: 0, y: 0, z: 0, rotationY: 0 }
  const names = (): string[] => {
    const out: string[] = []
    buildHiveMesh(hive).traverse((o) => out.push(o.name))
    return out
  }

  it('is coiled straw: several rings, in more than one shade', () => {
    const g = buildHiveMesh(hive)
    const coils: THREE.Mesh[] = []
    g.traverse((o) => { if (o.name === 'coil') coils.push(o as THREE.Mesh) })
    expect(coils.length).toBeGreaterThanOrEqual(5)
    const shades = new Set(coils.map((c) => (c.material as THREE.MeshStandardMaterial).color.getHex()))
    expect(shades.size).toBeGreaterThan(1)
  })

  it('has an entrance, a little roof, brackets under its shelf and honey at the door', () => {
    const n = names()
    for (const want of ['entrance', 'roof', 'bracket', 'honeyDrip']) expect(n).toContain(want)
  })

  it('narrows to the top like a skep', () => {
    const g = buildHiveMesh(hive)
    const coils: THREE.Mesh[] = []
    g.traverse((o) => { if (o.name === 'coil') coils.push(o as THREE.Mesh) })
    const sorted = [...coils].sort((a, b) => a.position.y - b.position.y)
    const r = (m: THREE.Mesh) => (m.geometry as THREE.TorusGeometry).parameters.radius * m.scale.x
    expect(r(sorted[sorted.length - 1])).toBeLessThan(r(sorted[0]) * 0.6)
  })
})
