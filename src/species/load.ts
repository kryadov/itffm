import { parse } from 'yaml'
import { validateSpecies, type Species } from './schema'

// Vite inlines every YAML at build time — no network at runtime. Vitest
// understands import.meta.glob the same way, so tests read the very same data.
const files = import.meta.glob('/data/species/*.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

let cache: Species[] | null = null

/** Every species under data/species, sorted by scientific name. */
export function loadSpecies(): Species[] {
  if (cache) return cache
  const out: Species[] = []
  for (const [path, raw] of Object.entries(files)) {
    const file = path.split('/').pop() ?? path
    out.push(validateSpecies(parse(raw), file))
  }
  out.sort((a, b) => a.name.la.localeCompare(b.name.la))
  cache = out
  return out
}

export function speciesById(id: string): Species | undefined {
  return loadSpecies().find((s) => s.id === id)
}
