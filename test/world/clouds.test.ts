import * as THREE from 'three'
import { buildClouds } from '../../src/world/clouds'

describe('buildClouds', () => {
  it('is deterministic', () => {
    const a = buildClouds(7).mesh.children[0] as THREE.InstancedMesh
    const b = buildClouds(7).mesh.children[0] as THREE.InstancedMesh
    expect(a.instanceMatrix.array).toEqual(b.instanceMatrix.array)
  })

  it('draws a different layout for a different seed', () => {
    const a = buildClouds(1).mesh.children[0] as THREE.InstancedMesh
    const b = buildClouds(2).mesh.children[0] as THREE.InstancedMesh
    expect(a.instanceMatrix.array).not.toEqual(b.instanceMatrix.array)
  })

  it('draws only the clear-sky share of instances by default', () => {
    const mesh = buildClouds(7).mesh.children[0] as THREE.InstancedMesh
    expect(mesh.count).toBeGreaterThan(0)
    expect(mesh.count).toBeLessThan(mesh.instanceMatrix.count)
  })

  it('draws more instances as cover grows, up to the full overcast set', () => {
    const clouds = buildClouds(7)
    const mesh = clouds.mesh.children[0] as THREE.InstancedMesh
    const clear = mesh.count
    clouds.setCover(1)
    expect(mesh.count).toBeGreaterThan(clear)
    expect(mesh.count).toBe(mesh.instanceMatrix.count)
  })

  it('drifts the group with the camera plus wind, wrapping within the spread', () => {
    const clouds = buildClouds(7)
    const cam = new THREE.Vector3(10, 0, 5)
    clouds.update(cam, 1, 3)
    const first = clouds.mesh.position.x
    clouds.update(cam, 1, 3)
    expect(clouds.mesh.position.x).toBeGreaterThan(first)
    expect(clouds.mesh.position.y).toBe(3)
    expect(clouds.mesh.position.z).toBe(cam.z)
  })
})
