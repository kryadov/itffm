import * as THREE from 'three'
import { buildPlacementObject } from '../../src/collectible/placement'
import type { Placement } from '../../src/ecology/spawn'
import type { ElevationProvider } from '../../src/terrain/provider'
import { loadSpecies } from '../../src/species/load'

const ground: ElevationProvider = { heightAt: (x, z) => x + z }

function placementFor(speciesId: string): Placement {
  return { speciesId, x: 3, z: 4, y: 0, rotationY: 1.2, age: 0.5, seed: 7 }
}

describe('buildPlacementObject', () => {
  it('returns null for a placement whose species does not exist', () => {
    expect(buildPlacementObject(placementFor('no-such-species'), ground)).toBeNull()
  })

  it('positions the object at the placement, resampling the real ground height', () => {
    const mushroom = loadSpecies().find((s) => s.kind === 'mushroom')!
    const result = buildPlacementObject(placementFor(mushroom.id), ground)!
    expect(result.object.position.x).toBe(3)
    expect(result.object.position.z).toBe(4)
    expect(result.object.position.y).toBeCloseTo(7, 5) // ground.heightAt(3, 4) = 3 + 4
  })

  it('carries the placement in userData, for game/pick.ts', () => {
    const mushroom = loadSpecies().find((s) => s.kind === 'mushroom')!
    const p = placementFor(mushroom.id)
    const result = buildPlacementObject(p, ground)!
    expect(result.object.userData.placement).toBe(p)
  })

  it('wraps a non-mushroom kind in a pick hitbox, but not a mushroom', () => {
    const mushroom = loadSpecies().find((s) => s.kind === 'mushroom')!
    const berry = loadSpecies().find((s) => s.kind === 'berry')
    const mushroomResult = buildPlacementObject(placementFor(mushroom.id), ground)!
    expect(mushroomResult.object).toBe(mushroomResult.lod)
    if (berry) {
      const berryResult = buildPlacementObject(placementFor(berry.id), ground)!
      expect(berryResult.object).not.toBe(berryResult.lod)
    }
  })

  it('returns a THREE.LOD that can be updated against a camera without throwing', () => {
    const mushroom = loadSpecies().find((s) => s.kind === 'mushroom')!
    const result = buildPlacementObject(placementFor(mushroom.id), ground)!
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(0, 0, 0)
    expect(() => result.lod.update(camera)).not.toThrow()
  })
})
