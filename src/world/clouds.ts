import * as THREE from 'three'
import { mulberry32 } from '../util/rng'

/** Clouds in a clear sky, and in an overcast one. Both are built up front. */
const CLOUDS_CLEAR = 12
const CLOUDS_OVERCAST = 40
const PUFFS = 5
/** Horizontal scatter around the camera, metres. Race-the-city's own 480m
 *  suited a car covering that in seconds; on foot in a wood with fog cut off
 *  at 140m (game/scene.ts), anything that far out would render fully
 *  fog-tinted rather than as a visible cloud. */
const SPREAD = 220
/** Height above the ground, not above sea level. Kept inside the fog
 *  distance for the same reason — a cloud beyond it is just fog-coloured
 *  haze, not a shape you can see. */
const Y_MIN = 70
const Y_MAX = 105
/** Slow wind, m/s. */
const DRIFT = 1.5

export interface Clouds {
  mesh: THREE.Group
  /** @param groundY the height of the land here — heights are measured from
   *   it, not from sea level, or a wood far up a slope would have clouds
   *   drifting through its trees. */
  update(cam: THREE.Vector3, dt: number, groundY: number): void
  /** How much cloud there is: 0 a clear day, 1 an overcast one. Rain out of a
   *  blue sky is the thing that gives weather away — see TODO.md. */
  setCover(cover: number): void
}

/**
 * Low-poly clouds high overhead, following the camera. One draw call.
 *
 * Ported from race-the-city's app/clouds.ts. Every cloud an overcast sky
 * could want is built at the start; a clear sky just draws fewer of them —
 * `InstancedMesh.count` does that for free. `Math.random()` there became
 * `mulberry32(seed)` here: the project has no undeterministic generation in
 * `src/` (see CLAUDE.md), and a wood's sky should look the same on a reload
 * just like its ground does.
 */
export function buildClouds(seed: number): Clouds {
  const rng = mulberry32(seed)
  const rnd = (): number => rng() * 2 - 1

  const total = CLOUDS_OVERCAST * PUFFS
  const material = new THREE.MeshStandardMaterial({ color: 0xf3f4f8, flatShading: true })
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), material, total)
  mesh.frustumCulled = false
  mesh.count = CLOUDS_CLEAR * PUFFS

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  let k = 0
  for (let c = 0; c < CLOUDS_OVERCAST; c++) {
    const cx = rnd() * SPREAD
    const cz = rnd() * SPREAD
    const cy = Y_MIN + rng() * (Y_MAX - Y_MIN)
    // The extra ones an overcast sky brings are bigger, and lower: an
    // overcast sky is a low ceiling, not more fluff at the same height.
    const overcast = c >= CLOUDS_CLEAR
    const size = (overcast ? 18 : 12) + rng() * 10
    for (let p = 0; p < PUFFS; p++) {
      const s = size * (0.5 + rng() * 0.6)
      scl.set(s, s * 0.5, s)
      pos.set(cx + rnd() * size * 1.4, (overcast ? cy - 25 : cy) + rnd() * size * 0.25, cz + rnd() * size * 1.4)
      mesh.setMatrixAt(k++, m.compose(pos, q, scl))
    }
  }
  mesh.instanceMatrix.needsUpdate = true

  const group = new THREE.Group()
  group.name = 'clouds'
  group.add(mesh)

  let drift = 0
  return {
    mesh: group,
    update(cam, dt, groundY) {
      drift = (drift + DRIFT * dt) % (SPREAD * 2)
      group.position.set(cam.x + drift - SPREAD, groundY, cam.z)
    },
    setCover(cover) {
      const c = Math.max(0, Math.min(1, cover))
      mesh.count = Math.round(CLOUDS_CLEAR + (CLOUDS_OVERCAST - CLOUDS_CLEAR) * c) * PUFFS
      // Grey them off: white fluff over a downpour reads as a mistake.
      material.color.setRGB(0.95 - c * 0.35, 0.956 - c * 0.34, 0.973 - c * 0.33)
    },
  }
}
