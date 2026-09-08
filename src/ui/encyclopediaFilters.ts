import type { Species, Kind, Biome, Edibility, HymeniumType } from '../species/schema'

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

/** Meteorological, not astronomical — matches how `ecology.season` months are
 *  already written in the species data. */
export const SEASON_MONTHS: Record<Season, number[]> = {
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
  winter: [12, 1, 2],
}

export interface EncyclopediaFilters {
  kind?: Kind
  biome?: Biome
  edibility?: Edibility
  hymenium?: HymeniumType
  season?: Season
}

/** Every filter left unset passes by default — an empty filter set matches
 *  everything, the way "no filter" should. `hymenium` is mushroom-only by
 *  nature — set alongside a non-mushroom kind, it simply matches nothing,
 *  which is the same "impossible combination" behaviour any other two
 *  mismatched filters already have. */
export function matchesFilters(species: Species, filters: EncyclopediaFilters): boolean {
  if (filters.kind && species.kind !== filters.kind) return false
  if (filters.biome && !species.ecology.biomes.includes(filters.biome)) return false
  if (filters.edibility && (species.kind === 'find' || species.edibility !== filters.edibility)) return false
  if (filters.hymenium && (species.kind !== 'mushroom' || species.morphology.hymenium.type !== filters.hymenium)) {
    return false
  }
  if (filters.season && !SEASON_MONTHS[filters.season].some((m) => species.ecology.season.includes(m))) {
    return false
  }
  return true
}
