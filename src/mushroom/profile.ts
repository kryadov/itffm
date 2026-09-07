export type CapShape =
  | 'hemispherical' | 'convex' | 'flat' | 'depressed'
  | 'funnel' | 'conical' | 'ovoid'

export interface ProfilePoint {
  /** Радиус в долях радиуса шляпки (в capSurface) или в метрах (в capCrossSection). */
  r: number
  /** Высота там же. */
  y: number
}

/**
 * Высота верхней поверхности шляпки в долях радиуса, u = 0 в центре, 1 на краю.
 * Формы подобраны так, чтобы читались силуэтом: именно по силуэту грибник
 * узнаёт гриб за десять шагов, а не по цвету пластинок.
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
 * Замкнутое сечение шляпки в метрах: сверху от центра к краю, затем снизу
 * обратно к ножке. Одно тело вращения по нему даёт цельную шляпку с изнанкой.
 *
 * @param age 0 — молодая форма, 1 — зрелая; между ними линейная интерполяция
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

  // Изнанка: та же кривая, опущенная на толщину мякоти, обрезанная у ножки.
  const bottom: ProfilePoint[] = []
  for (let i = top.length - 1; i >= 0; i--) {
    const r = top[i].r
    if (r < stipeRadius) break
    bottom.push({ r, y: top[i].y - thickness * capRadius })
  }
  bottom.push({ r: stipeRadius, y: top[0].y - thickness * capRadius })

  return [...top, ...bottom]
}
