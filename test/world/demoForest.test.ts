import { demoForest } from '../../src/world/demoForest'
import { buildBiomeMap } from '../../src/world/biome'
import { placeOsmTrees } from '../../src/world/osmTrees'
import type { ElevationProvider } from '../../src/terrain/provider'

const flat: ElevationProvider = { heightAt: () => 0 }

describe('demoForest', () => {
  it('describes a real wood, not an empty stub', () => {
    // This is what the player gets when the network is down. If it were empty
    // they would stand in a field and think the game was broken.
    const { world } = demoForest()
    expect(world.woods.length).toBeGreaterThan(0)
  })

  it('is deterministic', () => {
    expect(demoForest().world).toEqual(demoForest().world)
  })

  it('grows trees and resolves to a forest biome', () => {
    const { world, center } = demoForest()
    expect(placeOsmTrees(world, flat, center.lat, 1, 200).length).toBeGreaterThan(50)
    expect(buildBiomeMap(world, flat, center.lat).at(0, 0)).toMatch(/^forest-/)
  })

  it('offers both conifer and broadleaf ground to walk between', () => {
    const kinds = new Set(demoForest().world.woods.map((w) => w.leafType))
    expect(kinds.size).toBeGreaterThan(1)
  })

  it('carries a plausible centre', () => {
    const { center } = demoForest()
    expect(Math.abs(center.lat)).toBeLessThanOrEqual(90)
    expect(Math.abs(center.lon)).toBeLessThanOrEqual(180)
  })
})
