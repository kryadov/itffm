import * as THREE from 'three'
import { createSwarm, createBees, createDragonflies, type SwarmAnchor } from '../../src/world/insects'
import { mulberry32 } from '../../src/util/rng'

function buildParts(mat: THREE.Material, n: number): THREE.InstancedMesh[] {
  return [new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.02, 0), mat, n)]
}
function pose(parts: THREE.InstancedMesh[], i: number, x: number, y: number, z: number): void {
  const m = new THREE.Matrix4().setPosition(x, y, z)
  parts[0].setMatrixAt(i, m)
}

describe('createSwarm', () => {
  const anchor: SwarmAnchor = { x: 5, y: 2, z: -3 }

  it('adds a named group to the scene', () => {
    const scene = new THREE.Scene()
    createSwarm(scene, 'bees', mulberry32(1), 6, [anchor], 0.4, 2, 0.1, buildParts, pose, 0xffcc33)
    expect(scene.getObjectByName('bees')).toBeDefined()
  })

  it('is deterministic for the same seed', () => {
    const sceneA = new THREE.Scene()
    const sceneB = new THREE.Scene()
    const a = createSwarm(sceneA, 'bees', mulberry32(5), 6, [anchor], 0.4, 2, 0.1, buildParts, pose, 0xffcc33)
    const b = createSwarm(sceneB, 'bees', mulberry32(5), 6, [anchor], 0.4, 2, 0.1, buildParts, pose, 0xffcc33)
    a.update(1 / 20)
    b.update(1 / 20)
    const meshA = sceneA.getObjectByName('bees')!.children[0] as THREE.InstancedMesh
    const meshB = sceneB.getObjectByName('bees')!.children[0] as THREE.InstancedMesh
    expect(meshA.instanceMatrix.array).toEqual(meshB.instanceMatrix.array)
  })

  it('keeps every insect within orbitRadius (+slack) of its anchor, in the xz plane', () => {
    const scene = new THREE.Scene()
    const swarm = createSwarm(scene, 'bees', mulberry32(2), 8, [anchor], 0.4, 2, 0.1, buildParts, pose, 0xffcc33)
    const mesh = scene.getObjectByName('bees')!.children[0] as THREE.InstancedMesh
    const m = new THREE.Matrix4()
    const p = new THREE.Vector3()
    for (let step = 0; step < 200; step++) {
      swarm.update(1 / 20)
    }
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m)
      p.setFromMatrixPosition(m)
      const d = Math.hypot(p.x - anchor.x, p.z - anchor.z)
      expect(d).toBeLessThanOrEqual(0.4 + 1e-6)
    }
  })

  it('cycles multiple insects across multiple anchors', () => {
    const scene = new THREE.Scene()
    const anchors: SwarmAnchor[] = [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 100 }]
    const swarm = createSwarm(scene, 'dragonflies', mulberry32(3), 4, anchors, 1, 1, 0, buildParts, pose, 0x2288aa)
    swarm.update(0.01)
    const mesh = scene.getObjectByName('dragonflies')!.children[0] as THREE.InstancedMesh
    const m = new THREE.Matrix4()
    const p = new THREE.Vector3()
    let nearFirst = 0
    let nearSecond = 0
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m)
      p.setFromMatrixPosition(m)
      if (Math.hypot(p.x, p.z) < 5) nearFirst++
      if (Math.hypot(p.x - 100, p.z - 100) < 5) nearSecond++
    }
    expect(nearFirst).toBeGreaterThan(0)
    expect(nearSecond).toBeGreaterThan(0)
  })

  it('hides and disposes without throwing', () => {
    const scene = new THREE.Scene()
    const swarm = createSwarm(scene, 'bees', mulberry32(1), 3, [anchor], 0.4, 2, 0.1, buildParts, pose, 0xffcc33)
    swarm.setEnabled(false)
    expect(scene.getObjectByName('bees')!.visible).toBe(false)
    expect(() => swarm.dispose()).not.toThrow()
    expect(scene.getObjectByName('bees')).toBeUndefined()
  })
})

describe('createBees', () => {
  it('circles the hive point', () => {
    const scene = new THREE.Scene()
    const bees = createBees(scene, mulberry32(1), 6, { x: 10, y: 3, z: -4 })
    expect(scene.getObjectByName('bees')).toBeDefined()
    bees.update(1 / 20)
    const mesh = scene.getObjectByName('bees')!.children[0] as THREE.InstancedMesh
    const m = new THREE.Matrix4()
    const p = new THREE.Vector3()
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m)
      p.setFromMatrixPosition(m)
      expect(Math.hypot(p.x - 10, p.z + 4)).toBeLessThan(2)
    }
  })
})

describe('createDragonflies', () => {
  it('circles each given anchor with finite positions over a long run', () => {
    const scene = new THREE.Scene()
    const anchors: SwarmAnchor[] = [{ x: 0, y: 1, z: 0 }, { x: 20, y: 1, z: 5 }]
    const dragonflies = createDragonflies(scene, mulberry32(2), 4, anchors)
    for (let i = 0; i < 300; i++) dragonflies.update(1 / 20)
    const body = scene.getObjectByName('dragonflies')!.children[0] as THREE.InstancedMesh
    const m = new THREE.Matrix4()
    const p = new THREE.Vector3()
    for (let i = 0; i < body.count; i++) {
      body.getMatrixAt(i, m)
      p.setFromMatrixPosition(m)
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.z)).toBe(true)
    }
  })
})
