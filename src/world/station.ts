import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { ElevationProvider } from '../terrain/provider'
import {
  railHeightAt, STATION_PLATFORM_GAP, STATION_PLATFORM_WIDTH, STATION_PLATFORM_HEIGHT,
  type RailLine, type Station,
} from './railway'

export { STATION_PLATFORM_WIDTH, STATION_PLATFORM_HEIGHT }

/** A structurally-plain circle, like every collision obstacle here (see
 *  `world/deadwood.ts`); kept local so this stays a pure core module. */
export interface StationObstacle {
  x: number
  z: number
  radius: number
}

const SLAB_STEP = 1
/** How far the slab reaches down: the ground beside the track is not level
 *  across the platform's width, and nothing should show daylight under it. */
const SLAB_DEPTH = 0.75
const ROOF_HEIGHT = 2.35
const ROOF_LENGTH = 5.6
const POST_RADIUS = 0.07
const POST_OBSTACLE = 0.16
/** One accent colour per station, so the two ends are told apart. */
const STATION_COLORS = [0xc95f3a, 0x3a7ac9]

/**
 * The platforms: a low slab along the track (following the rail's own ground
 * profile, so it never floats or sinks along a slope), a yellow edge line, and
 * a small roofed shelter with a bench and a lamp that lights after dark. The
 * platform is not solid ground to the physics — a player walks straight onto
 * it, and its top is a step above the meadow — but the shelter's posts are.
 */
export function buildStationMesh(
  line: RailLine,
  stations: Station[],
  ground: ElevationProvider,
): { group: THREE.Group; setNight: (t: number) => void; obstacles: StationObstacle[]; dispose: () => void } {
  const group = new THREE.Group()
  group.name = 'stations'
  const obstacles: StationObstacle[] = []

  const slabMat = new THREE.MeshStandardMaterial({ color: 0x8c8a82, roughness: 1 })
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xe6c33c, roughness: 0.8 })
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 })
  const postMat = new THREE.MeshStandardMaterial({ color: 0x3a3026, roughness: 0.9 })
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff0c8, roughness: 0.4, emissive: 0xffcf8a, emissiveIntensity: 0,
  })
  void ground // the platform follows the rail line's own sampled profile (railHeightAt), same as the sleepers

  stations.forEach((s, index) => {
    const st = new THREE.Group()
    st.name = 'station'
    const nearZ = s.z + s.side * STATION_PLATFORM_GAP
    const farZ = s.z + s.side * (STATION_PLATFORM_GAP + STATION_PLATFORM_WIDTH)
    const midZ = (nearZ + farZ) / 2
    const topAt = (x: number): number => railHeightAt(line, x) + STATION_PLATFORM_HEIGHT

    // ---- the slab, in one-metre pieces each at its own height
    const slabs: THREE.BufferGeometry[] = []
    const edges: THREE.BufferGeometry[] = []
    for (let xs = s.x0; xs < s.x1 - 1e-9; xs += SLAB_STEP) {
      const xe = Math.min(s.x1, xs + SLAB_STEP)
      const top = topAt((xs + xe) / 2)
      const box = new THREE.BoxGeometry(xe - xs, SLAB_DEPTH, STATION_PLATFORM_WIDTH)
      box.translate((xs + xe) / 2, top - SLAB_DEPTH / 2, midZ)
      slabs.push(box)
      const strip = new THREE.BoxGeometry(xe - xs, 0.012, 0.12)
      strip.translate((xs + xe) / 2, top + 0.006, nearZ + s.side * 0.08)
      edges.push(strip)
    }
    const slab = new THREE.Mesh(mergeGeometries(slabs, false), slabMat)
    slab.name = 'platform'
    st.add(slab)
    const edge = new THREE.Mesh(mergeGeometries(edges, false), edgeMat)
    edge.name = 'edge'
    st.add(edge)

    // ---- the shelter: a roof on four posts along the back of the platform
    const midX = (s.x0 + s.x1) / 2
    const roofLength = Math.min(ROOF_LENGTH, s.x1 - s.x0 - 1.5)
    const topMid = topAt(midX)
    const canopy = new THREE.Group()
    canopy.name = 'canopy'
    const backZ = farZ - s.side * 0.25
    const frontZ = nearZ + s.side * 0.55
    const roofWidth = Math.abs(backZ - frontZ) + 0.5
    const roof = new THREE.Mesh(new THREE.BoxGeometry(roofLength, 0.09, roofWidth), woodMat)
    roof.position.set(midX, topMid + ROOF_HEIGHT, (backZ + frontZ) / 2)
    canopy.add(roof)
    const fascia = new THREE.Mesh(
      new THREE.BoxGeometry(roofLength, 0.28, 0.05),
      new THREE.MeshStandardMaterial({ color: STATION_COLORS[index % STATION_COLORS.length], roughness: 0.7 }),
    )
    fascia.name = 'fascia'
    fascia.position.set(midX, topMid + ROOF_HEIGHT - 0.16, frontZ - s.side * 0.22)
    canopy.add(fascia)
    for (const px of [midX - roofLength / 2 + 0.3, midX + roofLength / 2 - 0.3]) {
      for (const pz of [frontZ, backZ]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, ROOF_HEIGHT, 8), postMat)
        post.position.set(px, topAt(px) + ROOF_HEIGHT / 2, pz)
        canopy.add(post)
        obstacles.push({ x: px, z: pz, radius: POST_OBSTACLE })
      }
    }
    st.add(canopy)

    // ---- a bench against the back, and the lamp under the roof
    const bench = new THREE.Group()
    bench.name = 'bench'
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.4), woodMat)
    seat.position.set(0, 0.45, 0)
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 0.05), woodMat)
    back.position.set(0, 0.75, -s.side * 0.18)
    bench.add(seat, back)
    for (const lx of [-0.65, 0.65]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.36), postMat)
      leg.position.set(lx, 0.22, 0)
      bench.add(leg)
    }
    bench.position.set(midX, topMid, backZ - s.side * 0.35)
    st.add(bench)
    obstacles.push({ x: midX, z: backZ - s.side * 0.35, radius: 0.45 })

    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), lampMat)
    lamp.name = 'lamp'
    lamp.position.set(midX, topMid + ROOF_HEIGHT - 0.22, (backZ + frontZ) / 2)
    st.add(lamp)

    group.add(st)
  })

  const setNight = (t: number): void => {
    lampMat.emissiveIntensity = t * 2.4
  }
  const dispose = (): void => {
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose()
        const m = o.material
        if (!Array.isArray(m)) m.dispose()
      }
    })
  }
  return { group, setNight, obstacles, dispose }
}
