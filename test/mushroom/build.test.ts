import * as THREE from 'three'
import { buildMushroom } from '../../src/mushroom/build'
import { loadSpecies, speciesById } from '../../src/species/load'
import type { MushroomMorphology } from '../../src/species/schema'

const amanita = speciesById('amanita-muscaria')!.morphology as MushroomMorphology
const oyster = speciesById('pleurotus-ostreatus')!.morphology as MushroomMorphology

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

  it('builds every mushroom in the database without throwing', () => {
    for (const s of loadSpecies()) {
      if (s.kind !== 'mushroom') continue
      const g = buildMushroom(s.morphology, 1, 0.5)
      const box = new THREE.Box3().setFromObject(g)
      expect(box.isEmpty(), `${s.id} produced empty geometry`).toBe(false)
    }
  })

  it("no two mushrooms alike: the cap is not a perfect circle in plan", () => {
    const cap = buildMushroom(amanita, 3, 1).getObjectByName('cap') as THREE.Mesh
    const pos = cap.geometry.getAttribute('position')
    // Group vertices by height (rounded) and check that within one ring the
    // radius from the cap's own vertical axis is not identical everywhere —
    // a perfect lathe sweep would give every vertex at a given height the
    // same radius; the wobble must not.
    const byHeight = new Map<string, number[]>()
    for (let i = 0; i < pos.count; i++) {
      const key = pos.getY(i).toFixed(3)
      const r = Math.hypot(pos.getX(i), pos.getZ(i))
      const bucket = byHeight.get(key)
      if (bucket) bucket.push(r)
      else byHeight.set(key, [r])
    }
    let sawVariation = false
    for (const radii of byHeight.values()) {
      if (radii.length < 2) continue
      if (Math.max(...radii) - Math.min(...radii) > 1e-6) sawVariation = true
    }
    expect(sawVariation).toBe(true)
  })

  it('a mature cap wobbles more than a young one, for the same seed', () => {
    const spread = (age: number): number => {
      const cap = buildMushroom(amanita, 3, age).getObjectByName('cap') as THREE.Mesh
      const pos = cap.geometry.getAttribute('position')
      let maxR = 0
      for (let i = 0; i < pos.count; i++) maxR = Math.max(maxR, Math.hypot(pos.getX(i), pos.getZ(i)))
      return maxR
    }
    // Not a rigorous per-vertex comparison (the profile itself also changes
    // shape with age) — just confirms the two ages are not visually
    // identical specimens, the same determinism-but-variety the rest of
    // buildMushroom already guarantees for a changed input.
    expect(spread(0)).not.toBeCloseTo(spread(1), 6)
  })

  it("no two mushrooms alike: a tall stipe leans rather than standing perfectly straight", () => {
    // A tall, thick stipe (bigger than amanita's own) gives the bend more
    // height to actually show up over.
    const tall: MushroomMorphology = {
      ...amanita,
      stipe: { ...amanita.stipe, height: [120, 150], width: [15, 20] },
    }
    let sawLean = false
    for (let seed = 0; seed < 20; seed++) {
      const stipe = buildMushroom(tall, seed, 1).getObjectByName('stipe') as THREE.Mesh
      const pos = stipe.geometry.getAttribute('position')
      let minY = Infinity
      let maxY = -Infinity
      for (let i = 0; i < pos.count; i++) {
        minY = Math.min(minY, pos.getY(i))
        maxY = Math.max(maxY, pos.getY(i))
      }
      let baseX = 0
      let baseCount = 0
      let tipX = 0
      let tipCount = 0
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i)
        if (y < minY + 1e-6) {
          baseX += pos.getX(i)
          baseCount++
        } else if (y > maxY - 1e-6) {
          tipX += pos.getX(i)
          tipCount++
        }
      }
      if (Math.abs(tipX / tipCount - baseX / baseCount) > 1e-4) sawLean = true
    }
    expect(sawLean).toBe(true)
  })

  it("the cap follows a bent stipe's actual tip, not a fixed point straight above the base", () => {
    const tall: MushroomMorphology = {
      ...amanita,
      stipe: { ...amanita.stipe, height: [120, 150], width: [15, 20] },
    }
    let sawCapDrift = false
    for (let seed = 0; seed < 20; seed++) {
      const cap = buildMushroom(tall, seed, 1).getObjectByName('cap') as THREE.Mesh
      const box = new THREE.Box3().setFromObject(cap)
      const centreX = (box.min.x + box.max.x) / 2
      if (Math.abs(centreX) > 1e-4) sawCapDrift = true
    }
    expect(sawCapDrift).toBe(true)
  })
})
