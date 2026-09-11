import * as THREE from 'three'
import { collectScatterCullers, sweepAll, STATIC_SCATTER_GROUP_NAMES } from '../../src/world/instanceCulling'

function instancedGroup(name: string, positions: [number, number][]): THREE.Group {
  const group = new THREE.Group()
  group.name = name
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
    positions.length,
  )
  const dummy = new THREE.Object3D()
  positions.forEach(([x, z], i) => {
    dummy.position.set(x, 0, z)
    dummy.rotation.set(0, i, 0) // a nonzero rotation, so "restore" has to matter
    dummy.scale.setScalar(1 + i * 0.1) // a nonuniform scale too
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  })
  group.add(mesh)
  return group
}

describe('instanceCulling', () => {
  it('names the same static-scatter groups every builder actually uses', () => {
    for (const name of ['trees', 'boulders', 'deadwood', 'leaning-trees', 'undergrowth', 'flora', 'grass']) {
      expect(STATIC_SCATTER_GROUP_NAMES.has(name)).toBe(true)
    }
  })

  it('collects nothing from a group whose name is not a known static-scatter batch', () => {
    const scene = new THREE.Scene()
    scene.add(instancedGroup('birds', [[0, 0]]))
    expect(collectScatterCullers(scene)).toHaveLength(0)
  })

  it('zeroes the scale of instances beyond the radius and leaves near ones untouched', () => {
    const scene = new THREE.Scene()
    scene.add(instancedGroup('trees', [[0, 0], [10, 0], [200, 0]]))
    const [culler] = collectScatterCullers(scene)
    expect(culler.instanceCount).toBe(3)

    culler.sweep(0, 0, 50)

    const mesh = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    const scaleOf = (i: number): THREE.Vector3 => {
      const m = new THREE.Matrix4()
      mesh.getMatrixAt(i, m)
      const scale = new THREE.Vector3()
      m.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale)
      return scale
    }
    expect(scaleOf(0).x).toBeCloseTo(1, 5) // 0m away: real scale
    expect(scaleOf(1).x).toBeCloseTo(1.1, 5) // 10m away: real scale
    expect(scaleOf(2).x).toBeCloseTo(0, 5) // 200m away: zeroed
  })

  it('restores an instance to its exact original transform once back in range', () => {
    const scene = new THREE.Scene()
    scene.add(instancedGroup('boulders', [[300, 0]]))
    const [culler] = collectScatterCullers(scene)
    const mesh = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh
    const before = new THREE.Matrix4()
    mesh.getMatrixAt(0, before)

    culler.sweep(0, 0, 50) // far: culled
    const culledM = new THREE.Matrix4()
    mesh.getMatrixAt(0, culledM)
    expect(culledM.equals(before)).toBe(false)

    culler.sweep(300, 0, 50) // camera walks up to it: back in range
    const restored = new THREE.Matrix4()
    mesh.getMatrixAt(0, restored)
    expect(restored.equals(before)).toBe(true)
  })

  it('only bumps the buffer version when a sweep actually changes something', () => {
    // needsUpdate itself is write-only on THREE.BufferAttribute (only a
    // setter, no getter — always reads back `undefined`); `version` is what
    // that setter actually increments, so it's the real, readable signal
    // that a re-upload to the GPU was requested.
    const scene = new THREE.Scene()
    scene.add(instancedGroup('grass', [[5, 5]]))
    const [culler] = collectScatterCullers(scene)
    const mesh = (scene.children[0] as THREE.Group).children[0] as THREE.InstancedMesh

    const v0 = mesh.instanceMatrix.version
    culler.sweep(0, 0, 50) // still in range: nothing flips
    expect(mesh.instanceMatrix.version).toBe(v0)

    culler.sweep(0, 0, 3) // now out of range: flips once
    expect(mesh.instanceMatrix.version).toBe(v0 + 1)

    culler.sweep(0, 0, 3) // same verdict as last sweep: nothing flips again
    expect(mesh.instanceMatrix.version).toBe(v0 + 1)
  })

  it('is a pure function of the current position: sweeping out of order gives the same verdict', () => {
    const sceneA = new THREE.Scene()
    sceneA.add(instancedGroup('flora', [[0, 0], [100, 0]]))
    const [cullerA] = collectScatterCullers(sceneA)
    cullerA.sweep(0, 0, 50)
    cullerA.sweep(0, 0, 200) // both back in range
    const meshA = (sceneA.children[0] as THREE.Group).children[0] as THREE.InstancedMesh

    const sceneB = new THREE.Scene()
    sceneB.add(instancedGroup('flora', [[0, 0], [100, 0]]))
    const [cullerB] = collectScatterCullers(sceneB)
    cullerB.sweep(0, 0, 200) // straight to the final verdict, no intermediate cull
    const meshB = (sceneB.children[0] as THREE.Group).children[0] as THREE.InstancedMesh

    const a = new THREE.Matrix4(), b = new THREE.Matrix4()
    for (let i = 0; i < 2; i++) {
      meshA.getMatrixAt(i, a)
      meshB.getMatrixAt(i, b)
      expect(a.equals(b)).toBe(true)
    }
  })

  it('sweepAll sweeps every culler in the list with the same position and radius', () => {
    const scene = new THREE.Scene()
    scene.add(instancedGroup('trees', [[500, 0]]))
    scene.add(instancedGroup('undergrowth', [[500, 0]]))
    const cullers = collectScatterCullers(scene)
    expect(cullers).toHaveLength(2)
    sweepAll(cullers, 0, 0, 50)
    for (const group of scene.children) {
      const mesh = (group as THREE.Group).children[0] as THREE.InstancedMesh
      const m = new THREE.Matrix4()
      mesh.getMatrixAt(0, m)
      const scale = new THREE.Vector3()
      m.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale)
      expect(scale.x).toBeCloseTo(0, 5)
    }
  })
})
