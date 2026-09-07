import * as THREE from 'three'
import { buildMushroom } from '../../src/mushroom/build'
import { loadSpecies, speciesById } from '../../src/species/load'

const amanita = speciesById('amanita-muscaria')!.morphology
const oyster = speciesById('pleurotus-ostreatus')!.morphology

function capPositions(g: THREE.Group): number[] {
  const cap = g.getObjectByName('cap') as THREE.Mesh
  return Array.from(cap.geometry.getAttribute('position').array as Float32Array)
}

describe('buildMushroom', () => {
  it('gives the same geometry for the same seed', () => {
    expect(capPositions(buildMushroom(amanita, 123, 0.5)))
      .toEqual(capPositions(buildMushroom(amanita, 123, 0.5)))
  })

  it('gives different specimens for different seeds', () => {
    expect(capPositions(buildMushroom(amanita, 1, 0.5)))
      .not.toEqual(capPositions(buildMushroom(amanita, 2, 0.5)))
  })

  it('gives the fly agaric a ring and a volva', () => {
    const g = buildMushroom(amanita, 5, 0.5)
    expect(g.getObjectByName('ring')).toBeDefined()
    expect(g.getObjectByName('volva')).toBeDefined()
  })

  it('gives the oyster mushroom neither', () => {
    const g = buildMushroom(oyster, 5, 0.5)
    expect(g.getObjectByName('ring')).toBeUndefined()
    expect(g.getObjectByName('volva')).toBeUndefined()
  })

  it('always builds a cap, a stipe and a hymenium', () => {
    const g = buildMushroom(amanita, 5, 0.5)
    for (const n of ['cap', 'stipe', 'hymenium']) expect(g.getObjectByName(n)).toBeDefined()
  })

  it('stands on the ground rather than sinking into it', () => {
    const box = new THREE.Box3().setFromObject(buildMushroom(amanita, 9, 0.5))
    expect(box.min.y).toBeGreaterThan(-0.02)
  })

  it('stays a plausible size: under 30 cm, over 1 cm', () => {
    const box = new THREE.Box3().setFromObject(buildMushroom(amanita, 9, 1))
    const h = box.max.y - box.min.y
    expect(h).toBeGreaterThan(0.01)
    expect(h).toBeLessThan(0.3)
  })

  it('builds every species in the database without throwing', () => {
    for (const s of loadSpecies()) {
      const g = buildMushroom(s.morphology, 1, 0.5)
      const box = new THREE.Box3().setFromObject(g)
      expect(box.isEmpty(), `${s.id} produced empty geometry`).toBe(false)
    }
  })
})
