export type CapShape =
  | 'hemispherical' | 'convex' | 'flat' | 'depressed'
  | 'funnel' | 'conical' | 'ovoid'

export interface ProfilePoint {
  /** Radius, in cap radii for capSurface, in metres for capCrossSection. */
  r: number
  /** Height, in the same units. */
  y: number
}

/**
 * Height of the cap's upper surface in cap radii, u = 0 at the centre, 1 at the
 * rim. The shapes are tuned to read as silhouettes: a forager recognises a
 * mushroom by its outline ten paces off, long before the gill colour.
 */
const HEIGHT: Record<CapShape, (u: number) => number> = {
  hemispherical: (u) => Math.sqrt(Math.max(0, 1 - u * u)),
  ovoid: (u) => 1.35 * Math.sqrt(Math.max(0, 1 - u * u)),
  conical: (u) => 1.1 * (1 - u),
  convex: (u) => 0.55 * Math.pow(Math.max(0, 1 - u * u), 0.7),
  flat: (u) => 0.12 * (1 - u * u),
  depressed: (u) => 0.14 * (1 - u * u) - 0.3 * Math.exp(-(u * u) / 0.06),
  funnel: (u) => 0.75 * u * u - 0.45,
}

export function capSurface(shape: CapShape, segments: number): ProfilePoint[] {
  const f = HEIGHT[shape]
  const pts: ProfilePoint[] = []
  for (let i = 0; i <= segments; i++) {
    const u = i / segments
    pts.push({ r: u, y: f(u) })
  }
  return pts
}

/**
 * A closed cap cross-section in metres: over the top from centre to rim, then
 * back underneath to the stipe. One lathe over it yields a solid cap with a
 * real underside.
 *
 * @param age 0 is the young form, 1 the mature one; linear in between
 */
export function capCrossSection(
  shape: CapShape,
  ageShape: CapShape,
  age: number,
  capRadius: number,
  stipeRadius: number,
  segments = 24,
): ProfilePoint[] {
  const t = Math.min(1, Math.max(0, age))
  const young = capSurface(shape, segments)
  const mature = capSurface(ageShape, segments)
  const thickness = 0.12

  const top: ProfilePoint[] = young.map((p, i) => ({
    r: p.r * capRadius,
    y: (p.y * (1 - t) + mature[i].y * t) * capRadius,
  }))

  // The underside: the same curve dropped by the flesh thickness, cut at the stipe.
  const bottom: ProfilePoint[] = []
  for (let i = top.length - 1; i >= 0; i--) {
    const r = top[i].r
    if (r < stipeRadius) break
    bottom.push({ r, y: top[i].y - thickness * capRadius })
  }
  bottom.push({ r: stipeRadius, y: top[0].y - thickness * capRadius })

  return [...top, ...bottom]
}
