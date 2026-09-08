import * as THREE from 'three'
import { buildSky } from '../../src/world/sky'

describe('buildSky', () => {
  it('builds a back-facing dome painted first', () => {
    const sky = buildSky()
    expect(sky.mesh.geometry.type).toBe('SphereGeometry')
    const mat = sky.mesh.material as THREE.ShaderMaterial
    expect(mat.side).toBe(THREE.BackSide)
    expect(sky.mesh.renderOrder).toBeLessThan(0)
    expect(sky.mesh.frustumCulled).toBe(false)
  })

  it('follows the camera so the player never reaches its edge', () => {
    const sky = buildSky()
    const pos = new THREE.Vector3(120, 5, -40)
    sky.update(pos, 0xa8c0a2, 0xfff1cf, new THREE.Vector3(1, 2, 1), 1, 0)
    expect(sky.mesh.position.equals(pos)).toBe(true)
  })

  it('applies the colours and sun direction it is given', () => {
    const sky = buildSky()
    const dir = new THREE.Vector3(1, 2, 1)
    sky.update(new THREE.Vector3(), 0xa8c0a2, 0xfff1cf, dir, 0.5, 0.3)
    const mat = sky.mesh.material as THREE.ShaderMaterial
    expect((mat.uniforms.uHorizon.value as THREE.Color).getHex()).toBe(0xa8c0a2)
    expect((mat.uniforms.uSun.value as THREE.Color).getHex()).toBe(0xfff1cf)
    expect(mat.uniforms.uSunVis.value).toBe(0.5)
    expect(mat.uniforms.uNight.value).toBe(0.3)
    expect((mat.uniforms.uSunDir.value as THREE.Vector3).length()).toBeCloseTo(1, 5)
  })
})
