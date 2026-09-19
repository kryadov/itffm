import * as THREE from 'three'

/**
 * Real-world-shaped models for the five quest items — shared by the mesh a
 * player picks up out in the wood (`main.ts`'s `showQuestItem`) and, for the
 * two that leave a trophy, the one `world/shelter.ts` displays once
 * delivered. One geometry per item, built once here, so the two can never
 * quietly drift apart the way two independent "good enough" primitives
 * would (live request, 2026-09-15: the pickup meshes read as unlabelled
 * coloured shapes, not the tools they are).
 *
 * Every model is built centred on its own local origin, standing as it
 * would rest on the ground — the caller positions, scales and (for the
 * rod/bike trophies) re-poses the returned group, none of that here.
 */

const WOOD_COLOR = 0x6b4a30
const METAL_COLOR = 0x8a8f96

/** A hand axe: a wooden haft with a wedge-shaped steel head near the top —
 *  the head a flattened, tapered box rather than a plain cube, so the
 *  silhouette reads as a blade and not a doorknob. */
export function buildAxeModel(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'axeModel'

  const haftMat = new THREE.MeshStandardMaterial({ color: WOOD_COLOR, roughness: 0.8 })
  const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.5, 8), haftMat)
  haft.position.y = 0.25
  group.add(haft)

  const headMat = new THREE.MeshStandardMaterial({ color: METAL_COLOR, roughness: 0.4, metalness: 0.6, flatShading: true })
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 4), headMat)
  head.name = 'head'
  head.rotation.z = -Math.PI / 2
  head.rotation.y = Math.PI / 4
  head.scale.set(1, 1, 0.45)
  head.position.set(0.05, 0.44, 0)
  group.add(head)

  return group
}

/** A hurricane lamp: a squat body, a warm glass chimney and a wire handle —
 *  the shape everyone already reads as "carried light," not just a coloured
 *  box. `chimneyMat` is returned too, so a caller can drive its own glow. */
export function buildLampModel(): { group: THREE.Group; chimneyMat: THREE.MeshStandardMaterial } {
  const group = new THREE.Group()
  group.name = 'lampModel'

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2e2a24, roughness: 0.5, metalness: 0.4 })
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.05, 10), bodyMat)
  base.position.y = 0.025
  group.add(base)

  const chimneyMat = new THREE.MeshStandardMaterial({
    color: 0xffe9b0, roughness: 0.3, transparent: true, opacity: 0.85, emissive: 0xffb84d, emissiveIntensity: 0,
  })
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.14, 10), chimneyMat)
  chimney.name = 'chimney'
  chimney.position.y = 0.12
  group.add(chimney)

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.03, 10), bodyMat)
  cap.position.y = 0.205
  group.add(cap)

  const handleMat = bodyMat
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.006, 6, 12, Math.PI), handleMat)
  handle.position.y = 0.25
  handle.rotation.x = Math.PI / 2
  group.add(handle)

  return { group, chimneyMat }
}

/** A fishing rod: a tapered pole and a reel near the grip — pose (leaning,
 *  lying flat) is entirely the caller's own rotation on the returned group,
 *  same convention `buildBikeModel` follows. */
export function buildRodModel(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'rodModel'
  const rodMat = new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.7 })
  const rodPole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 1.5, 8), rodMat)
  rodPole.position.y = 0.75
  group.add(rodPole)
  const reelMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.5, metalness: 0.4 })
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10), reelMat)
  reel.rotation.z = Math.PI / 2
  reel.position.set(0, 0.22, 0.015)
  group.add(reel)
  return group
}


/** A cylinder joining two points in the bike's own side-view (x, y) plane. */
function tube(a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material): THREE.Mesh {
  const dir = b.clone().sub(a)
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 6), mat)
  mesh.position.copy(a).add(b).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  return mesh
}

