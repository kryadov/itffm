/**
 * Deterministic PRNG (mulberry32). Everything generated in the game —
 * mushrooms, trees, terrain, placement — draws from here rather than
 * Math.random: the same seed must give the same forest in every browser and
 * across reloads.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a. Turns strings into seeds: a species id, a place name. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function randRange(rng: () => number, [min, max]: [number, number]): number {
  return min + rng() * (max - min)
}

/** Weighted pick. Returns undefined when every weight is zero. */
export function pickWeighted<T>(
  rng: () => number,
  items: readonly T[],
  weight: (item: T) => number,
): T | undefined {
  let total = 0
  for (const it of items) total += Math.max(0, weight(it))
  if (total <= 0) return undefined
  let r = rng() * total
  for (const it of items) {
    r -= Math.max(0, weight(it))
    if (r <= 0) return it
  }
  return items[items.length - 1]
}
