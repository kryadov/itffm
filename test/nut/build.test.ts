import * as THREE from 'three'
import { buildNut } from '../../src/nut/build'
import type { NutMorphology } from '../../src/species/schema'

const leshina: NutMorphology = {
  bodyColor: '#8a5a2a',
  capColor: '#5a7a3a',
  size: [12, 18],
  capCoverage: [0.4, 0.7],
}

describe('buildNut', () => {
  it('gives the same nut for the same seed', () => {
    const a = buildNut(leshina, 123, 0.8)
    const b = buildNut(leshina, 123, 0.8)
    const bodyA = (a.getObjectByName('body') as THREE.Mesh).geometry as THREE.SphereGeometry
    const bodyB = (b.getObjectByName('body') as THREE.Mesh).geometry as THREE.SphereGeometry
    expect(bodyA.parameters.radius).toBe(bodyB.parameters.radius)
  })

  it('gives a different nut for a different seed', () => {
    const a = buildNut(leshina, 1, 0.8)
    const b = buildNut(leshina, 2, 0.8)
    const bodyA = (a.getObjectByName('body') as THREE.Mesh).geometry as THREE.SphereGeometry
    const bodyB = (b.getObjectByName('body') as THREE.Mesh).geometry as THREE.SphereGeometry
    expect(bodyA.parameters.radius).not.toBe(bodyB.parameters.radius)
  })

  it('always builds a body and a cap', () => {
    const g = buildNut(leshina, 5, 0.5)
    expect(g.getObjectByName('body')).toBeDefined()
    expect(g.getObjectByName('cap')).toBeDefined()
  })

  it('grows a fuller cap as it ripens', () => {
    let green = 0
    let ripe = 0
    for (let seed = 0; seed < 40; seed++) {
      const capGreen = (buildNut(leshina, seed, 0).getObjectByName('cap') as THREE.Mesh)
        .geometry as THREE.SphereGeometry
      const capRipe = (buildNut(leshina, seed, 1).getObjectByName('cap') as THREE.Mesh)
        .geometry as THREE.SphereGeometry
      green += capGreen.parameters.thetaLength
      ripe += capRipe.parameters.thetaLength
    }
    expect(ripe).toBeGreaterThan(green)
  })

  it('stays a plausible size: millimetres to a couple centimetres, not a metre', () => {
    const box = new THREE.Box3().setFromObject(buildNut(leshina, 9, 1))
    const size = box.getSize(new THREE.Vector3())
    expect(Math.max(size.x, size.y, size.z)).toBeLessThan(0.05)
    expect(Math.max(size.x, size.y, size.z)).toBeGreaterThan(0.001)
  })
})
