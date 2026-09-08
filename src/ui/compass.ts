const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
/** Degrees of strip shown between two neighbouring compass points. */
const STEP = 45
/** Pixels the strip moves per degree of bearing. */
const PX_PER_DEGREE = 2.4

/**
 * World bearing in degrees, 0 at north, 90 at east — matching how a hiker
 * reads a compass, not how `yaw` is defined internally.
 *
 * The scene's ground plane has x east and z south (see geo/project.ts), and
 * facing yaw 0 walks toward -z, i.e. north. Turning right (larger yaw) turns
 * the view west, so bearing runs the opposite way to yaw; that inversion is
 * the one thing this function exists to get right once, rather than at every
 * call site.
 */
export function bearingDegrees(yaw: number): number {
  const deg = (-yaw * 180) / Math.PI
  return ((deg % 360) + 360) % 360
}

/** The nearest of the eight compass points to a bearing in degrees. */
export function compassLabel(bearing: number): string {
  const index = Math.round(bearing / STEP) % POINTS.length
  return POINTS[(index + POINTS.length) % POINTS.length]
}

/**
 * A scrolling compass tape: cheap, dependency-free, and deliberately honest
 * about what it tells you. It says which way is north — nothing about where
 * you are — so finding your own way back through the wood stays the point of
 * the walk instead of something the interface does for you.
 */
export function createCompass(root: HTMLElement): { update(yaw: number): void } {
  const marks: { deg: number; label: string }[] = []
  // Three laps so the strip never runs out under the viewport window while scrolling.
  for (let lap = -1; lap <= 1; lap++) {
    for (let i = 0; i < POINTS.length; i++) marks.push({ deg: lap * 360 + i * STEP, label: POINTS[i] })
  }

  root.insertAdjacentHTML(
    'beforeend',
    `<div id="compass" style="position:fixed;left:50%;top:14px;transform:translateX(-50%);width:220px;height:20px;overflow:hidden;pointer-events:none">
       <div id="compass-strip" style="position:absolute;top:0;left:50%;height:100%;white-space:nowrap;font-size:13px;text-shadow:0 1px 3px #000">
         ${marks
           .map(
             (m) =>
               `<span style="position:absolute;left:${m.deg * PX_PER_DEGREE}px;transform:translateX(-50%);opacity:${m.label.length === 1 ? 1 : 0.6}">${m.label}</span>`,
           )
           .join('')}
       </div>
       <div style="position:absolute;left:50%;top:100%;width:1px;height:5px;background:#fff;opacity:.7"></div>
     </div>`,
  )
  const strip = root.querySelector<HTMLElement>('#compass-strip')!

  return {
    update(yaw: number) {
      const bearing = bearingDegrees(yaw)
      strip.style.transform = `translateX(${-bearing * PX_PER_DEGREE}px)`
    },
  }
}
