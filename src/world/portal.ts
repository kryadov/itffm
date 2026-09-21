import * as THREE from 'three'
import { portalSites, yawOf, type RailLine } from './railway'

/** A plain circle, like every collision obstacle here (see `world/deadwood.ts`). */
export interface PortalObstacle {
  x: number
  z: number
  radius: number
}

const STONE = 0x7d7a72
const OPENING_WIDTH = 2.1
const OPENING_HEIGHT = 2.6

/**
 * The two ends of the line: the rails run into a hillside through a stone portal
 * — a headwall with an opening, wing walls, a dark mouth — under a long grassy
 * mound. The train comes out of one and goes into the other, so the line comes
 * from somewhere and goes somewhere instead of stopping in the middle of the wood.
 * Built in each portal's own frame: x into the hill, z across, y absolute.
 */
export function buildPortalMesh(line: RailLine): { group: THREE.Group; obstacles: PortalObstacle[]; dispose: () => void } {
  const group = new THREE.Group()
  group.name = 'portals'
  const obstacles: PortalObstacle[] = []
  const stoneMat = new THREE.MeshStandardMaterial({ color: STONE, roughness: 1, flatShading: true })
  const capMat = new THREE.MeshStandardMaterial({ color: 0x5f5c55, roughness: 1, flatShading: true })
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })

  for (const site of portalSites(line)) {
    const portal = new THREE.Group()
    portal.name = 'portal'
    portal.position.set(site.x, site.y, site.z)
    // Local +x runs into the hill.
    portal.rotation.y = yawOf(site.ox, site.oz)

    // The headwall: two pillars and a lintel round the opening.
    const pillarW = 0.8
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.7, OPENING_HEIGHT + 0.5, pillarW), stoneMat)
      pillar.name = 'pillar'
      pillar.position.set(0, (OPENING_HEIGHT + 0.5) / 2 - 0.2, side * (OPENING_WIDTH / 2 + pillarW / 2))
      portal.add(pillar)
      // A wing wall running back and out along the cutting's side.
      const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.9, 0.45), stoneMat)
      wing.name = 'wing'
      wing.position.set(1.0, 0.75, side * (OPENING_WIDTH / 2 + pillarW + 0.9))
      wing.rotation.y = side * -0.42
      portal.add(wing)
    }
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.5, OPENING_WIDTH + pillarW * 2 + 0.3), capMat,
    )
    lintel.name = 'lintel'
    lintel.position.set(0, OPENING_HEIGHT + 0.25 - 0.05, 0)
    portal.add(lintel)
    // The keystone, a slightly proud block in the middle.
    const key = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.5), stoneMat)
    key.position.set(-0.05, OPENING_HEIGHT + 0.22, 0)
    portal.add(key)

    // The mouth: a black wall a little inside the opening, so a car going in
    // is swallowed by it rather than seen running on inside the hill.
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(OPENING_WIDTH, OPENING_HEIGHT), darkMat)
    mouth.name = 'mouth'
    mouth.rotation.y = Math.PI / 2
    mouth.position.set(0.35, OPENING_HEIGHT / 2 - 0.05, 0)
    portal.add(mouth)
    // The floor and walls between: black too, so the opening has depth.
    const tunnel = new THREE.Mesh(new THREE.BoxGeometry(0.7, OPENING_HEIGHT, OPENING_WIDTH), new THREE.MeshBasicMaterial({ color: 0x0a0a0a, side: THREE.BackSide }))
    tunnel.position.set(0, OPENING_HEIGHT / 2 - 0.05, 0)
    portal.add(tunnel)

    // The mound: half a squashed sphere of earth behind the headwall, cut flat at
    // the wall so it never pokes out in front of it.
    const RX = 8
    const RY = 4.8
    const RZ = 3.6
    const mound = new THREE.Mesh(
      new THREE.SphereGeometry(1, 18, 10, Math.PI / 2, Math.PI, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x5c7d4a, roughness: 1, flatShading: true, side: THREE.DoubleSide }),
    )
    mound.name = 'mound'
    mound.scale.set(RX, RY, RZ)
    mound.position.set(0.2, -0.3, 0)
    portal.add(mound)
    // A few boulders on it, so it is not a smooth green egg.
    for (const [x, z, r] of [[2.4, 1.3, 0.5], [3.9, -1.0, 0.42], [1.6, -1.6, 0.35]] as const) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), capMat)
      const top = RY * Math.sqrt(Math.max(0, 1 - (x / RX) ** 2 - (z / RZ) ** 2)) - 0.3
      rock.position.set(x + 0.2, top - 0.05, z)
      rock.rotation.set(x, z, 0)
      portal.add(rock)
    }
    group.add(portal)

    // Solid to the player: the whole mound, and the wings beside the mouth.
    for (const d of [1.6, 4.4]) obstacles.push({ x: site.x + site.ox * d, z: site.z + site.oz * d, radius: 2.7 })
    for (const side of [-1, 1]) {
      // Local z sign: the frame's +z is (sin, cos) of the yaw, world offset = side * (oz-perp).
      const px = -site.oz * side * (OPENING_WIDTH / 2 + pillarW + 0.6)
      const pz = site.ox * side * (OPENING_WIDTH / 2 + pillarW + 0.6)
      obstacles.push({ x: site.x + px, z: site.z + pz, radius: 0.9 })
    }
  }

  const dispose = (): void => {
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose()
        if (!Array.isArray(o.material)) o.material.dispose()
      }
    })
  }
  return { group, obstacles, dispose }
}