/** A bicycle: two spoked wheels, a diamond frame, a fork, handlebar, saddle
 *  and a chainring, flat primitives only, same as everything else this
 *  project draws — see
 *  docs/superpowers/specs/2026-09-13-quest-items-design.md's own decision
 *  on the bike being a passive stat, never ridden or mounted.
 *
 *  Side profile in the x-y plane, front wheel toward +x, wheels resting on
 *  y = 0. (The first version rotated the wheels a quarter turn about y, so
 *  they stood across the bike instead of along it and nothing read as a
 *  bicycle — a live report, 2026-09-19.) */
export function buildBikeModel(): THREE.Group {
  const bike = new THREE.Group()
  bike.name = 'bikeModel'
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2f5f9e, roughness: 0.5, metalness: 0.3 })
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 })
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xa8adb3, roughness: 0.4, metalness: 0.6 })
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x2a1f18, roughness: 0.8 })

  const wheelRadius = 0.32
  const tireRadius = 0.025
  const axleY = wheelRadius + tireRadius
  const wheelbase = 1.0
  const rear = new THREE.Vector3(-wheelbase / 2, axleY, 0)
  const front = new THREE.Vector3(wheelbase / 2, axleY, 0)

  const tireGeo = new THREE.TorusGeometry(wheelRadius, tireRadius, 8, 24)
  const spokeGeo = new THREE.CylinderGeometry(0.003, 0.003, wheelRadius * 2, 4)
  const hubGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.05, 8)
  for (const axle of [rear, front]) {
    const wheel = new THREE.Group()
    wheel.name = 'wheel'
    wheel.position.copy(axle)
    wheel.add(new THREE.Mesh(tireGeo, tireMat))
    for (let i = 0; i < 3; i++) {
      const spoke = new THREE.Mesh(spokeGeo, metalMat)
      spoke.rotation.z = (i * Math.PI) / 3
      wheel.add(spoke)
    }
    const hub = new THREE.Mesh(hubGeo, metalMat)
    hub.rotation.x = Math.PI / 2
    wheel.add(hub)
    bike.add(wheel)
  }

  const bottomBracket = new THREE.Vector3(-0.08, 0.3, 0)
  const seatTop = new THREE.Vector3(-0.2, 0.78, 0)
  const headTop = new THREE.Vector3(0.34, 0.82, 0)
  const headBottom = new THREE.Vector3(0.385, 0.66, 0)
  const frameR = 0.016
  const frameTubes: [THREE.Vector3, THREE.Vector3][] = [
    [bottomBracket, seatTop], // seat tube
    [seatTop, headTop], // top tube
    [bottomBracket, headBottom], // down tube
    [bottomBracket, rear], // chain stay
    [seatTop, rear], // seat stay
  ]
  for (const [a, b] of frameTubes) bike.add(tube(a, b, frameR, frameMat))
  // Head tube and fork in one line, down to the front axle.
  bike.add(tube(headTop, front, frameR * 0.9, frameMat))

  // Seat post and saddle.
  const postTop = new THREE.Vector3(-0.22, 0.86, 0)
  bike.add(tube(seatTop, postTop, 0.012, metalMat))
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.09), seatMat)
  saddle.position.set(-0.19, 0.88, 0)
  bike.add(saddle)

  // Stem and handlebar (across the bike, along z).
  const stemTop = new THREE.Vector3(0.31, 0.92, 0)
  bike.add(tube(headTop, stemTop, 0.012, metalMat))
  const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.44, 6), metalMat)
  handlebar.rotation.x = Math.PI / 2
  handlebar.position.copy(stemTop)
  bike.add(handlebar)

  // Chainring and a crank with its pedal.
  const chainring = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.008, 14), metalMat)
  chainring.rotation.x = Math.PI / 2
  chainring.position.set(bottomBracket.x, bottomBracket.y, 0.035)
  bike.add(chainring)
  const crankEnd = new THREE.Vector3(bottomBracket.x + 0.06, bottomBracket.y - 0.1, 0.06)
  bike.add(tube(new THREE.Vector3(bottomBracket.x, bottomBracket.y, 0.06), crankEnd, 0.01, metalMat))
  const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.05), seatMat)
  pedal.position.set(crankEnd.x, crankEnd.y, crankEnd.z + 0.02)
  bike.add(pedal)
  return bike
}
